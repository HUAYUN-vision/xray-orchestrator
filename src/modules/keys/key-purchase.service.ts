import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import type { Transaction, UserKey } from '../../database/entities';
import type { Currency } from '../../database/enums';
import { ServersRepository } from '../../database/repositories/servers.repository';
import { TariffsRepository } from '../../database/repositories/tariffs.repository';
import {
  type KeyPayment,
  UserKeysRepository,
} from '../../database/repositories/user-keys.repository';
import { ExchangeRatesService } from '../rates/exchange-rates.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { XrayService } from '../xray/xray.service';

const DAY_MS = 24 * 60 * 60 * 1000;

export class KeyPurchaseError extends Error {
  constructor(
    readonly reason: 'tariff_not_found' | 'no_servers' | 'creation_failed',
    detail?: string,
  ) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = 'KeyPurchaseError';
  }
}

export interface PurchaseRequest {
  userId: number;
  tariffId: string;
  /** Balance to pay from; the price is converted if the tariff is in another currency. */
  currency: Currency;
  /** Balance seqno shown to the user (protects from double taps). */
  expectedSeqno?: number;
}

export interface PurchaseResult {
  key: UserKey;
  subscriptionUrl: string;
  /** `null` for a free tariff. */
  payment: Transaction | null;
  /** Servers the key could not be added to now; the sync job adds it later. */
  failedServers: string[];
}

/**
 * Buying a key: price → conversion → debit + key row (one DB transaction) →
 * client on every enabled server. Succeeds if at least one server accepted the key;
 * if none did, the key is removed and the money returned.
 *
 * Errors: KeyPurchaseError, InsufficientFundsError, StaleBalanceError, RatesUnavailableError.
 */
@Injectable()
export class KeyPurchaseService {
  private readonly logger = new Logger(KeyPurchaseService.name);

  constructor(
    private readonly tariffs: TariffsRepository,
    private readonly servers: ServersRepository,
    private readonly keys: UserKeysRepository,
    private readonly rates: ExchangeRatesService,
    private readonly xray: XrayService,
    private readonly subscription: SubscriptionService,
  ) {}

  async purchase(req: PurchaseRequest): Promise<PurchaseResult> {
    const tariff = await this.tariffs.findActiveById(req.tariffId);
    if (!tariff) throw new KeyPurchaseError('tariff_not_found', req.tariffId);

    const servers = await this.servers.findEnabled();
    if (servers.length === 0) throw new KeyPurchaseError('no_servers');

    const keyId = randomUUID();
    // Fails before charging if PUBLIC_URL is not configured.
    const subscriptionUrl = this.subscription.buildUrl(keyId);

    const { key, payment } = await this.keys.createPaid(
      {
        id: keyId,
        userId: req.userId,
        tariffId: tariff.id,
        expiresAt: new Date(Date.now() + tariff.durationDays * DAY_MS),
        trafficLimit: tariff.trafficLimit,
      },
      await this.priceIn(tariff, req),
    );

    const results = await Promise.allSettled(servers.map((s) => this.xray.addClient(s, keyId)));
    const failedServers: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        failedServers.push(servers[i].code);
        this.logger.warn(`Key ${keyId} not added to ${servers[i].code}: ${String(r.reason)}`);
      }
    });

    if (failedServers.length === servers.length) {
      await this.keys.cancelPaid(keyId, payment, 'creation_failed');
      throw new KeyPurchaseError('creation_failed', `no server accepted key ${keyId}`);
    }

    this.logger.log(
      `User ${req.userId} bought key ${keyId} (tariff ${tariff.id}` +
        (payment ? `, ${payment.amount} ${payment.currency})` : ', free)'),
    );
    return { key, subscriptionUrl, payment, failedServers };
  }

  /** What to charge, in the balance currency. `null` — free tariff, nothing to charge. */
  private async priceIn(
    tariff: { price: string; currency: Currency },
    req: PurchaseRequest,
  ): Promise<KeyPayment | null> {
    if (new BigNumber(tariff.price).isZero()) return null;
    const base = { currency: req.currency, expectedSeqno: req.expectedSeqno };
    if (tariff.currency === req.currency) return { ...base, amount: tariff.price };

    // Rounded up: a converted price never comes out below the tariff price.
    const conv = await this.rates.convert(tariff.price, tariff.currency, req.currency, 'up');
    return {
      ...base,
      amount: conv.amount,
      price: { amount: tariff.price, currency: tariff.currency, rate: conv.rate },
    };
  }
}
