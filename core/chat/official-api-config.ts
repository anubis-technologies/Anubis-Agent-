export const OFFICIAL_API_CHAT_CONFIG_STORAGE_KEY = 'deepseek_pp_official_api_chat_config';

export const OFFICIAL_DEEPSEEK_MODELS = ['deepseek-v4-flash', 'deepseek-v4-pro'] as const;
export type OfficialDeepSeekModel = typeof OFFICIAL_DEEPSEEK_MODELS[number];

export const OFFICIAL_DEEPSEEK_THINKING_MODES = ['disabled', 'enabled'] as const;
export type OfficialDeepSeekThinkingMode = typeof OFFICIAL_DEEPSEEK_THINKING_MODES[number];

export const OFFICIAL_DEEPSEEK_REASONING_EFFORTS = ['high', 'max'] as const;
export type OfficialDeepSeekReasoningEffort = typeof OFFICIAL_DEEPSEEK_REASONING_EFFORTS[number];

export interface OfficialApiChatConfig {
  model: OfficialDeepSeekModel;
  thinking: OfficialDeepSeekThinkingMode;
  reasoningEffort: OfficialDeepSeekReasoningEffort;
}

export const DEFAULT_OFFICIAL_API_CHAT_CONFIG: OfficialApiChatConfig = {
  model: 'deepseek-v4-flash',
  thinking: 'disabled',
  reasoningEffort: 'high',
};

export async function getOfficialApiChatConfig(): Promise<OfficialApiChatConfig> {
  const data = await chrome.storage.local.get(OFFICIAL_API_CHAT_CONFIG_STORAGE_KEY) as Record<string, unknown>;
  return normalizeOfficialApiChatConfig(data[OFFICIAL_API_CHAT_CONFIG_STORAGE_KEY]);
}

export async function saveOfficialApiChatConfig(value: unknown): Promise<OfficialApiChatConfig> {
  const config = normalizeOfficialApiChatConfig(value);
  await chrome.storage.local.set({ [OFFICIAL_API_CHAT_CONFIG_STORAGE_KEY]: config });
  return config;
}

export function normalizeOfficialApiChatConfig(value: unknown): OfficialApiChatConfig {
  if (!value || typeof value !== 'object') return DEFAULT_OFFICIAL_API_CHAT_CONFIG;
  const object = value as Partial<Record<keyof OfficialApiChatConfig, unknown>>;
  const model = normalizeModel(object.model);
  const thinking = normalizeThinkingMode(object.thinking);
  return {
    model,
    thinking,
    reasoningEffort: thinking === 'enabled'
      ? normalizeReasoningEffort(object.reasoningEffort)
      : DEFAULT_OFFICIAL_API_CHAT_CONFIG.reasoningEffort,
  };
}

function normalizeModel(value: unknown): OfficialDeepSeekModel {
  return value === 'deepseek-v4-pro' ? 'deepseek-v4-pro' : 'deepseek-v4-flash';
}

function normalizeThinkingMode(value: unknown): OfficialDeepSeekThinkingMode {
  return value === 'enabled' ? 'enabled' : 'disabled';
}

function normalizeReasoningEffort(value: unknown): OfficialDeepSeekReasoningEffort {
  return value === 'max' ? 'max' : 'high';
}
