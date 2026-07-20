import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MCP_PROTOCOL_VERSION,
  createMcpNotification,
  createMcpRequest,
  createMcpStreamableHttpTransport,
  type McpServerConfig,
} from '../core/mcp';
import { McpTransportError, readJsonRpcResponse } from '../core/mcp/transports/common';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MCP transport response limits', () => {
  it('fails before parsing oversized JSON-RPC HTTP bodies', async () => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: '1', result: { text: 'too large' } });
    const response = new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    await expect(readJsonRpcResponse(response, { jsonrpc: '2.0', id: '1', method: 'test' }, { maxBytes: 8 }))
      .rejects
      .toMatchObject({ code: 'mcp_response_too_large' } satisfies Partial<McpTransportError>);
  });

  it('persists Streamable HTTP session ids after initialize', async () => {
    const requests: Array<{ method: string; headers: Headers }> = [];
    vi.stubGlobal('chrome', {
      permissions: {
        contains: vi.fn(async () => true),
        request: vi.fn(async () => true),
      },
    });
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const headers = new Headers(init?.headers as HeadersInit);
      requests.push({ method: body.method, headers });

      const responseHeaders = new Headers({ 'content-type': 'application/json' });
      if (body.method === 'initialize') responseHeaders.set('Mcp-Session-Id', 'session-254');
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: body.id ?? null,
        result: body.method === 'tools/list'
          ? { tools: [] }
          : { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: {} } },
      }), { status: 200, headers: responseHeaders });
    }));

    const transport = createMcpStreamableHttpTransport(createServerConfig());
    await transport.request(createMcpRequest('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      clientInfo: { name: 'test', version: '0.0.0' },
    }));
    await transport.notify?.(createMcpNotification('notifications/initialized'));
    await transport.request(createMcpRequest('tools/list'));

    expect(requests.map((request) => request.method)).toEqual([
      'initialize',
      'notifications/initialized',
      'tools/list',
    ]);
    expect(requests[0].headers.get('Mcp-Session-Id')).toBeNull();
    expect(requests[1].headers.get('Mcp-Session-Id')).toBe('session-254');
    expect(requests[2].headers.get('Mcp-Session-Id')).toBe('session-254');
    expect(requests[0].headers.get('MCP-Protocol-Version')).toBeNull();
    expect(requests[1].headers.get('MCP-Protocol-Version')).toBe(MCP_PROTOCOL_VERSION);
    expect(requests[2].headers.get('MCP-Protocol-Version')).toBe(MCP_PROTOCOL_VERSION);
  });
});

function createServerConfig(): McpServerConfig {
  return {
    version: 1,
    id: 'stateful',
    displayName: 'Stateful MCP',
    enabled: true,
    transport: {
      kind: 'streamable_http',
      url: 'http://127.0.0.1:48123/mcp',
    },
    headers: [],
    secrets: [],
    timeouts: {
      connectMs: 1_000,
      requestMs: 1_000,
      discoveryMs: 1_000,
    },
    limits: {
      maxResultBytes: 64_000,
      maxToolCount: 128,
    },
    allowlist: {
      mode: 'all',
      toolNames: [],
    },
    execution: {
      mode: 'auto',
      enabled: true,
    },
    status: 'unknown',
    lastConnectedAt: null,
    lastError: null,
    createdAt: 1,
    updatedAt: 1,
  };
}
