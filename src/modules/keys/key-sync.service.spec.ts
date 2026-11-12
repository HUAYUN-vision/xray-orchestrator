import { Logger } from '@nestjs/common';
import type { ServerWithKey } from '../../database/repositories/servers.repository';
import { XrayNodeError } from '../xray/xray-node.client';
import { KeySyncService } from './key-sync.service';

const server = (code: string) => ({ id: code, code, host: `${code}.example.com` }) as ServerWithKey;
const [A, B, C, D] = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
];

describe('KeySyncService', () => {
  let keys: Record<string, jest.Mock>;
  let servers: Record<string, jest.Mock>;
  let xray: Record<string, jest.Mock>;
  let service: KeySyncService;

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    keys = {
      findExpired: jest.fn().mockResolvedValue([]),
      markExpired: jest.fn((ids: string[]) => Promise.resolve(ids)),
      findLiveIds: jest.fn().mockResolvedValue([]),
      findDeadIds: jest.fn().mockResolvedValue([]),
    };
    servers = {
      findEnabled: jest.fn().mockResolvedValue([server('nl')]),
      findAll: jest.fn().mockResolvedValue([server('nl'), server('off')]),
    };
    xray = {
      listClients: jest.fn().mockResolvedValue([]),
      addClients: jest.fn().mockResolvedValue(undefined),
      removeClients: jest.fn().mockResolvedValue(undefined),
    };
    service = new KeySyncService(keys as never, servers as never, xray as never);
  });

  describe('expireKeys', () => {
    it('marks expired keys and removes them from all servers, including disabled', async () => {
      keys.findExpired.mockResolvedValueOnce([{ id: A }, { id: B }]);
      await expect(service.expireKeys()).resolves.toBe(2);
      expect(keys.markExpired).toHaveBeenCalledWith([A, B]);
      expect(xray.removeClients).toHaveBeenCalledTimes(2);
      expect(xray.removeClients).toHaveBeenCalledWith(server('off'), [A, B]);
    });

    it('keeps the keys expired when a node is down', async () => {
      keys.findExpired.mockResolvedValueOnce([{ id: A }]);
      xray.removeClients.mockRejectedValueOnce(new XrayNodeError('nl', 'timeout', 'x'));
      await expect(service.expireKeys()).resolves.toBe(1);
      expect(xray.removeClients).toHaveBeenCalledTimes(2);
    });

    it('processes several batches', async () => {
      const full = Array.from({ length: 100 }, (_, i) => ({
        id: `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`,
      }));
      keys.findExpired.mockResolvedValueOnce(full).mockResolvedValueOnce([{ id: A }]);
      await expect(service.expireKeys()).resolves.toBe(101);
      expect(keys.findExpired).toHaveBeenCalledTimes(2);
    });

    it('does nothing when no key expired', async () => {
      await expect(service.expireKeys()).resolves.toBe(0);
      expect(servers.findAll).not.toHaveBeenCalled();
    });
  });

  describe('syncAll', () => {
    it('adds missing live keys and removes dead ones, leaving unknown clients alone', async () => {
      // On node: A (live), C (dead in DB), D (unknown to DB). Live: A, B.
      xray.listClients.mockResolvedValue([A, C, D]);
      keys.findLiveIds.mockResolvedValue([A, B]);
      keys.findDeadIds.mockResolvedValue([C]);

      await expect(service.syncAll()).resolves.toEqual([{ server: 'nl', added: 1, removed: 1 }]);
      expect(xray.addClients).toHaveBeenCalledWith(server('nl'), [B]);
      expect(keys.findDeadIds).toHaveBeenCalledWith([C, D]);
      expect(xray.removeClients).toHaveBeenCalledWith(server('nl'), [C]);
    });

    it('splits large additions into chunks', async () => {
      const live = Array.from(
        { length: 120 },
        (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`,
      );
      keys.findLiveIds.mockResolvedValue(live);
      const [report] = await service.syncAll();
      expect(report.added).toBe(120);
      expect(xray.addClients.mock.calls.map((c: unknown[]) => (c[1] as string[]).length)).toEqual([
        50, 50, 20,
      ]);
    });

    it('reports an unreachable server without failing the others', async () => {
      servers.findEnabled.mockResolvedValue([server('nl'), server('de')]);
      xray.listClients
        .mockRejectedValueOnce(new XrayNodeError('nl', 'unreachable', 'x'))
        .mockResolvedValueOnce([]);
      keys.findLiveIds.mockResolvedValue([A]);

      const reports = await service.syncAll();
      expect(reports[0]).toMatchObject({ server: 'nl', added: 0, error: expect.any(String) });
      expect(reports[1]).toEqual({ server: 'de', added: 1, removed: 0 });
    });

    it('does not run twice at the same time', async () => {
      let release!: () => void;
      xray.listClients.mockReturnValueOnce(new Promise<string[]>((r) => (release = () => r([]))));
      const first = service.syncAll();
      await expect(service.syncAll()).resolves.toEqual([]);
      release();
      await first;
    });
  });
});
