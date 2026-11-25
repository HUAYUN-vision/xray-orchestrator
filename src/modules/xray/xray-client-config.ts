import type { RealityParams } from './xray.service';

/**
 * Private, link-local and carrier-grade NAT ranges: never send them through the VPN.
 * Listed explicitly so this still matches when a client geoip file has no `geoip:private`.
 */
export const PRIVATE_CIDRS = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '100.64.0.0/10',
  '::1/128',
  'fc00::/7',
  'fe80::/10',
];

/**
 * Categories from the geosite.dat shipped with Xray clients (v2fly domain-list-community).
 * `category-ru` includes the Russian TLDs (`.ru`, `.su`, `.рф`, …) and Russian companies
 * on other suffixes. `cn` is the China list, including `.cn`. `private` is local names.
 */
export const DIRECT_GEOSITE = ['geosite:category-ru', 'geosite:cn', 'geosite:private'];

/** Country and private ranges from the client's geoip.dat. */
export const DIRECT_GEOIP = ['geoip:private', 'geoip:ru', 'geoip:cn'];

/** Yandex DNS. Used for Russian names; the address itself is in `geoip:ru`, so the query goes direct. */
const YANDEX_DNS = '77.88.8.8';
/** AliDNS. Used for Chinese names; the address itself is in `geoip:cn`, so the query goes direct. */
const ALIDNS = '223.5.5.5';

export interface ClientConfigInput {
  clientId: string;
  host: string;
  params: RealityParams;
  /** Profile name shown in the client app. */
  label: string;
}

/**
 * Full Xray client config for one server: VLESS + Reality outbound.
 * Russian and Chinese sites and private networks go direct, everything else through the proxy.
 * Understood by Xray-based apps: Happ, v2rayN, v2rayNG, Streisand, V2Box, INCY (xray-json subscriptions).
 * Not by Hiddify: it runs sing-box, see singbox-client-config.ts.
 *
 * Domain lists are not inlined. The client matches `geosite` / `geoip` against the dat files
 * it already updates, so a new `.ru` or `.cn` name is direct without a new subscription build.
 *
 * `domainStrategy` is `IPOnDemand`, not `IPIfNonMatch`: the catch-all at the bottom matches
 * on the first pass, and `IPIfNonMatch` would never resolve the domain to test `geoip:ru` / `geoip:cn`.
 * With `IPOnDemand` the IP rule resolves only after the geosite rule has missed.
 */
export function buildXrayClientConfig(input: ClientConfigInput): Record<string, unknown> {
  const { clientId, host, params, label } = input;
  return {
    remarks: label,
    log: { loglevel: 'warning' },
    dns: {
      queryStrategy: 'UseIPv4',
      serveStale: true,
      servers: [
        {
          address: YANDEX_DNS,
          domains: ['geosite:category-ru'],
          skipFallback: true,
          timeoutMs: 1000,
        },
        {
          address: ALIDNS,
          domains: ['geosite:cn'],
          skipFallback: true,
          timeoutMs: 1000,
        },
        '8.8.8.8',
        '1.1.1.1',
      ],
    },
    inbounds: [
      {
        tag: 'socks-in',
        listen: '127.0.0.1',
        port: 10808,
        protocol: 'socks',
        settings: { udp: true },
        sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'] },
      },
      {
        tag: 'http-in',
        listen: '127.0.0.1',
        port: 10809,
        protocol: 'http',
        sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'] },
      },
    ],
    outbounds: [
      {
        tag: 'proxy',
        protocol: 'vless',
        settings: {
          vnext: [
            {
              address: host,
              port: params.port,
              users: [{ id: clientId, encryption: 'none', flow: 'xtls-rprx-vision' }],
            },
          ],
        },
        streamSettings: {
          network: 'tcp',
          security: 'reality',
          realitySettings: {
            serverName: params.serverName,
            fingerprint: 'firefox',
            publicKey: params.publicKey,
            shortId: params.shortId,
          },
        },
      },
      {
        tag: 'direct',
        protocol: 'freedom',
        streamSettings: { sockopt: { domainStrategy: 'UseIPv4' } },
      },
      { tag: 'block', protocol: 'blackhole' },
    ],
    routing: {
      domainMatcher: 'hybrid',
      domainStrategy: 'IPOnDemand',
      rules: [
        { type: 'field', domain: DIRECT_GEOSITE, outboundTag: 'direct' },
        { type: 'field', ip: [...DIRECT_GEOIP, ...PRIVATE_CIDRS], outboundTag: 'direct' },
        { type: 'field', network: 'tcp,udp', outboundTag: 'proxy' },
      ],
    },
  };
}
