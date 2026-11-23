import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';

export type PaymentProvider = 'yookassa' | 'wechat';

/** Invoice as payments-service returns it in responses and callbacks. */
export interface Invoice {
  id: string;
  orderId: string | null;
  provider: PaymentProvider;
  status: 'pending' | 'paid' | 'canceled';
  /** Major units (rubles / yuan), up to 2 decimals. */
  amount: number;
  currency: string;
  /** yookassa — payment page, wechat — `weixin://wxpay/...` for a QR code. */
  paymentUrl: string | null;
}

export interface CreateInvoiceRequest {
  orderId: string;
  provider: PaymentProvider;
  amount: number;
  description?: string;
  callbackUrl: string;
  /** Where the payer returns after paying; required for yookassa, ignored for wechat. */
  returnUrl?: string;
}

export interface CallbackPayload {
  event: 'invoice.paid' | 'invoice.canceled';
  invoice: Invoice;
}

export class PaymentsError extends Error {
  constructor(
    readonly reason: 'disabled' | 'unreachable' | 'rejected' | 'bad_response',
    detail: string,
  ) {
    super(`payments-service ${reason}: ${detail}`);
    this.name = 'PaymentsError';
  }
}

/** Callbacks older than this are rejected: a captured request cannot be replayed later. */
const MAX_CALLBACK_AGE_S = 300;

/**
 * Client for HUAYUN-vision/payments-service (D20): creates invoices and checks the
 * signature of its callbacks: `hex(HMAC-SHA256(apiKey, timestamp + "." + rawBody))`.
 */
@Injectable()
export class PaymentsClient {
  private readonly logger = new Logger(PaymentsClient.name);

  constructor(private readonly config: AppConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.get('PAYMENTS_URL') && this.config.get('PAYMENTS_API_KEY'));
  }

  /** Idempotent by `orderId`: a repeated request returns the same invoice. */
  async createInvoice(req: CreateInvoiceRequest): Promise<Invoice> {
    const base = this.config.get('PAYMENTS_URL');
    const key = this.config.get('PAYMENTS_API_KEY');
    if (!base || !key) throw new PaymentsError('disabled', 'PAYMENTS_URL is not set');

    let res: Response;
    try {
      res = await fetch(`${base}/api/v1/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
        body: JSON.stringify(req),
        // A redirect (e.g. http → https) would be followed as GET without the body.
        redirect: 'manual',
        signal: AbortSignal.timeout(this.config.get('PAYMENTS_TIMEOUT_MS')),
      });
    } catch (err) {
      throw new PaymentsError('unreachable', String(err));
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location') ?? '?';
      this.logger.error(`payments-service redirects to ${location}: fix PAYMENTS_URL`);
      throw new PaymentsError('rejected', `redirect ${res.status} to ${location}`);
    }
    const body = await res.text();
    if (res.status === 401) {
      this.logger.error(
        'payments-service: invalid api key. PAYMENTS_API_KEY is the key only, ' +
          'without the "project:" part of API_KEYS',
      );
    }
    if (!res.ok) {
      this.logger.warn(`Invoice ${req.orderId} rejected (${res.status}): ${body.slice(0, 300)}`);
      throw new PaymentsError('rejected', `${res.status} ${body.slice(0, 300)}`);
    }
    try {
      const invoice = JSON.parse(body) as Invoice;
      if (typeof invoice.id === 'string' && typeof invoice.paymentUrl === 'string') return invoice;
    } catch {
      // fall through
    }
    throw new PaymentsError('bad_response', body.slice(0, 200));
  }

  /** Checks the callback headers against the raw body. */
  verifyCallback(
    rawBody: Buffer | undefined,
    timestamp: string | undefined,
    signature: string | undefined,
    now = Date.now(),
  ): boolean {
    const key = this.config.get('PAYMENTS_API_KEY');
    if (!key || !rawBody || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
    if (Math.abs(now / 1000 - Number(timestamp)) > MAX_CALLBACK_AGE_S) return false;

    const expected = createHmac('sha256', key)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
