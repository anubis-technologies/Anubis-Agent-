export type ProviderId = 'deepseek' | 'chatgpt' | 'gemini' | 'claude';

export interface ProviderConfig {
  id: ProviderId; name: string; url: string; apiBase: string;
  apiKeyStorageKey: string;
  supportsDOM: boolean; supportsVision: boolean; supportsThinking: boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  deepseek: {
    id: 'deepseek', name: 'DeepSeek',
    url: 'https://chat.deepseek.com',
    apiBase: 'https://api.deepseek.com/v1',
    apiKeyStorageKey: 'anubis_key_deepseek',
    supportsDOM: true, supportsVision: false, supportsThinking: true,
  },
  chatgpt: {
    id: 'chatgpt', name: 'ChatGPT',
    url: 'https://chatgpt.com',
    apiBase: 'https://api.openai.com/v1',
    apiKeyStorageKey: 'anubis_key_chatgpt',
    supportsDOM: true, supportsVision: true, supportsThinking: true,
  },
  gemini: {
    id: 'gemini', name: 'Gemini',
    url: 'https://gemini.google.com',
    apiBase: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyStorageKey: 'anubis_key_gemini',
    supportsDOM: true, supportsVision: true, supportsThinking: true,
  },
  claude: {
    id: 'claude', name: 'Claude',
    url: 'https://claude.ai',
    apiBase: 'https://api.anthropic.com/v1',
    apiKeyStorageKey: 'anubis_key_claude',
    supportsDOM: true, supportsVision: true, supportsThinking: true,
  },
};

export async function getActiveProvider(): Promise<ProviderConfig> {
  const stored = await chrome.storage.local.get(['anubis_provider']);
  const id = (stored.anubis_provider as ProviderId) ?? 'deepseek';
  return PROVIDERS[id] ?? PROVIDERS.deepseek;
}

export async function getProviderApiKey(id: ProviderId): Promise<string | null> {
  const cfg = PROVIDERS[id];
  if (!cfg) return null;
  const stored = await chrome.storage.local.get([cfg.apiKeyStorageKey]);
  return (stored[cfg.apiKeyStorageKey] as string) ?? null;
}

export async function isDomModeEnabled(): Promise<boolean> {
  const stored = await chrome.storage.local.get(['anubis_dom_mode']);
  return stored.anubis_dom_mode !== false;
}
