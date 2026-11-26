import {
  buildXrayClientConfig,
  DIRECT_DNS_IPS,
  PRIVATE_CIDRS,
  XRAY_CN_DNS_DOMAINS,
  XRAY_DIRECT_DOMAINS,
  XRAY_RU_DNS_DOMAINS,
} from './xray-client-config';

const params = { publicKey: 'PK', serverName: 'www.cloudflare.com', port: 443, shortId: 'ab' };

describe('buildXrayClientConfig', () => {
  const config = buildXrayClientConfig({
    clientId: 'client-id',
    host: 'nl.example.com',
    params,
    label: '🇳🇱 NL',
  });

  it('sends RU/CN zones and extras direct without geosite or geoip', () => {
    const json = JSON.stringify(config);
    expect(json).not.toMatch(/geosite:/);
    expect(json).not.toMatch(/geoip:/);

    const routing = config.routing as {
      domainStrategy: string;
      rules: Record<string, unknown>[];
    };
    expect(routing.domainStrategy).toBe('AsIs');
    expect(routing.rules[0]).toMatchObject({
      domain: XRAY_DIRECT_DOMAINS,
      outboundTag: 'direct',
    });
    expect(routing.rules[1]).toMatchObject({
      ip: [...DIRECT_DNS_IPS, ...PRIVATE_CIDRS],
      outboundTag: 'direct',
    });
    expect(routing.rules.at(-1)).toMatchObject({ network: 'tcp,udp', outboundTag: 'proxy' });
    expect(XRAY_DIRECT_DOMAINS).toEqual(
      expect.arrayContaining(['domain:ru', 'domain:cn', 'domain:vk.com']),
    );
  });

  it('resolves RU names via Yandex and CN names via AliDNS', () => {
    const dns = config.dns as { queryStrategy: string; servers: Record<string, unknown>[] };
    expect(dns.queryStrategy).toBe('UseIPv4');
    expect(dns.servers[0]).toMatchObject({
      address: '77.88.8.8',
      domains: XRAY_RU_DNS_DOMAINS,
      skipFallback: true,
    });
    expect(dns.servers[1]).toMatchObject({
      address: '223.5.5.5',
      domains: XRAY_CN_DNS_DOMAINS,
      skipFallback: true,
    });
  });
});
