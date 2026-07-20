import { useEffect, useState } from 'react';
import {
  PROVIDERS,
  type ProviderId,
  type ProviderConfig,
} from '../../../core/providers/provider-adapter';

const PROVIDER_COLORS: Record<ProviderId, string> = {
  deepseek: '#4d6bfe',
  chatgpt:  '#1ac36a',
  gemini:   '#4285f4',
  claude:   '#d48c46',
};

const PROVIDER_STATUS: Record<ProviderId, string> = {
  deepseek: 'DOM-native · No API key · Full agent loop',
  chatgpt:  'DOM mode · Any GPT/o-series model, current or future',
  gemini:   'DOM mode · Any Gemini model, current or future',
  claude:   'API · Any Claude model',
};

export default function ProviderPage() {
  const [activeId, setActiveId]       = useState<ProviderId>('deepseek');
  const [domMode,  setDomMode]        = useState(true);
  const [apiKeys,  setApiKeys]        = useState<Partial<Record<ProviderId, string>>>({});
  const [inputKey, setInputKey]       = useState('');
  const [showKey,  setShowKey]        = useState(false);
  const [saved,    setSaved]          = useState(false);

  useEffect(() => {
    const allKeys = Object.values(PROVIDERS).map((p) => p.apiKeyStorageKey);
    chrome.storage.local.get(['anubis_provider', 'anubis_dom_mode', ...allKeys], (d) => {
      if (d.anubis_provider) setActiveId(d.anubis_provider as ProviderId);
      if (typeof d.anubis_dom_mode === 'boolean') setDomMode(d.anubis_dom_mode);

      const keyMap: Partial<Record<ProviderId, string>> = {};
      for (const p of Object.values(PROVIDERS)) {
        if (d[p.apiKeyStorageKey]) keyMap[p.id]  = d[p.apiKeyStorageKey];
      }
      setApiKeys(keyMap);
    });

    // Live-sync: if the background service worker auto-detects you switched to
    // (or typed the URL of) a different provider's tab, reflect it here
    // immediately — no manual "Launch" click required.
    const onMessage = (msg: any) => {
      if (msg?.type === 'ANUBIS_PROVIDER_AUTO_DETECTED' && msg.providerId) {
        setActiveId(msg.providerId as ProviderId);
      }
    };
    const onStorageChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.anubis_provider?.newValue) {
        setActiveId(changes.anubis_provider.newValue as ProviderId);
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    chrome.storage.onChanged.addListener(onStorageChange);
    return () => {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.storage.onChanged.removeListener(onStorageChange);
    };
  }, []);

  function selectProvider(id: ProviderId) {
    setActiveId(id);
    setInputKey('');
    chrome.storage.local.set({ anubis_provider: id });
  }

  function toggleDom(v: boolean) {
    setDomMode(v);
    chrome.storage.local.set({ anubis_dom_mode: v });
  }

  function saveKey() {
    if (!inputKey.trim()) return;
    const cfg = PROVIDERS[activeId];
    chrome.storage.local.set({ [cfg.apiKeyStorageKey]: inputKey.trim() });
    setApiKeys((prev) => ({ ...prev, [activeId]: inputKey.trim() }));
    setInputKey('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  async function launch() {
    const url = PROVIDERS[activeId].url;
    const hostname = new URL(url).hostname;
    // If a tab for this provider is already open anywhere, just focus it —
    // don't spawn a duplicate. This also re-selects it as the active provider.
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find((t) => {
      try { return t.url && new URL(t.url).hostname === hostname; } catch { return false; }
    });
    if (existing?.id != null) {
      await chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId != null) await chrome.windows.update(existing.windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url });
    }
  }

  const acc = PROVIDER_COLORS[activeId];
  const activeCfg = PROVIDERS[activeId];

  return (
    <div style={{ padding: '14px', fontFamily: 'Inter, sans-serif', color: 'var(--ds-text)' }}>

      {/* ── Provider cards ── */}
      <div style={{ fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--ds-text-tertiary)', marginBottom: '10px' }}>
        AI Provider
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
        {(Object.values(PROVIDERS) as ProviderConfig[]).map((p) => {
          const sel   = p.id === activeId;
          const color = PROVIDER_COLORS[p.id];
          const hasKey = !!apiKeys[p.id];
          return (
            <button
              key={p.id}
              onClick={() => selectProvider(p.id)}
              style={{
                position: 'relative',
                background: sel ? `${color}11` : 'var(--ds-surface)',
                border: `1px solid ${sel ? color : 'var(--ds-border)'}`,
                borderRadius: '10px',
                padding: '11px 10px 9px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.16s ease',
                boxShadow: sel ? `0 0 0 1px ${color}44, 0 4px 14px ${color}1a` : 'none',
              }}
            >
              {sel && (
                <span style={{
                  position: 'absolute', top: '8px', right: '8px',
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: color, boxShadow: `0 0 6px ${color}`,
                }} />
              )}
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ds-text)', marginBottom: '2px' }}>
                {p.name}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--ds-text-tertiary)', lineHeight: 1.4 }}>
                {PROVIDER_STATUS[p.id]}
              </div>
              {hasKey && (
                <div style={{ marginTop: '5px', fontSize: '9px', letterSpacing: '1px', textTransform: 'uppercase', color }}>
                  ● key saved
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Model note ── */}
      <div style={{
        marginBottom: '12px', fontSize: '11px', lineHeight: 1.5,
        color: 'var(--ds-text-tertiary)', background: 'var(--ds-surface)',
        border: '1px solid var(--ds-border)', borderRadius: '9px', padding: '9px 12px',
      }}>
        No model list to keep in sync — Anubis Agent works with <strong style={{ color: 'var(--ds-text)' }}>any model</strong> you have selected in {activeCfg.name}'s own model switcher on the site itself, current or future.
      </div>

      {/* ── DOM mode toggle ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        background: 'var(--ds-surface)', border: '1px solid var(--ds-border)',
        borderRadius: '9px', padding: '9px 12px', marginBottom: '12px',
      }}>
        <label style={{ position: 'relative', width: '32px', height: '18px', flexShrink: 0, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={domMode}
            onChange={(e) => toggleDom(e.target.checked)}
            style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
          />
          <span style={{
            position: 'absolute', inset: 0,
            background: domMode ? `${acc}44` : 'var(--ds-border)',
            borderRadius: '18px',
            border: `1px solid ${domMode ? acc : 'var(--ds-border)'}`,
            transition: 'all 0.16s ease',
          }}>
            <span style={{
              position: 'absolute',
              top: '2px', left: domMode ? '13px' : '2px',
              width: '12px', height: '12px', borderRadius: '50%',
              background: domMode ? acc : 'var(--ds-text-tertiary)',
              transition: 'all 0.16s ease',
            }} />
          </span>
        </label>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ds-text)' }}>DOM Mode</div>
          <div style={{ fontSize: '10px', color: 'var(--ds-text-tertiary)' }}>
            Inject into web UI — no API key needed (like DeepSeek)
          </div>
        </div>
      </div>

      {/* ── API Key ── */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--ds-text-tertiary)', marginBottom: '6px' }}>
          API Key ({activeCfg.name})
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveKey()}
              placeholder={apiKeys[activeId] ? '••••••••••• (saved)' : `${activeCfg.name} API key...`}
              style={{
                width: '100%', padding: '9px 32px 9px 10px',
                background: 'var(--ds-surface)', border: '1px solid var(--ds-border)',
                borderRadius: '8px', fontSize: '12px', color: 'var(--ds-text)',
                fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              style={{
                position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--ds-text-tertiary)', fontSize: '13px', padding: '2px',
              }}
            >
              {showKey ? '🙈' : '👁'}
            </button>
          </div>
          <button
            onClick={saveKey}
            disabled={!inputKey.trim()}
            style={{
              padding: '9px 14px', borderRadius: '8px', border: 'none',
              background: saved ? '#1ac36a' : acc,
              color: '#fff', fontSize: '12px', fontWeight: 600,
              cursor: inputKey.trim() ? 'pointer' : 'not-allowed',
              opacity: inputKey.trim() ? 1 : 0.5,
              transition: 'all 0.18s ease', whiteSpace: 'nowrap',
            }}
          >
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Launch ── */}
      <button
        onClick={launch}
        style={{
          width: '100%', padding: '11px', borderRadius: '9px',
          border: `1px solid ${acc}55`, background: `${acc}0d`,
          color: acc, fontSize: '13px', fontWeight: 600,
          cursor: 'pointer', letterSpacing: '0.8px', transition: 'all 0.16s ease',
          marginBottom: '12px',
        }}
      >
        Open / Switch to {activeCfg.name} tab →
      </button>
      <div style={{ fontSize: '10px', color: 'var(--ds-text-tertiary)', marginTop: '-6px', marginBottom: '12px', lineHeight: 1.4 }}>
        Optional — Anubis also works automatically if you just navigate to {activeCfg.name} yourself or switch to a tab that's already open there.
      </div>

      {/* ── Feature pills ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
        {['MCP Tools','Shell','Browser Control','File System','Memory','Skills','Web Search','Automation','All Models'].map((f) => (
          <span key={f} style={{
            fontSize: '9px', letterSpacing: '1px', textTransform: 'uppercase',
            padding: '3px 8px', borderRadius: '20px',
            background: 'var(--ds-surface)', border: '1px solid var(--ds-border)',
            color: 'var(--ds-text-tertiary)',
          }}>{f}</span>
        ))}
      </div>
    </div>
  );
}
