import { Logger } from '@nestjs/common';
import type { AppConfigService } from '../../config/app-config.service';
import type { Env } from '../../config/env.validation';
import type { UserKey } from '../../database/entities';
import type { ServersRepository } from '../../database/repositories/servers.repository';
import type { UserKeysRepository } from '../../database/repositories/user-keys.repository';
import type { XrayService } from '../xray/xray.service';
import { SINGBOX_DIRECT_SUFFIXES } from '../xray/singbox-client-config';
import {
  DIRECT_DNS_IPS,
  PRIVATE_CIDRS,
  XRAY_CN_DNS_DOMAINS,
  XRAY_DIRECT_DOMAINS,
  XRAY_RU_DNS_DOMAINS,
} from '../xray/xray-client-config';
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

  it('builds a config per server with TLD/extra direct routing and no geo files', async () => {
    const configs = (await service.build(KEY_ID))!.body as Record<string, unknown>[];
    expect(configs.map((c) => c.remarks)).toEqual(['🇳🇱 NL', '🇩🇪 DE']);
    expect(JSON.stringify(configs)).not.toMatch(/geosite:|geoip:/);

    const routing = configs[0].routing as {
      domainStrategy: string;
      rules: Record<string, unknown>[];
    };
    expect(routing.domainStrategy).toBe('AsIs');
    expect(routing.rules[0]).toMatchObject({ domain: XRAY_DIRECT_DOMAINS, outboundTag: 'direct' });
    expect(routing.rules[1]).toMatchObject({
      ip: [...DIRECT_DNS_IPS, ...PRIVATE_CIDRS],
      outboundTag: 'direct',
    });
    expect(routing.rules.at(-1)).toMatchObject({ network: 'tcp,udp', outboundTag: 'proxy' });

    const dns = configs[0].dns as { queryStrategy: string; servers: { address: string }[] };
    expect(dns.queryStrategy).toBe('UseIPv4');
    expect(dns.servers[0]).toMatchObject({ address: '77.88.8.8', domains: XRAY_RU_DNS_DOMAINS });
    expect(dns.servers[1]).toMatchObject({ address: '223.5.5.5', domains: XRAY_CN_DNS_DOMAINS });
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
        rule_set?: Record<string, unknown>[];
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
    expect(JSON.stringify(config)).not.toMatch(/geosite|geoip|rule_set/);
    expect(config.route.rules[0]).toMatchObject({ ip_cidr: PRIVATE_CIDRS, outbound: 'direct' });
    expect(config.route.rules[1]).toMatchObject({
      domain_suffix: SINGBOX_DIRECT_SUFFIXES,
      outbound: 'direct',
    });
    expect(config.route.rule_set).toBeUndefined();
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
