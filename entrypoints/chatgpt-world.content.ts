/**
 * Anubis Agent — ChatGPT MAIN WORLD content script v3 (v26)
 *
 * Fixes vs v2:
 * - extractBodyString: handles string | Uint8Array | ArrayBuffer | ReadableStream
 *   and Request-object bodies. ChatGPT's newer streaming POSTs pass the body as
 *   a ReadableStream (or as a Request with body embedded); the old
 *   `typeof init?.body === 'string'` check silently dropped those.
 * - Request reconstruction: when body came from a Request object, we rebuild a
 *   new Request with the augmented body rather than patching init (which is ignored
 *   when input is already a Request).
 * - JSON guard: only attempt augmentation when body starts with '{' or '['.
 * - Method detection: reads method from the Request object when init has none.
 *
 * Bridge flow (unchanged):
 *   1. Posts ANUBIS_BRIDGE_REQUEST on window every 50ms until connected.
 *   2. chatgpt.content.ts catches it, sends back a MessagePort.
 *   3. We use the port to send AUGMENT_REQUEST_BODY.
 *   4. chatgpt.content.ts replies with AUGMENT_REQUEST_BODY_RESULT.
 */

const MAIN_SOURCE    = 'anubis-chatgpt-main';
const CONTENT_SOURCE = 'anubis-chatgpt-content';
const BRIDGE_REQUEST = 'ANUBIS_BRIDGE_REQUEST';
const BRIDGE_INIT    = 'ANUBIS_BRIDGE_INIT';
const BRIDGE_READY   = 'ANUBIS_BRIDGE_READY';

const CHATGPT_PATHS      = ['/backend-api/conversation', '/backend-anon/conversation'];
const REQUEST_TIMEOUT_MS  = 8_000;
const BRIDGE_INTERVAL_MS  = 50;
const BRIDGE_MAX_ATTEMPTS = 100;

type PendingRequest = {
  resolve: (body: string | null) => void;
  reject:  (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

let contentPort: MessagePort | null = null;
let bridgeAttempts = 0;
let bridgeTimer: ReturnType<typeof setInterval> | null = null;
const pending = new Map<string, PendingRequest>();

export default defineContentScript({
  matches: ['*://chatgpt.com/*', '*://chat.openai.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    installBridge();
    hookFetch();
  },
});

// ── Bridge ────────────────────────────────────────────────────────────────────

function installBridge() {
  window.addEventListener('message', (ev) => {
    if (ev.origin !== location.origin) return;
    if (ev.data?.source !== CONTENT_SOURCE || ev.data.type !== BRIDGE_INIT) return;
    if (contentPort) return;
    const [port] = ev.ports;
    if (!port) return;
    contentPort = port;
    contentPort.onmessage = (e) => handlePortMessage(e.data);
    contentPort.start();
    stopBridge();
    contentPort.postMessage({ source: MAIN_SOURCE, type: BRIDGE_READY });
  });

  bridgeTimer = setInterval(() => {
    if (contentPort || bridgeAttempts >= BRIDGE_MAX_ATTEMPTS) { stopBridge(); return; }
    bridgeAttempts++;
    window.postMessage({ source: MAIN_SOURCE, type: BRIDGE_REQUEST }, location.origin);
  }, BRIDGE_INTERVAL_MS);
}

function stopBridge() {
  if (!bridgeTimer) return;
  clearInterval(bridgeTimer);
  bridgeTimer = null;
}

function handlePortMessage(data: any) {
  if (data?.source !== CONTENT_SOURCE) return;
  if (data.type === 'AUGMENT_REQUEST_BODY_RESULT') {
    const req = pending.get(data.id);
    if (!req) return;
    pending.delete(data.id);
    clearTimeout(req.timeout);
    if (data.ok === false) req.reject(new Error(data.error ?? 'Augmentation failed'));
    else req.resolve(data.body ?? null);
  }
  if (data.type === 'SYNC_TOOL_DESCRIPTORS') { /* reserved */ }
}

function requestAugmentedBody(bodyStr: string): Promise<string | null> {
  if (!contentPort) return Promise.resolve(null);
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); resolve(null); }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timeout });
    contentPort!.postMessage({ source: MAIN_SOURCE, type: 'AUGMENT_REQUEST_BODY', id, body: bodyStr });
  });
}

// ── Body extraction ───────────────────────────────────────────────────────────

/**
 * Decode any fetch body type to a UTF-8 string.
 * Returns null for non-text types (Blob, FormData, URLSearchParams) or read errors.
 */
async function extractBodyString(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ bodyStr: string; fromRequest: boolean } | null> {
  const raw = init?.body;

  if (raw !== undefined && raw !== null) {
    if (typeof raw === 'string')    return { bodyStr: raw, fromRequest: false };
    if (raw instanceof ArrayBuffer) return { bodyStr: new TextDecoder().decode(raw), fromRequest: false };
    if (ArrayBuffer.isView(raw))    return { bodyStr: new TextDecoder().decode(raw as ArrayBufferView), fromRequest: false };
    if (raw instanceof ReadableStream) {
      try {
        const reader = (raw as ReadableStream<Uint8Array>).getReader();
        const chunks: Uint8Array[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer));
        }
        const merged = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
        let off = 0; for (const c of chunks) { merged.set(c, off); off += c.length; }
        return { bodyStr: new TextDecoder().decode(merged), fromRequest: false };
      } catch { return null; }
    }
    return null; // Blob / FormData / URLSearchParams
  }

  if (input instanceof Request && input.method === 'POST' && input.body) {
    try {
      const buf = await input.clone().arrayBuffer();
      return { bodyStr: new TextDecoder().decode(buf), fromRequest: true };
    } catch { return null; }
  }

  return null;
}

function isJsonBody(s: string): boolean {
  const t = s.trimStart();
  return t.startsWith('{') || t.startsWith('[');
}

// ── Fetch hook ────────────────────────────────────────────────────────────────

function hookFetch() {
  const orig = window.fetch.bind(window);

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const url =
      typeof input === 'string' ? input :
      input instanceof URL ? input.href :
      (input as Request).url;

    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const isConv = CHATGPT_PATHS.some((p) => url.includes(p)) && method === 'POST';

    if (isConv) {
      try {
        const extracted = await extractBodyString(input, init);
        if (extracted && isJsonBody(extracted.bodyStr)) {
          const augmented = await requestAugmentedBody(extracted.bodyStr);
          if (augmented && augmented !== extracted.bodyStr) {
            if (extracted.fromRequest && input instanceof Request) {
              input = new Request(input, { body: augmented });
            } else {
              init = { ...init, body: augmented };
            }
          }
        }
      } catch { /* pass through */ }
    }

    return orig(input, init);
  };
}
