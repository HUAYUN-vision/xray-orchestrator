import { Logger } from '@nestjs/common';
import type { AppConfigService } from '../../config/app-config.service';
import type { Env } from '../../config/env.validation';
import type { UserKey } from '../../database/entities';
import type { ServersRepository } from '../../database/repositories/servers.repository';
import type { UserKeysRepository } from '../../database/repositories/user-keys.repository';
import type { XrayService } from '../xray/xray.service';
import { DIRECT_DOMAINS } from './domains';
import { SubscriptionService, serverLabel } from './subscription.service';

const KEY_ID = '0b3f2c1e-8a7d-4c3b-9e2f-1a2b3c4d5e6f';
const params = { publicKey: 'PK', serverName: 'www.cloudflare.com', port: 443, shortId: 'ab' };
const server = (code: string) => ({ code, host: `${code}.example.com`, apiPort: 440, apiKey: 'k' });

describe('SubscriptionService', () => {
  const key = {
    id: KEY_ID,
    trafficUsed: 1024,
    trafficLimit: null,
    expiresAt: new Date('2027-01-01T00:00:00Z'),
  } as UserKey;
  const findActive = jest.fn();
  const findEnabled = jest.fn();
  const getRealityParams = jest.fn();
  const env: Partial<Env> = { PUBLIC_URL: 'https://bot.example.com', GLOBAL_PREFIX: 'api' };

  const service = new SubscriptionService(
    { findActive } as unknown as UserKeysRepository,
    { findEnabled } as unknown as ServersRepository,
    { getRealityParams } as unknown as XrayService,
    { get: (k: keyof Env) => env[k] } as AppConfigService,
  );

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    jest.resetAllMocks();
    findActive.mockResolvedValue(key);
    findEnabled.mockResolvedValue([server('nl'), server('de')]);
    getRealityParams.mockResolvedValue(params);
  });

  it('returns null for an unknown or inactive key', async () => {
    findActive.mockResolvedValue(null);
    await expect(service.build(KEY_ID)).resolves.toBeNull();
  });

  it('builds a config per server with direct routing for the domain lists', async () => {
    const sub = await service.build(KEY_ID);
    expect(sub!.configs.map((c) => c.remarks)).toEqual(['🇳🇱 NL', '🇩🇪 DE']);

    const rules = (sub!.configs[0].routing as { rules: Record<string, unknown>[] }).rules;
    expect(rules[0]).toMatchObject({ outboundTag: 'direct' });
    expect(rules[0].domain).toEqual(
      expect.arrayContaining(['domain:gosuslugi.ru', 'domain:qq.com']),
    );
    expect((rules[0].domain as string[]).length).toBe(DIRECT_DOMAINS.length);
    expect(rules.at(-1)).toMatchObject({ network: 'tcp,udp', outboundTag: 'proxy' });
  });

  it('skips unreachable servers instead of failing', async () => {
    getRealityParams.mockImplementation((s: { code: string }) =>
      s.code === 'de' ? Promise.reject(new Error('timeout')) : Promise.resolve(params),
    );
    const sub = await service.build(KEY_ID);
    expect(sub!.configs).toHaveLength(1);
  });

  it('reports traffic and expiry for client apps', async () => {
    const sub = await service.build(KEY_ID);
    expect(sub!.userInfo).toBe('upload=0; download=1024; total=0; expire=1798761600');
  });

  it('builds the public URL', () => {
    expect(service.buildUrl(KEY_ID)).toBe(`https://bot.example.com/api/sub/${KEY_ID}`);
  });
});

describe('serverLabel', () => {
  it.each([
    ['nl', '🇳🇱 NL'],
    ['DE', '🇩🇪 DE'],
    ['eu-1', 'EU-1'],
  ])('%p → %p', (code, label) => {
    expect(serverLabel(code)).toBe(label);
  });
});

describe('DIRECT_DOMAINS', () => {
  it('has no duplicates or malformed entries', () => {
    expect(new Set(DIRECT_DOMAINS).size).toBe(DIRECT_DOMAINS.length);
    for (const d of DIRECT_DOMAINS) expect(d).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
  });
});
