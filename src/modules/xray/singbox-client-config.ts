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
}

/** sing-box 1.8+ remote rule-sets. Same categories as the Xray geosite/geoip rules. */
const RULE_SETS = [
  {
    tag: 'geosite-category-ru',
    url: 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-category-ru.srs',
  },
  {
    tag: 'geosite-cn',
    url: 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs',
  },
  {
    tag: 'geosite-private',
    url: 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-private.srs',
  },
  {
    tag: 'geoip-ru',
    url: 'https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-ru.srs',
  },
  {
    tag: 'geoip-cn',
    url: 'https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs',
  },
] as const;

/**
 * sing-box client config for Hiddify (it runs sing-box and rejects xray-json).
 * One config with all servers: a selector with automatic choice by latency (urltest).
 * Russian and Chinese sites go direct via remote rule-sets (the sing-box equivalent of
 * geosite/geoip); private networks are inlined so LAN works before a rule-set is downloaded.
 * Rule-sets are fetched through the proxy, because GitHub is often blocked in Russia and China.
 * No inbounds/dns: Hiddify builds them from its own settings (TUN/proxy mode, DNS).
 * Route rules use the `outbound` field, not `action`: older sing-box cores in Hiddify understand it.
 * Requires sing-box 1.8 or newer (rule-set). `download_detour` is the field those cores accept.
 */
export function buildSingboxClientConfig(input: SingboxConfigInput): Record<string, unknown> {
  const { clientId, servers } = input;
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
        { ip_cidr: PRIVATE_CIDRS, outbound: 'direct' },
        {
          rule_set: ['geosite-category-ru', 'geosite-cn', 'geosite-private'],
          outbound: 'direct',
        },
        { rule_set: ['geoip-ru', 'geoip-cn'], outbound: 'direct' },
      ],
      rule_set: RULE_SETS.map((set) => ({
        type: 'remote',
        tag: set.tag,
        format: 'binary',
        url: set.url,
        download_detour: 'proxy',
        update_interval: '24h',
      })),
      final: 'proxy',
    },
  };
}
