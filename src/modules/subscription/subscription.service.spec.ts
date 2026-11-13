import { Logger } from '@nestjs/common';
import type { AppConfigService } from '../../config/app-config.service';
import type { Env } from '../../config/env.validation';
import type { UserKey } from '../../database/entities';
import type { ServersRepository } from '../../database/repositories/servers.repository';
import type { UserKeysRepository } from '../../database/repositories/user-keys.repository';
import type { XrayService } from '../xray/xray.service';
import { DIRECT_DOMAINS } from './domains';
import { detectFormat, SubscriptionService, serverLabel } from './subscription.service';

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
    const configs = (await service.build(KEY_ID))!.body as Record<string, unknown>[];
    expect(configs.map((c) => c.remarks)).toEqual(['🇳🇱 NL', '🇩🇪 DE']);

    const rules = (configs[0].routing as { rules: Record<string, unknown>[] }).rules;
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
    expect(sub!.body).toHaveLength(1);
  });

  it('singbox: one config with all servers, auto-select and direct routing', async () => {
    const config = (await service.build(KEY_ID, 'singbox'))!.body as {
      outbounds: Record<string, unknown>[];
      route: { rules: Record<string, unknown>[]; final: string };
    };
    expect(config.outbounds[0]).toMatchObject({
      type: 'selector',
      tag: 'proxy',
      outbounds: ['auto', '🇳🇱 NL', '🇩🇪 DE'],
    });
    expect(config.outbounds[1]).toMatchObject({ type: 'urltest', outbounds: ['🇳🇱 NL', '🇩🇪 DE'] });
    expect(config.outbounds[2]).toMatchObject({
      type: 'vless',
      tag: '🇳🇱 NL',
      server: 'nl.example.com',
      server_port: 443,
      uuid: KEY_ID,
      flow: 'xtls-rprx-vision',
      tls: {
        server_name: 'www.cloudflare.com',
        reality: { enabled: true, public_key: 'PK', short_id: 'ab' },
      },
    });
    expect(config.route.rules[0]).toMatchObject({ outbound: 'direct' });
    expect(config.route.rules[0].domain_suffix).toHaveLength(DIRECT_DOMAINS.length);
    expect(config.route.final).toBe('proxy');
  });

  it('reports traffic and expiry for client apps', async () => {
    const sub = await service.build(KEY_ID);
    expect(sub!.userInfo).toBe('upload=0; download=1024; total=0; expire=1798761600');
  });

  it('builds the public URL', () => {
    expect(service.buildUrl(KEY_ID)).toBe(`https://bot.example.com/api/sub/${KEY_ID}`);
  });
});

describe('detectFormat', () => {
  it.each([
    ['HiddifyNext/2.5.7 (android) like ClashMeta v2ray sing-box', 'singbox'],
    ['Hiddify/1.0', 'singbox'],
    ['v2rayNG/1.9.16', 'xray'],
    ['Happ/1.0', 'xray'],
    [undefined, 'xray'],
  ])('%p → %p', (ua, format) => {
    expect(detectFormat(ua)).toBe(format);
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
