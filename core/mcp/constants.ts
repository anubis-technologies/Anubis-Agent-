import type { McpServerResultLimits, McpServerTimeouts } from './types';

export const MCP_PROTOCOL_VERSION = '2025-06-18';

export const MCP_DEFAULT_TIMEOUTS: McpServerTimeouts = {
  connectMs: 10_000,
  requestMs: 60_000,
  discoveryMs: 20_000,
};

export const MCP_DEFAULT_LIMITS: McpServerResultLimits = {
  maxResultBytes: 64_000,
  maxToolCount: 128,
};
