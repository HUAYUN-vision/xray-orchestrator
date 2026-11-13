import { PRIVATE_CIDRS } from './xray-client-config';
import type { RealityParams } from './xray.service';

export interface SingboxServer {
  /** Outbound tag, shown as the server name in the client app. */
  label: string;
  host: string;
  params: RealityParams;
}

export interface SingboxConfigInput {
  clientId: string;
  servers: SingboxServer[];
  /** Opened directly, bypassing the VPN (each matches the domain and its subdomains). */
  directDomains: readonly string[];
}

/**
 * sing-box client config for Hiddify (it runs sing-box and rejects xray-json).
 * One config with all servers: a selector with automatic choice by latency (urltest),
 * direct routing for `directDomains` and private networks.
 * No inbounds/dns: Hiddify builds them from its own settings (TUN/proxy mode, DNS).
 * Route rules use the `outbound` field, not `action`: older sing-box cores in Hiddify understand it.
 */
export function buildSingboxClientConfig(input: SingboxConfigInput): Record<string, unknown> {
  const { clientId, servers, directDomains } = input;
  const tags = servers.map((s) => s.label);
  return {
    log: { level: 'warn' },
    outbounds: [
      { type: 'selector', tag: 'proxy', outbounds: ['auto', ...tags], default: 'auto' },
      {
        type: 'urltest',
        tag: 'auto',
        outbounds: tags,
        url: 'https://www.gstatic.com/generate_204',
        interval: '10m',
      },
      ...servers.map((s) => ({
        type: 'vless',
        tag: s.label,
        server: s.host,
        server_port: s.params.port,
        uuid: clientId,
        flow: 'xtls-rprx-vision',
        packet_encoding: 'xudp',
        tls: {
          enabled: true,
          server_name: s.params.serverName,
          utls: { enabled: true, fingerprint: 'firefox' },
          reality: { enabled: true, public_key: s.params.publicKey, short_id: s.params.shortId },
        },
      })),
      { type: 'direct', tag: 'direct' },
    ],
    route: {
      rules: [
        { domain_suffix: [...directDomains], outbound: 'direct' },
        { ip_cidr: PRIVATE_CIDRS, outbound: 'direct' },
      ],
      final: 'proxy',
    },
  };
}
