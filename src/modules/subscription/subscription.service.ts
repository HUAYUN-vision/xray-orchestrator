import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { ServersRepository } from '../../database/repositories/servers.repository';
import { UserKeysRepository } from '../../database/repositories/user-keys.repository';
import { buildSingboxClientConfig, type SingboxServer } from '../xray/singbox-client-config';
import { buildXrayClientConfig } from '../xray/xray-client-config';
import { XrayService } from '../xray/xray.service';
import { DIRECT_DOMAINS } from './domains';

/**
 * `xray`: array of Xray configs, one per server (Happ, v2rayN, v2rayNG, Streisand, V2Box).
 * `singbox`: one sing-box config with all servers (Hiddify).
 */
export type SubscriptionFormat = 'xray' | 'singbox';

/** Format by the client's User-Agent; anything unknown gets xray-json. */
export function detectFormat(userAgent: string | undefined): SubscriptionFormat {
  return /hiddify/i.test(userAgent ?? '') ? 'singbox' : 'xray';
}

export interface Subscription {
  /** Response body: `Record[]` for xray, `Record` for singbox. */
  body: Record<string, unknown>[] | Record<string, unknown>;
  /** `subscription-userinfo` header value: traffic and expiry for client apps. */
  userInfo: string;
}

/**
 * Builds the subscription for a key with direct routing for DIRECT_DOMAINS:
 * xray-json or sing-box depending on the client. Served at GET /{prefix}/sub/{keyId}.
 */
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly keys: UserKeysRepository,
    private readonly servers: ServersRepository,
    private readonly xray: XrayService,
    private readonly config: AppConfigService,
  ) {}

  /** Public subscription URL for a key. */
  buildUrl(keyId: string): string {
    const base = this.config.get('PUBLIC_URL');
    if (!base) throw new Error('PUBLIC_URL is not set: subscription links are unavailable');
    return new URL(`${this.config.get('GLOBAL_PREFIX')}/sub/${keyId}`, `${base}/`).toString();
  }

  /** `null` if the key does not exist, expired or was deleted. */
  async build(keyId: string, format: SubscriptionFormat = 'xray'): Promise<Subscription | null> {
    const key = await this.keys.findActive(keyId);
    if (!key) return null;

    const servers = await this.reachableServers();
    const body =
      format === 'singbox'
        ? buildSingboxClientConfig({ clientId: key.id, servers, directDomains: DIRECT_DOMAINS })
        : servers.map((s) =>
            buildXrayClientConfig({
              clientId: key.id,
              host: s.host,
              params: s.params,
              label: s.label,
              directDomains: DIRECT_DOMAINS,
            }),
          );

    const userInfo = [
      'upload=0',
      `download=${key.trafficUsed}`,
      `total=${key.trafficLimit ?? 0}`,
      `expire=${Math.floor(key.expiresAt.getTime() / 1000)}`,
    ].join('; ');

    return { body, userInfo };
  }

  /** Enabled servers with Reality params; unreachable ones are skipped. */
  private async reachableServers(): Promise<SingboxServer[]> {
    const servers = await this.servers.findEnabled();
    const results = await Promise.allSettled(servers.map((s) => this.xray.getRealityParams(s)));
    const out: SingboxServer[] = [];
    results.forEach((r, i) => {
      const server = servers[i];
      if (r.status === 'fulfilled') {
        out.push({ label: serverLabel(server.code), host: server.host, params: r.value });
      } else {
        this.logger.warn(`Skipping ${server.code} in subscription: ${String(r.reason)}`);
      }
    });
    return out;
  }
}

/** `nl` → `🇳🇱 NL`; codes that are not two letters get no flag. */
export function serverLabel(code: string): string {
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return upper;
  const flag = String.fromCodePoint(...[...upper].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  return `${flag} ${upper}`;
}
