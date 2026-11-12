import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';

/** What the client needs to reach a node. */
export interface XrayNode {
  code: string;
  host: string;
  apiPort: number;
  apiKey: string;
}

export class XrayNodeError extends Error {
  constructor(
    readonly node: string,
    readonly reason: 'unreachable' | 'timeout' | 'unauthorized' | 'command_failed' | 'bad_response',
    detail: string,
  ) {
    super(`[${node}] ${reason}: ${detail}`);
    this.name = 'XrayNodeError';
  }
}

/**
 * HTTP client for xray-server-instance: `POST /commands` runs shell commands one by one
 * and returns stdout of each. The node answers 400 if a command fails or writes to stderr.
 */
@Injectable()
export class XrayNodeClient {
  private readonly logger = new Logger(XrayNodeClient.name);

  constructor(private readonly config: AppConfigService) {}

  async run(node: XrayNode, commands: string[]): Promise<string[]> {
    const url = `http://${node.host}:${node.apiPort}/commands`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': node.apiKey },
        body: JSON.stringify({ commands }),
        signal: AbortSignal.timeout(this.config.get('XRAY_NODE_TIMEOUT_MS')),
      });
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === 'TimeoutError';
      throw new XrayNodeError(node.code, isTimeout ? 'timeout' : 'unreachable', String(err));
    }

    const body = await res.text();
    if (res.status === 401)
      throw new XrayNodeError(node.code, 'unauthorized', 'check servers.api_key');
    if (!res.ok) {
      this.logger.warn(`[${node.code}] commands failed (${res.status}): ${body}`);
      throw new XrayNodeError(node.code, 'command_failed', `${res.status} ${body}`);
    }

    try {
      const parsed: unknown = JSON.parse(body);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) return parsed;
    } catch {
      // fall through
    }
    throw new XrayNodeError(node.code, 'bad_response', body.slice(0, 200));
  }
}
