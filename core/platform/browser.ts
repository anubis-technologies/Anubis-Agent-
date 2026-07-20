import {
  getCurrentBrowserExtensionEnvironment,
  type PlatformServices,
} from './capabilities';

export function createBrowserExtensionPlatformServices(): PlatformServices {
  return {
    environment: getCurrentBrowserExtensionEnvironment(),
    storage: {
      async get<T = unknown>(key: string): Promise<T | null> {
        const data = await chrome.storage.local.get(key) as Record<string, T | undefined>;
        return data[key] ?? null;
      },
      async set<T = unknown>(key: string, value: T): Promise<void> {
        await chrome.storage.local.set({ [key]: value });
      },
      async remove(key: string): Promise<void> {
        await chrome.storage.local.remove(key);
      },
    },
    runtime: {
      async sendMessage<T = unknown>(message: unknown): Promise<T> {
        return chrome.runtime.sendMessage(message) as Promise<T>;
      },
    },
    download: {
      async download(input): Promise<void> {
        const blob = new Blob([input.content], { type: input.mimeType });
        const url = URL.createObjectURL(blob);
        try {
          await chrome.downloads.download({
            url,
            filename: input.filename,
            saveAs: true,
          });
        } finally {
          setTimeout(() => URL.revokeObjectURL(url), 30_000);
        }
      },
    },
    getAssetUrl(path: string): string {
      return chrome.runtime.getURL(path.replace(/^\/+/, ''));
    },
  };
}
