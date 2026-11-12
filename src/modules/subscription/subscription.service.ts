import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { ServersRepository } from '../../database/repositories/servers.repository';
import { UserKeysRepository } from '../../database/repositories/user-keys.repository';
import { buildXrayClientConfig } from '../xray/xray-client-config';
import { XrayService } from '../xray/xray.service';
import { DIRECT_DOMAINS } from './domains';

export interface Subscription {
  /** One Xray config per reachable server. */
  configs: Record<string, unknown>[];
  /** `subscription-userinfo` header value: traffic and expiry for client apps. */
  userInfo: string;
}

/**
 * Builds the subscription for a key: a full Xray config per server with
 * direct routing for DIRECT_DOMAINS. Served at GET /{prefix}/sub/{keyId}.
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
  async build(keyId: string): Promise<Subscription | null> {
    const key = await this.keys.findActive(keyId);
    if (!key) return null;

    const servers = await this.servers.findEnabled();
    const results = await Promise.allSettled(
      servers.map(async (server) => {
        const params = await this.xray.getRealityParams(server);
        return buildXrayClientConfig({
          clientId: key.id,
          host: server.host,
          params,
          label: serverLabel(server.code),
          directDomains: DIRECT_DOMAINS,
        });
      }),
    );

    const configs: Record<string, unknown>[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') configs.push(r.value);
      else this.logger.warn(`Skipping ${servers[i].code} in subscription: ${String(r.reason)}`);
    });

    const userInfo = [
      'upload=0',
      `download=${key.trafficUsed}`,
      `total=${key.trafficLimit ?? 0}`,
      `expire=${Math.floor(key.expiresAt.getTime() / 1000)}`,
    ].join('; ');

    return { configs, userInfo };
  }
}

/** `nl` → `🇳🇱 NL`; codes that are not two letters get no flag. */
export function serverLabel(code: string): string {
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return upper;
  const flag = String.fromCodePoint(...[...upper].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  return `${flag} ${upper}`;
}
