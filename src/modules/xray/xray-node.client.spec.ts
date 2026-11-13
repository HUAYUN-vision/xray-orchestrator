import type { AppConfigService } from '../../config/app-config.service';
import { XrayNodeClient, XrayNodeError } from './xray-node.client';

const node = { code: 'nl', host: 'nl.example.com', apiPort: 440, apiKey: 'secret' };

describe('XrayNodeClient', () => {
  const client = new XrayNodeClient({ get: () => 1000 } as unknown as AppConfigService);
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => fetchMock.mockRestore());

  it('posts commands with the API key and returns stdout', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(['a\n', 'b\n']), { status: 201 }));
    await expect(client.run(node, ['echo a', 'echo b'])).resolves.toEqual(['a\n', 'b\n']);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://nl.example.com:440/commands');
    expect(init.headers).toMatchObject({ 'X-API-Key': 'secret' });
    expect(JSON.parse(init.body as string)).toEqual({ commands: ['echo a', 'echo b'] });
  });

  it.each([
    [401, 'unauthorized'],
    [400, 'command_failed'],
    [500, 'command_failed'],
  ])('maps HTTP %d to %s', async (status, reason) => {
    fetchMock.mockResolvedValue(new Response('{"message":"x"}', { status }));
    await expect(client.run(node, ['x'])).rejects.toMatchObject({ reason });
  });

  it('maps network errors to unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(client.run(node, ['x'])).rejects.toMatchObject({ reason: 'unreachable' });
  });

  it('maps timeouts to timeout', async () => {
    fetchMock.mockRejectedValue(new DOMException('aborted', 'TimeoutError'));
    await expect(client.run(node, ['x'])).rejects.toMatchObject({ reason: 'timeout' });
  });

  it('rejects a non-array response', async () => {
    fetchMock.mockResolvedValue(new Response('{"ok":true}', { status: 201 }));
    const err = await client.run(node, ['x']).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(XrayNodeError);
    expect(err).toMatchObject({ reason: 'bad_response' });
  });
});
