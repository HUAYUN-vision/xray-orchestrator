import { Logger } from '@nestjs/common';
import type { ServerWithKey } from '../../database/repositories/servers.repository';
import { XrayNodeError } from '../xray/xray-node.client';
import { ServersAdminError, ServersAdminService } from './servers-admin.service';

const ID = '0b3f2c1e-8a7d-4c3b-9e2f-1a2b3c4d5e6f';
const CREATED_AT = new Date('2026-01-01T00:00:00Z');
const input = { code: 'sg', host: '10.0.0.1', apiPort: 440, apiKey: 'secret' };
const server = (enabled = true) =>
  ({ ...input, id: ID, enabled, createdAt: CREATED_AT }) as ServerWithKey;
const ok = (added = 0, removed = 0) => ({ server: 'sg', added, removed });

describe('ServersAdminService', () => {
  let servers: Record<string, jest.Mock>;
  let sync: Record<string, jest.Mock>;
  let xray: Record<string, jest.Mock>;
  let service: ServersAdminService;
  const order: string[] = [];

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    order.length = 0;
    servers = {
      findAll: jest.fn().mockResolvedValue([server(), { ...server(false), id: 'x', code: 'de' }]),
      findById: jest.fn().mockResolvedValue(server()),
      existsByCodeOrHost: jest.fn().mockResolvedValue(false),
      create: jest.fn(() => (order.push('create'), Promise.resolve(server()))),
      setEnabled: jest.fn().mockResolvedValue(true),
      delete: jest.fn(() => (order.push('delete'), Promise.resolve())),
      countEnabled: jest.fn().mockResolvedValue(1),
    };
    sync = {
      syncServer: jest.fn(() => (order.push('sync'), Promise.resolve(ok(3)))),
      cleanServer: jest.fn(() => (order.push('clean'), Promise.resolve(ok(0, 2)))),
    };
    xray = {
      getRealityParams: jest.fn(() => (order.push('probe'), Promise.resolve({}))),
      listClients: jest.fn().mockResolvedValue(['a', 'b']),
      forget: jest.fn(),
    };
    service = new ServersAdminService(servers as never, sync as never, xray as never);
  });

  it('list: client count per node, null for an unreachable one', async () => {
    xray.listClients
      .mockResolvedValueOnce(['a', 'b'])
      .mockRejectedValueOnce(new XrayNodeError('de', 'timeout', 'x'));
    const list = await service.list();
    expect(list.map((s) => [s.server.code, s.clients])).toEqual([
      ['sg', 2],
      ['de', null],
    ]);
  });

  it('add: checks the node, saves, then puts all live keys there', async () => {
    const change = await service.add(input);
    expect(order).toEqual(['probe', 'create', 'sync']);
    expect(servers.create).toHaveBeenCalledWith(input);
    expect(change).toMatchObject({ report: { added: 3 }, noneEnabled: false });
  });

  it('add: refuses a taken code/host without touching the node', async () => {
    servers.existsByCodeOrHost.mockResolvedValue(true);
    await expect(service.add(input)).rejects.toMatchObject({ code: 'exists' });
    expect(xray.getRealityParams).not.toHaveBeenCalled();
  });

  it('add: does not save a server whose node does not answer', async () => {
    xray.getRealityParams.mockRejectedValue(new XrayNodeError('sg', 'unreachable', 'refused'));
    await expect(service.add(input)).rejects.toMatchObject({ code: 'unreachable' });
    expect(servers.create).not.toHaveBeenCalled();
    expect(xray.forget).toHaveBeenCalledWith(input);
  });

  it('enable → sync; disable → cleanup, with a warning when none is enabled', async () => {
    await expect(service.setEnabled(ID, true)).resolves.toMatchObject({ report: { added: 3 } });
    expect(servers.setEnabled).toHaveBeenCalledWith(ID, true);

    servers.findById.mockResolvedValue(server(false));
    servers.countEnabled.mockResolvedValue(0);
    await expect(service.setEnabled(ID, false)).resolves.toMatchObject({
      report: { removed: 2 },
      noneEnabled: true,
    });
    expect(order).toEqual(['sync', 'clean']);
  });

  it('setEnabled: unknown server', async () => {
    servers.setEnabled.mockResolvedValue(false);
    await expect(service.setEnabled(ID, true)).rejects.toBeInstanceOf(ServersAdminError);
  });

  it('syncNow: sync for enabled, cleanup for disabled', async () => {
    await service.syncNow(ID);
    servers.findById.mockResolvedValue(server(false));
    await service.syncNow(ID);
    expect(order).toEqual(['sync', 'clean']);
  });

  it('remove: cleans the node first, deletes the row even if the node is down', async () => {
    sync.cleanServer.mockImplementation(() => {
      order.push('clean');
      return Promise.resolve({ ...ok(), error: 'timeout' });
    });
    const change = await service.remove(ID);
    expect(order).toEqual(['clean', 'delete']);
    expect(change.report.error).toBe('timeout');
    expect(xray.forget).toHaveBeenCalledWith(server());
  });

  it('remove: unknown server', async () => {
    servers.findById.mockResolvedValue(null);
    await expect(service.remove(ID)).rejects.toMatchObject({ code: 'not_found' });
    expect(servers.delete).not.toHaveBeenCalled();
  });
});
