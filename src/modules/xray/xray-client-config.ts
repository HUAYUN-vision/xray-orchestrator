import {
  ALL_DIRECT_DOMAINS,
  asXrayDomains,
  CN_DIRECT_DOMAINS,
  RU_DIRECT_DOMAINS,
} from './direct-domains';
import type { RealityParams } from './xray.service';

/**
 * Private, link-local and carrier-grade NAT ranges: never send them through the VPN.
 * Inlined so the client does not need `geoip.dat`.
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

export const XRAY_DIRECT_DOMAINS = asXrayDomains(ALL_DIRECT_DOMAINS);
export const XRAY_RU_DNS_DOMAINS = asXrayDomains(RU_DIRECT_DOMAINS);
export const XRAY_CN_DNS_DOMAINS = asXrayDomains(CN_DIRECT_DOMAINS);

/** Yandex DNS. The address is listed in the IP rule so the query goes direct. */
const YANDEX_DNS = '77.88.8.8';
/** AliDNS. The address is listed in the IP rule so the query goes direct. */
const ALIDNS = '223.5.5.5';

export const DIRECT_DNS_IPS = [YANDEX_DNS, ALIDNS];

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
 * Routing uses `domain:ru` / `domain:cn` (the whole zone) plus a short extra list for
 * services on other suffixes. No `geosite:` / `geoip:`: Happ on iOS has a 50 MB tunnel
 * limit and cannot load those dat files.
 *
 * `domainStrategy` is `AsIs`: sniffing already supplies the name, and there is no
 * country-IP rule that would need a lookup.
 */
export function buildXrayClientConfig(input: ClientConfigInput): Record<string, unknown> {
  const { clientId, host, params, label } = input;
  return {
    remarks: label,
    log: { loglevel: 'warning' },
    dns: {
      queryStrategy: 'UseIPv4',
      servers: [
        {
          address: YANDEX_DNS,
          domains: XRAY_RU_DNS_DOMAINS,
          skipFallback: true,
          timeoutMs: 1000,
        },
        {
          address: ALIDNS,
          domains: XRAY_CN_DNS_DOMAINS,
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
      domainStrategy: 'AsIs',
      rules: [
        { type: 'field', domain: XRAY_DIRECT_DOMAINS, outboundTag: 'direct' },
        { type: 'field', ip: [...DIRECT_DNS_IPS, ...PRIVATE_CIDRS], outboundTag: 'direct' },
        { type: 'field', network: 'tcp,udp', outboundTag: 'proxy' },
      ],
    },
  };
}
