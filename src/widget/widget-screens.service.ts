import { Injectable, Logger } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { InsufficientFundsError, StaleBalanceError } from '../database/balance-ops';
import type { BalanceAccount, UserKey } from '../database/entities';
import { Currency, UserKeyStatus } from '../database/enums';
import { BalanceRepository } from '../database/repositories/balance.repository';
import { TariffsRepository } from '../database/repositories/tariffs.repository';
import { UserKeysRepository } from '../database/repositories/user-keys.repository';
import { KeyPurchaseError, KeyPurchaseService } from '../modules/keys/key-purchase.service';
import { RatesUnavailableError } from '../modules/rates/exchange-rates.service';
import { SubscriptionService } from '../modules/subscription/subscription.service';
import type {
  Balances,
  HomeState,
  KeyState,
  PayState,
  TariffsState,
  WidgetCommand,
  WidgetMessage,
  WidgetState,
} from './widget-state';

/** Lists are capped: chat_data is 1 KB and the bubble is at most 600 px high, without scrolling. */
const MAX_KEYS = 6;
const MAX_TARIFFS = 6;

/** Builds widget screens and runs widget commands for a user. */
@Injectable()
export class WidgetScreensService {
  private readonly logger = new Logger(WidgetScreensService.name);

  constructor(
    private readonly balances: BalanceRepository,
    private readonly tariffs: TariffsRepository,
    private readonly keys: UserKeysRepository,
    private readonly purchase: KeyPurchaseService,
    private readonly subscription: SubscriptionService,
  ) {}

  /** Runs a command and returns the next screen; failures become a message on a screen. */
  async execute(userId: string, cmd: WidgetCommand): Promise<WidgetState> {
    try {
      switch (cmd.c) {
        case 'home':
          return await this.home(userId);
        case 'tariffs':
          return await this.tariffList();
        case 'pay':
          return await this.pay(userId, cmd.tariffId);
        case 'key':
        case 'link':
          return await this.key(userId, cmd.keyId);
        case 'buy':
          return await this.buy(userId, cmd);
      }
    } catch (err) {
      this.logger.error(`Widget command ${cmd.c} failed for user ${userId}: ${String(err)}`);
      return this.home(userId, 'err');
    }
  }

  async home(userId: string, m?: WidgetMessage): Promise<HomeState> {
    const [account, keys] = await Promise.all([
      this.balances.findByUserId(userId),
      this.keys.findByUser(userId, MAX_KEYS),
    ]);
    const now = Date.now();
    return {
      s: 'h',
      n: now,
      m,
      b: balances(account),
      k: keys.map((k) => [k.id, unix(k.expiresAt), isActive(k, now) ? 1 : 0]),
    };
  }

  private async tariffList(m?: WidgetMessage): Promise<TariffsState> {
    const list = await this.tariffs.findActive();
    return {
      s: 'b',
      n: Date.now(),
      m,
      t: list
        .slice(0, MAX_TARIFFS)
        .map((t) => [t.id, t.durationDays, trimZeros(t.price), t.currency]),
    };
  }

  private async pay(
    userId: string,
    tariffId: string,
    m?: WidgetMessage,
  ): Promise<PayState | TariffsState> {
    const [tariff, account] = await Promise.all([
      this.tariffs.findActiveById(tariffId),
      this.balances.findByUserId(userId),
    ]);
    if (!tariff) return this.tariffList('tariff');
    const quotes = await this.purchase.quote(tariff);
    return {
      s: 't',
      n: Date.now(),
      m,
      i: tariff.id,
      d: tariff.durationDays,
      q: account?.seqno ?? 0,
      b: balances(account),
      o: quotes.map((q) => [q.currency, q.amount]),
    };
  }

  /** Key screen; a missing or foreign key goes home with "gone". */
  async key(userId: string, keyId: string, m?: WidgetMessage): Promise<KeyState | HomeState> {
    const key = await this.keys.findOwned(keyId, userId);
    if (!key) return this.home(userId, 'gone');
    const active = isActive(key, Date.now());
    return {
      s: 'k',
      n: Date.now(),
      m,
      i: key.id,
      e: unix(key.expiresAt),
      a: active ? 1 : 0,
      u: active && this.buildUrl(key.id) ? 1 : undefined,
    };
  }

  /** Subscription URL of the user's active key; `null` if unavailable. */
  async subscriptionUrl(userId: string, keyId: string): Promise<string | null> {
    const key = await this.keys.findOwned(keyId, userId);
    if (!key || !isActive(key, Date.now())) return null;
    return this.buildUrl(key.id);
  }

  /** `null` if PUBLIC_URL is not set. */
  private buildUrl(keyId: string): string | null {
    try {
      return this.subscription.buildUrl(keyId);
    } catch (err) {
      this.logger.warn(String(err));
      return null;
    }
  }

  private async buy(
    userId: string,
    cmd: Extract<WidgetCommand, { c: 'buy' }>,
  ): Promise<WidgetState> {
    try {
      const res = await this.purchase.purchase({
        userId,
        tariffId: cmd.tariffId,
        currency: cmd.currency,
        expectedSeqno: cmd.seqno,
        expectedAmount: cmd.amount,
      });
      return await this.key(userId, res.key.id, 'ok');
    } catch (err) {
      const m = purchaseMessage(err);
      if (!m) throw err;
      if (m === 'tariff') return this.tariffList(m);
      return this.pay(userId, cmd.tariffId, m);
    }
  }
}

function purchaseMessage(err: unknown): WidgetMessage | null {
  if (err instanceof InsufficientFundsError) return 'funds';
  if (err instanceof StaleBalanceError) return 'stale';
  if (err instanceof RatesUnavailableError) return 'rates';
  if (err instanceof KeyPurchaseError) {
    switch (err.reason) {
      case 'tariff_not_found':
        return 'tariff';
      case 'no_servers':
        return 'srv';
      case 'creation_failed':
        return 'fail';
      case 'price_changed':
        return 'price';
    }
  }
  return null;
}

/** Balances with 2 decimals, rounded down: never show more than the user has. */
function balances(account: BalanceAccount | null): Balances {
  const out = {} as Balances;
  for (const c of Object.values(Currency)) {
    out[c] = new BigNumber(account?.[c] ?? 0).decimalPlaces(2, BigNumber.ROUND_DOWN).toFixed(2);
  }
  return out;
}

function trimZeros(amount: string): string {
  return new BigNumber(amount).toFixed();
}

function unix(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function isActive(key: UserKey, now: number): boolean {
  return key.status === UserKeyStatus.Active && key.expiresAt.getTime() > now;
}
