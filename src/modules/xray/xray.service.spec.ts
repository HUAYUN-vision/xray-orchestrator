import { randomUUID } from 'node:crypto';
import type { XrayNode, XrayNodeClient } from './xray-node.client';
import { XrayService } from './xray.service';

const node: XrayNode = { code: 'nl', host: 'nl.example.com', apiPort: 440, apiKey: 'k' };
const PARAMS_OUT = ['PUBKEY\n', 'www.cloudflare.com\n', '443\n', 'abcd1234\n'];

describe('XrayService', () => {
  let run: jest.Mock<Promise<string[]>, [XrayNode, string[]]>;
  let service: XrayService;

  beforeEach(() => {
    run = jest.fn((_node: XrayNode, cmds: string[]) =>
      Promise.resolve(cmds[0].startsWith('cat ') ? PARAMS_OUT : cmds.map(() => '')),
    );
    service = new XrayService({ run } as unknown as XrayNodeClient);
  });

  it('reads and caches reality params', async () => {
    await expect(service.getRealityParams(node)).resolves.toEqual({
      publicKey: 'PUBKEY',
      serverName: 'www.cloudflare.com',
      port: 443,
      shortId: 'abcd1234',
    });
    await service.getRealityParams(node);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid reality params', async () => {
    run.mockResolvedValueOnce(['', 'x', 'not-a-port', '']);
    await expect(service.getRealityParams(node)).rejects.toThrow(/invalid reality params/);
  });

  it('addClient writes the user file and calls adu after a tolerant rmu', async () => {
    const id = randomUUID();
    await service.addClient(node, id);
    const cmds = run.mock.calls[1][1];
    expect(cmds[1]).toContain(`/xray/data/users/${id}.json`);
    expect(cmds[1]).toContain('"flow":"xtls-rprx-vision"');
    expect(cmds[1]).toContain('"port":443');
    expect(cmds[2]).toMatch(new RegExp(`rmu .*--tag=vless-in ${id} .*\\|\\| true$`));
    expect(cmds[3]).toBe(`xray api adu --server=127.0.0.1:10085 /xray/data/users/${id}.json`);
  });

  it('removeClient is idempotent and deletes the user file', async () => {
    const id = randomUUID();
    await service.removeClient(node, id);
    const cmds = run.mock.calls[0][1];
    expect(cmds[0]).toMatch(/\|\| true$/);
    expect(cmds[1]).toBe(`rm -f /xray/data/users/${id}.json`);
  });

  it('adds and removes several clients in one request', async () => {
    const ids = [randomUUID(), randomUUID()];
    await service.addClients(node, ids);
    const add = run.mock.calls[1][1];
    expect(add).toHaveLength(1 + 3 * ids.length);
    expect(add.filter((c) => c.startsWith('xray api adu'))).toHaveLength(2);

    await service.removeClients(node, ids);
    expect(run.mock.calls[2][1]).toHaveLength(2 * ids.length);
  });

  it('does not call the node for an empty batch', async () => {
    await service.addClients(node, []);
    await service.removeClients(node, []);
    expect(run).not.toHaveBeenCalled();
  });

  it('lists client ids from user files, ignoring anything else', async () => {
    const id = randomUUID();
    run.mockResolvedValueOnce([`${id}.json\nREADME\nnot-a-uuid.json\n`]);
    await expect(service.listClients(node)).resolves.toEqual([id]);
    expect(run.mock.calls[0][1][0]).toMatch(/^ls -1 \/xray\/data\/users .*\|\| true$/);
  });

  it.each(['not-a-uuid', "x'; rm -rf / #", ''])('refuses unsafe client id %p', async (id) => {
    await expect(service.addClient(node, id)).rejects.toThrow(/Invalid xray client id/);
    await expect(service.removeClient(node, id)).rejects.toThrow(/Invalid xray client id/);
    expect(run).not.toHaveBeenCalled();
  });

  it('builds a vless reality link', async () => {
    const id = '0b3f2c1e-8a7d-4c3b-9e2f-1a2b3c4d5e6f';
    const link = await service.buildVlessLink(node, id, '🇳🇱 Netherlands');
    const url = new URL(link);
    expect(url.protocol).toBe('vless:');
    expect(url.username).toBe(id);
    expect(url.host).toBe('nl.example.com:443');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      encryption: 'none',
      security: 'reality',
      sni: 'www.cloudflare.com',
      fp: 'firefox',
      pbk: 'PUBKEY',
      sid: 'abcd1234',
      type: 'tcp',
      headerType: 'none',
      flow: 'xtls-rprx-vision',
    });
    expect(decodeURIComponent(url.hash.slice(1))).toBe('🇳🇱 Netherlands');
  });
});
