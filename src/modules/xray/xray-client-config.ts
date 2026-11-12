import type { RealityParams } from './xray.service';

/** Private and link-local ranges: never send them through the VPN. */
const PRIVATE_CIDRS = [
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

export interface ClientConfigInput {
  clientId: string;
  host: string;
  params: RealityParams;
  /** Profile name shown in the client app. */
  label: string;
  /** Opened directly, bypassing the VPN (each matches the domain and its subdomains). */
  directDomains: readonly string[];
}

/**
 * Full Xray client config for one server: VLESS + Reality outbound and routing
 * that sends `directDomains` and private networks direct, everything else through the proxy.
 * Understood by Happ, v2rayN, Streisand, V2Box, Hiddify, INCY (xray-json subscriptions).
 */
export function buildXrayClientConfig(input: ClientConfigInput): Record<string, unknown> {
  const { clientId, host, params, label, directDomains } = input;
  return {
    remarks: label,
    log: { loglevel: 'warning' },
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
      { tag: 'direct', protocol: 'freedom' },
      { tag: 'block', protocol: 'blackhole' },
    ],
    routing: {
      // AsIs: match by domain from sniffing, no extra DNS lookups.
      domainStrategy: 'AsIs',
      rules: [
        {
          type: 'field',
          domain: directDomains.map((d) => `domain:${d}`),
          outboundTag: 'direct',
        },
        { type: 'field', ip: PRIVATE_CIDRS, outboundTag: 'direct' },
        { type: 'field', network: 'tcp,udp', outboundTag: 'proxy' },
      ],
    },
  };
}
