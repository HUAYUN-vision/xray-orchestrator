import { Injectable, Logger } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { AppConfigService } from '../../config/app-config.service';
import type { DepositMeta, Transaction } from '../../database/entities';
import { Currency } from '../../database/enums';
import { BalanceRepository } from '../../database/repositories/balance.repository';
import {
  type CallbackPayload,
  type PaymentProvider,
  PaymentsClient,
  PaymentsError,
} from './payments.client';

/** Each top-up currency has exactly one provider at payments-service. */
const PROVIDERS: Partial<Record<Currency, { provider: PaymentProvider; currency: string }>> = {
  [Currency.RUB]: { provider: 'yookassa', currency: 'RUB' },
  [Currency.CNY]: { provider: 'wechat', currency: 'CNY' },
};

/** A repeated tap within this time reuses the unpaid invoice instead of creating another one. */
const REUSE_MS = 30 * 60_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class TopUpError extends Error {
  constructor(
    readonly reason: 'disabled' | 'amount' | 'provider',
    detail?: string,
  ) {
    super(detail ?? reason);
    this.name = 'TopUpError';
  }
}

/** Range of a custom amount, major units as strings. */
export interface AmountLimits {
  min: string;
  max: string;
}

export interface TopUpRequest {
  userId: string;
  currency: Currency;
  amount: string;
  /** Shown to the payer by the provider, up to 127 chars. */
  description: string;
  /** Where YooKassa sends the payer back after paying (http/https/tg). */
  returnUrl?: string;
  messageId?: number;
  locale?: string;
}

export interface TopUpInvoice {
  depositId: string;
  provider: PaymentProvider;
  currency: Currency;
  amount: string;
  paymentUrl: string;
}

export interface PaidDeposit {
  userId: string;
  currency: Currency;
  amount: string;
  meta: Partial<DepositMeta>;
}

export type PaidListener = (deposit: PaidDeposit) => Promise<void> | void;

/**
 * Balance top-up through payments-service (D20).
 * A top-up is a `pending` deposit transaction; its id is the invoice `orderId`.
 * The callback credits the balance once: only a `pending` deposit is applied.
 */
@Injectable()
export class TopUpService {
  private readonly logger = new Logger(TopUpService.name);
  private readonly listeners: PaidListener[] = [];

  constructor(
    private readonly config: AppConfigService,
    private readonly client: PaymentsClient,
    private readonly balances: BalanceRepository,
  ) {}

  /** Currencies and amounts to offer; empty if top-up is off. */
  presets(): [Currency, string[]][] {
    if (!this.client.enabled) return [];
    const list: [Currency, string[]][] = [
      [Currency.RUB, this.config.get('TOPUP_PRESETS_RUB')],
      [Currency.CNY, this.config.get('TOPUP_PRESETS_CNY')],
    ];
    return list.filter(([, amounts]) => amounts.length > 0);
  }

  /** Range of a custom amount; `null` if the currency is not offered. */
  limits(currency: Currency): AmountLimits | null {
    if (!this.presets().some(([c]) => c === currency)) return null;
    if (currency === Currency.RUB) {
      return { min: this.config.get('TOPUP_MIN_RUB'), max: this.config.get('TOPUP_MAX_RUB') };
    }
    if (currency === Currency.CNY) {
      return { min: this.config.get('TOPUP_MIN_CNY'), max: this.config.get('TOPUP_MAX_CNY') };
    }
    return null;
  }

  /** Called after a deposit is paid (once per deposit); errors are logged, not thrown. */
  onPaid(listener: PaidListener): void {
    this.listeners.push(listener);
  }

  async create(req: TopUpRequest): Promise<TopUpInvoice> {
    if (!this.client.enabled) throw new TopUpError('disabled');
    const target = PROVIDERS[req.currency];
    const amount = this.acceptedAmount(req.currency, req.amount);
    if (!target || !amount) throw new TopUpError('amount', `${req.amount} ${req.currency}`);

    const since = new Date(Date.now() - REUSE_MS);
    const recent = await this.balances.findReusableDeposit(req.userId, req.currency, amount, since);
    if (recent) return this.toInvoice(recent, target.provider);

    const deposit = await this.balances.createDeposit({
      userId: req.userId,
      currency: req.currency,
      amount,
      meta: {
        provider: target.provider,
        messageId: req.messageId,
        locale: req.locale,
      },
    });
    try {
      const invoice = await this.client.createInvoice({
        orderId: deposit.id,
        provider: target.provider,
        amount: Number(amount),
        description: req.description.slice(0, 127),
        callbackUrl: this.callbackUrl(),
        ...(target.provider === 'yookassa' && { returnUrl: req.returnUrl }),
      });
      const paymentUrl = invoice.paymentUrl!;
      await this.balances.updateDepositMeta(deposit.id, { paymentId: invoice.id, paymentUrl });
      this.logger.log(`Top-up ${deposit.id}: ${amount} ${req.currency} via ${target.provider}`);
      return {
        depositId: deposit.id,
        provider: target.provider,
        currency: req.currency,
        amount,
        paymentUrl,
      };
    } catch (err) {
      await this.balances.failDeposit(deposit.id);
      if (err instanceof PaymentsError) throw new TopUpError('provider', err.message);
      throw err;
    }
  }

  /**
   * Handles a verified callback. Throws only on DB errors, so payments-service retries;
   * anything that will never succeed (unknown order, amount mismatch) is logged and acknowledged.
   */
  async handleCallback({ event, invoice }: CallbackPayload): Promise<void> {
    const depositId = invoice.orderId ?? '';
    if (!UUID_RE.test(depositId)) {
      this.logger.warn(`Callback for unknown order ${depositId} (invoice ${invoice.id})`);
      return;
    }

    if (event === 'invoice.canceled') {
      const res = await this.balances.failDeposit(depositId);
      if (res?.applied) this.logger.log(`Top-up ${depositId} canceled`);
      return;
    }
    if (event !== 'invoice.paid' || invoice.status !== 'paid') {
      this.logger.warn(`Unexpected callback ${event}/${invoice.status} for ${depositId}`);
      return;
    }

    const deposit = await this.balances.findDeposit(depositId);
    if (!deposit) {
      this.logger.warn(`Callback for unknown deposit ${depositId} (invoice ${invoice.id})`);
      return;
    }
    const expected = PROVIDERS[deposit.currency];
    if (
      expected?.provider !== invoice.provider ||
      expected.currency !== invoice.currency ||
      !new BigNumber(deposit.amount).eq(invoice.amount)
    ) {
      // Never credit what was not ordered; needs a manual look.
      this.logger.error(
        `Top-up ${depositId} mismatch: ordered ${deposit.amount} ${deposit.currency}, ` +
          `paid ${invoice.amount} ${invoice.currency} via ${invoice.provider} (invoice ${invoice.id})`,
      );
      return;
    }

    const res = await this.balances.completeDeposit(depositId, { paymentId: invoice.id });
    if (!res?.applied) return;
    this.logger.log(`Top-up ${depositId} paid: ${trimZeros(deposit.amount)} ${deposit.currency}`);
    await this.notify(res.deposit);
  }

  private async notify(deposit: Transaction): Promise<void> {
    const paid: PaidDeposit = {
      userId: deposit.userId,
      currency: deposit.currency,
      amount: trimZeros(deposit.amount),
      meta: (deposit.meta ?? {}) as Partial<DepositMeta>,
    };
    for (const listener of this.listeners) {
      try {
        await listener(paid);
      } catch (err) {
        this.logger.warn(`Paid notification failed for ${deposit.id}: ${String(err)}`);
      }
    }
  }

  /** A preset or a custom amount within the limits, normalized (`150.50` → `150.5`). */
  private acceptedAmount(currency: Currency, raw: string): string | null {
    if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(raw)) return null;
    const value = new BigNumber(raw);
    const preset = this.presets()
      .find(([c]) => c === currency)?.[1]
      .find((a) => value.eq(a));
    if (preset) return preset;
    const limits = this.limits(currency);
    if (!limits || value.lt(limits.min) || value.gt(limits.max)) return null;
    return value.toFixed();
  }

  private toInvoice(deposit: Transaction, provider: PaymentProvider): TopUpInvoice {
    return {
      depositId: deposit.id,
      provider,
      currency: deposit.currency,
      amount: trimZeros(deposit.amount),
      paymentUrl: (deposit.meta as DepositMeta).paymentUrl!,
    };
  }

  private callbackUrl(): string {
    const base = this.config.get('PUBLIC_URL');
    return new URL(`${this.config.get('GLOBAL_PREFIX')}/payments/callback`, `${base}/`).toString();
  }
}

/** `300.00000000` → `300`, `99.50000000` → `99.5`. */
function trimZeros(amount: string): string {
  return new BigNumber(amount).toFixed();
}
