import { createHmac } from 'node:crypto';
import type { AppConfigService } from '../../config/app-config.service';
import { PaymentsClient, PaymentsError } from './payments.client';

const KEY = 'k'.repeat(32);
const env: Record<string, unknown> = {
  PAYMENTS_URL: 'http://payments.test',
  PAYMENTS_API_KEY: KEY,
  PAYMENTS_TIMEOUT_MS: 1000,
};
const config = { get: (k: string) => env[k] } as unknown as AppConfigService;
const sign = (ts: string, body: string, key = KEY) =>
  createHmac('sha256', key).update(`${ts}.${body}`).digest('hex');

describe('PaymentsClient', () => {
  const client = new PaymentsClient(config);
  const now = 1_800_000_000_000;
  const ts = String(now / 1000);
  const body = '{"event":"invoice.paid","invoice":{"id":"i1"}}';

  afterEach(() => jest.restoreAllMocks());

  describe('verifyCallback', () => {
    it('accepts the payments-service signature over the raw body', () => {
      expect(client.verifyCallback(Buffer.from(body), ts, sign(ts, body), now)).toBe(true);
    });

    it.each([
      ['another key', sign(ts, body, 'x'.repeat(32)), ts],
      ['changed body', sign(ts, body + ' '), ts],
      ['garbage', 'abc', ts],
      ['no signature', undefined, ts],
      ['no timestamp', sign(ts, body), undefined],
    ])('rejects: %s', (_name, signature, timestamp) => {
      expect(client.verifyCallback(Buffer.from(body), timestamp, signature, now)).toBe(false);
    });

    it('rejects a callback older than 5 minutes (replay)', () => {
      const old = String(now / 1000 - 301);
      expect(client.verifyCallback(Buffer.from(body), old, sign(old, body), now)).toBe(false);
    });

    it('rejects without a raw body', () => {
      expect(client.verifyCallback(undefined, ts, sign(ts, body), now)).toBe(false);
    });
  });

  describe('createInvoice', () => {
    const req = {
      orderId: 'o1',
      provider: 'yookassa' as const,
      amount: 300,
      callbackUrl: 'https://bot.test/api/payments/callback',
    };

    it('posts with the API key and returns the invoice', async () => {
      const invoice = { id: 'i1', paymentUrl: 'https://pay.test/1' };
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(invoice), { status: 201 }));
      await expect(client.createInvoice(req)).resolves.toEqual(invoice);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://payments.test/api/v1/invoices',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'X-API-Key': KEY }) as unknown,
          body: JSON.stringify(req),
        }),
      );
    });

    it('maps a rejected request to PaymentsError', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 400 }));
      await expect(client.createInvoice(req)).rejects.toMatchObject({ reason: 'rejected' });
    });

    it('does not follow a redirect (POST would turn into GET)', async () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(null, {
          status: 301,
          headers: { location: 'https://payments.test/api/v1/invoices' },
        }),
      );
      await expect(client.createInvoice(req)).rejects.toMatchObject({
        reason: 'rejected',
        message: expect.stringContaining('https://payments.test') as unknown,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ redirect: 'manual' }),
      );
    });

    it('maps a network failure to PaymentsError', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
      await expect(client.createInvoice(req)).rejects.toBeInstanceOf(PaymentsError);
    });
  });
});
