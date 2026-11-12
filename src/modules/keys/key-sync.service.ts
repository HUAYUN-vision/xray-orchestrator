import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { ServerWithKey } from '../../database/repositories/servers.repository';
import { ServersRepository } from '../../database/repositories/servers.repository';
import { UserKeysRepository } from '../../database/repositories/user-keys.repository';
import { XrayService } from '../xray/xray.service';

const EXPIRE_BATCH = 100;
/** Clients per request to a node: keeps the /commands body and run time small. */
const NODE_CHUNK = 50;

export interface SyncReport {
  server: string;
  added: number;
  removed: number;
  error?: string;
}

/**
 * Keeps nodes in line with the database.
 * - expire: every minute, active keys past `expires_at` become `expired` and are removed from nodes;
 * - sync: every 10 minutes and on start, each enabled node gets missing live keys
 *   (new or returning server, failed purchase step) and loses dead ones (failed removal).
 * Clients unknown to the database are never touched.
 */
@Injectable()
export class KeySyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(KeySyncService.name);
  private expiring = false;
  private syncing = false;

  constructor(
    private readonly keys: UserKeysRepository,
    private readonly servers: ServersRepository,
    private readonly xray: XrayService,
  ) {}

  onApplicationBootstrap(): void {
    // Not awaited: unreachable nodes must not delay startup.
    void this.syncAll().catch((err: unknown) =>
      this.logger.error(`Initial sync failed: ${String(err)}`),
    );
  }

  @Cron(CronExpression.EVERY_MINUTE, { name: 'keys-expire' })
  async expireKeys(): Promise<number> {
    if (this.expiring) return 0;
    this.expiring = true;
    try {
      let total = 0;
      for (;;) {
        const batch = await this.keys.findExpired(new Date(), EXPIRE_BATCH);
        if (batch.length === 0) break;
        const ids = await this.keys.markExpired(batch.map((k) => k.id));
        total += ids.length;
        // Best effort: a node that is down now is cleaned up by the next sync.
        const servers = await this.servers.findAll();
        await Promise.allSettled(servers.map((s) => this.removeFrom(s, ids)));
        if (batch.length < EXPIRE_BATCH) break;
      }
      if (total > 0) this.logger.log(`Expired ${total} key(s)`);
      return total;
    } finally {
      this.expiring = false;
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'keys-sync' })
  async syncAll(): Promise<SyncReport[]> {
    if (this.syncing) return [];
    this.syncing = true;
    try {
      const servers = await this.servers.findEnabled();
      const reports = await Promise.all(servers.map((s) => this.syncServer(s)));
      for (const r of reports) {
        if (r.error) this.logger.warn(`Sync ${r.server} failed: ${r.error}`);
        else if (r.added || r.removed) {
          this.logger.log(`Sync ${r.server}: +${r.added} −${r.removed}`);
        }
      }
      return reports;
    } finally {
      this.syncing = false;
    }
  }

  async syncServer(server: ServerWithKey): Promise<SyncReport> {
    const report: SyncReport = { server: server.code, added: 0, removed: 0 };
    try {
      const onNode = new Set(await this.xray.listClients(server));
      const live = await this.keys.findLiveIds();
      const liveSet = new Set(live);

      const missing = live.filter((id) => !onNode.has(id));
      for (const part of chunk(missing, NODE_CHUNK)) {
        await this.xray.addClients(server, part);
        report.added += part.length;
      }

      const dead = await this.keys.findDeadIds([...onNode].filter((id) => !liveSet.has(id)));
      await this.removeFrom(server, dead);
      report.removed = dead.length;
    } catch (err) {
      report.error = String(err);
    }
    return report;
  }

  private async removeFrom(server: ServerWithKey, ids: string[]): Promise<void> {
    try {
      for (const part of chunk(ids, NODE_CHUNK)) await this.xray.removeClients(server, part);
    } catch (err) {
      this.logger.warn(`Removing keys from ${server.code} failed: ${String(err)}`);
      throw err;
    }
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
