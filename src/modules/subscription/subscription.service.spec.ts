import { Logger } from '@nestjs/common';
import type { AppConfigService } from '../../config/app-config.service';
import type { Env } from '../../config/env.validation';
import type { UserKey } from '../../database/entities';
import type { ServersRepository } from '../../database/repositories/servers.repository';
import type { UserKeysRepository } from '../../database/repositories/user-keys.repository';
import type { XrayService } from '../xray/xray.service';
import { DIRECT_GEOIP, DIRECT_GEOSITE, PRIVATE_CIDRS } from '../xray/xray-client-config';
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

  it('builds a config per server with geosite/geoip direct routing', async () => {
    const configs = (await service.build(KEY_ID))!.body as Record<string, unknown>[];
    expect(configs.map((c) => c.remarks)).toEqual(['🇳🇱 NL', '🇩🇪 DE']);

    const routing = configs[0].routing as {
      domainStrategy: string;
      rules: Record<string, unknown>[];
    };
    expect(routing.domainStrategy).toBe('IPOnDemand');
    expect(routing.rules[0]).toMatchObject({ domain: DIRECT_GEOSITE, outboundTag: 'direct' });
    expect(routing.rules[1]).toMatchObject({
      ip: [...DIRECT_GEOIP, ...PRIVATE_CIDRS],
      outboundTag: 'direct',
    });
    expect(routing.rules.at(-1)).toMatchObject({ network: 'tcp,udp', outboundTag: 'proxy' });

    const dns = configs[0].dns as { queryStrategy: string; servers: { address: string }[] };
    expect(dns.queryStrategy).toBe('UseIPv4');
    expect(dns.servers[0]).toMatchObject({
      address: '77.88.8.8',
      domains: ['geosite:category-ru'],
    });
    expect(dns.servers[1]).toMatchObject({ address: '223.5.5.5', domains: ['geosite:cn'] });
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
      route: {
        rules: Record<string, unknown>[];
        rule_set: Record<string, unknown>[];
        final: string;
      };
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
    expect(config.route.rules[0]).toMatchObject({ ip_cidr: PRIVATE_CIDRS, outbound: 'direct' });
    expect(config.route.rules[1]).toMatchObject({
      rule_set: ['geosite-category-ru', 'geosite-cn', 'geosite-private'],
      outbound: 'direct',
    });
    expect(config.route.rules[2]).toMatchObject({
      rule_set: ['geoip-ru', 'geoip-cn'],
      outbound: 'direct',
    });
    expect(config.route.rule_set.map((set) => set.tag)).toEqual([
      'geosite-category-ru',
      'geosite-cn',
      'geosite-private',
      'geoip-ru',
      'geoip-cn',
    ]);
    expect(config.route.rule_set.every((set) => set.download_detour === 'proxy')).toBe(true);
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
