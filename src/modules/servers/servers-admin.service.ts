import { Injectable, Logger } from '@nestjs/common';
import {
  type NewServer,
  ServersRepository,
  type ServerWithKey,
} from '../../database/repositories/servers.repository';
import { KeySyncService, type SyncReport } from '../keys/key-sync.service';
import { XrayService } from '../xray/xray.service';

export type ServersAdminErrorCode = 'exists' | 'unreachable' | 'not_found';

export class ServersAdminError extends Error {
  constructor(
    readonly code: ServersAdminErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ServersAdminError';
  }
}

export interface ServerStatus {
  server: ServerWithKey;
  /** Clients on the node; `null` if the node did not answer. */
  clients: number | null;
}

export interface ServerChange {
  server: ServerWithKey;
  /** Sync (enable/add) or cleanup (disable/delete) result; `error` if the node was down. */
  report: SyncReport;
  /** No enabled servers left: purchases fail with `no_servers`. */
  noneEnabled: boolean;
}

/**
 * Server management for admins (D19).
 * - add: the node must answer before the server is saved; then all live keys go there at once;
 * - enable: sync right away; disable: all our keys are removed from the node
 *   (if it is down, the next sync finishes the job);
 * - delete: cleanup as for disable, then the row is removed.
 * The subscription and purchases use only enabled servers.
 */
@Injectable()
export class ServersAdminService {
  private readonly logger = new Logger(ServersAdminService.name);

  constructor(
    private readonly servers: ServersRepository,
    private readonly sync: KeySyncService,
    private readonly xray: XrayService,
  ) {}

  /** All servers with the number of clients on each node (checked in parallel). */
  async list(): Promise<ServerStatus[]> {
    const servers = await this.servers.findAll();
    const counts = await Promise.allSettled(servers.map((s) => this.xray.listClients(s)));
    return servers.map((server, i) => {
      const r = counts[i];
      return { server, clients: r.status === 'fulfilled' ? r.value.length : null };
    });
  }

  async add(input: NewServer): Promise<ServerChange> {
    if (await this.servers.existsByCodeOrHost(input.code, input.host)) {
      throw new ServersAdminError('exists');
    }
    try {
      await this.xray.getRealityParams(input);
      await this.xray.listClients(input);
    } catch (err) {
      this.xray.forget(input);
      throw new ServersAdminError('unreachable', String(err));
    }
    const server = await this.servers.create(input);
    this.logger.log(`Server ${server.code} (${server.host}) added`);
    return this.change(server, await this.sync.syncServer(server));
  }

  async setEnabled(id: string, enabled: boolean): Promise<ServerChange> {
    if (!(await this.servers.setEnabled(id, enabled))) throw new ServersAdminError('not_found');
    const server = await this.get(id);
    this.logger.log(`Server ${server.code} ${enabled ? 'enabled' : 'disabled'}`);
    const report = enabled
      ? await this.sync.syncServer(server)
      : await this.sync.cleanServer(server);
    return this.change(server, report);
  }

  /** Runs a sync now: enabled — add/remove as usual, disabled — cleanup. */
  async syncNow(id: string): Promise<ServerChange> {
    const server = await this.get(id);
    const report = server.enabled
      ? await this.sync.syncServer(server)
      : await this.sync.cleanServer(server);
    return this.change(server, report);
  }

  /**
   * Removes our keys from the node (best effort) and deletes the server.
   * If the node is down, its clients stay there: `report.error` says so.
   */
  async remove(id: string): Promise<ServerChange> {
    const server = await this.get(id);
    const report = await this.sync.cleanServer(server);
    await this.servers.delete(id);
    this.xray.forget(server);
    this.logger.log(`Server ${server.code} deleted${report.error ? ' (node not cleaned)' : ''}`);
    return this.change(server, report);
  }

  async get(id: string): Promise<ServerWithKey> {
    const server = await this.servers.findById(id);
    if (!server) throw new ServersAdminError('not_found');
    return server;
  }

  private async change(server: ServerWithKey, report: SyncReport): Promise<ServerChange> {
    if (report.error) this.logger.warn(`Server ${server.code}: ${report.error}`);
    return { server, report, noneEnabled: (await this.servers.countEnabled()) === 0 };
  }
}
