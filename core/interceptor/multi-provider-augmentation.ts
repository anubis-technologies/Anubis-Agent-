/**
 * Anubis Agent — Multi-provider request augmentation v5 (v26)
 *
 * Changes vs v4:
 * - augmentChatGPTBody: also handles "developer" role (used by o-series models)
 *   as a fallback when no "system" message exists. Skips injection gracefully
 *   if the model rejects system-role messages entirely.
 * - augmentGeminiBody: accepts both {contents:[...]} (direct REST API shape)
 *   and tries to recover gracefully when systemInstruction is already set.
 *   Also added a safety check: returns null when body has no recognisable
 *   message array instead of crashing downstream.
 * - Both augmenters: guard against empty/whitespace-only system prompts.
 */

import type { Memory, Skill, ToolDescriptor, SystemPromptPreset, ModelType } from '../types';
import { renderToolSchemas } from '../prompt/augmentation';
import { createDefaultToolDescriptors } from '../tool/invocation';
import { DEFAULT_LOCALE } from '../i18n';

export interface ProviderAugmentState {
  memories:        Memory[];
  skills:          Skill[];
  toolDescriptors: ToolDescriptor[];
  activePreset:    SystemPromptPreset | null;
  modelType:       ModelType;
}

// ─── shared blocks ────────────────────────────────────────────────────────────

function getToolSchemas(state: ProviderAugmentState): string {
  const descriptors = state.toolDescriptors.length
    ? state.toolDescriptors
    : createDefaultToolDescriptors(DEFAULT_LOCALE);
  return renderToolSchemas(descriptors, DEFAULT_LOCALE);
}

function getMemoryBlock(state: ProviderAugmentState): string {
  const lines = state.memories.filter(m => m.content?.trim()).map(m => `- ${m.content.trim()}`);
  return lines.length ? `## Persistent Memory\n${lines.join('\n')}` : '';
}

function getPresetBlock(state: ProviderAugmentState): string {
  return state.activePreset?.instructions?.trim()
    ? `## Active Preset\n${state.activePreset.instructions.trim()}` : '';
}

function hasMcpTools(state: ProviderAugmentState): boolean {
  return state.toolDescriptors.some(d => (d as any).provider?.kind === 'mcp' || d.name?.startsWith('mcp_'));
}

// ─── ChatGPT prompt ───────────────────────────────────────────────────────────

export function buildChatGPTSystemPrompt(state: ProviderAugmentState): string {
  const toolSchemas = getToolSchemas(state);
  const memoryBlock = getMemoryBlock(state);
  const presetBlock = getPresetBlock(state);
  const mcpNote = hasMcpTools(state)
    ? `\nMCP servers are also connected. Tools prefixed with \`mcp_\` map directly to those servers — use them the same way as local tools.`
    : '';

  return [
    `## Anubis Agent Mode`,
    `You are connected to the Anubis Agent runtime.`,
    `When I ask you to perform an action that requires local execution (filesystem, shell, web, memory, Python, MCP, etc.):`,
    ``,
    `* Output exactly one XML tool call using the tool schema provided.`,
    `* Do not explain the tool call unless I ask.`,
    `* Wait for the tool result before issuing another tool call.`,
    `* Treat any message beginning with \`[Tool result: ...]\` as the real output from the executor.`,
    `* If the tool reports an error, determine the cause and emit a corrected tool call.`,
    `* Continue until the user's request is complete.`,
    `* Never invent tool results. Base your reasoning only on the tool results returned in the conversation.`,
    `* If the task can be completed without tools, answer normally instead of calling a tool.`,
    ``,
    `The external Anubis Agent — not you — is responsible for executing the XML and returning the result.`,
    ``,
    `## Execution Context`,
    ``,
    `This is NOT ChatGPT's built-in code interpreter or sandbox.`,
    `The Anubis Agent is a browser extension running on the user's own computer.`,
    `When you emit an XML tool tag, the extension intercepts it from your response text,`,
    `runs it locally on the user's machine, and sends you the result as the next message.`,
    ``,
    `This means:`,
    `- You CAN write files to the user's filesystem (use write_file or shell_exec).`,
    `- You CAN run real shell commands (use shell_exec — they run on the user's actual OS).`,
    `- You CAN access the user's Downloads folder, Desktop, documents, anywhere.`,
    `- Do NOT use ChatGPT's file download button or offer file links — use the tool tags.`,
    `- Do NOT say "I can't access your filesystem" — you can, through the tags below.${mcpNote}`,
    ``,
    `## CRITICAL — File path syntax inside tool JSON`,
    `The tool call body is parsed as strict JSON. Windows backslashes WILL break JSON parsing.`,
    `ALWAYS use forward slashes for file paths inside tool JSON, for example:`,
    `  CORRECT: "command": "New-Item -Path 'C:/Users/hhotc/Downloads/file.txt' -Value 'hello' -Force"`,
    `  WRONG:   "command": "New-Item -Path \\"C:\\\\Users\\\\hhotc\\\\" ← broken, never use backslash paths in JSON`,
    `PowerShell accepts forward slashes everywhere. Wrap path values in single quotes inside PowerShell strings.`,
    ``,
    `## Rules`,
    `1. ONE tool call per response. Wait for [Tool result] before the next.`,
    `2. On receiving [Tool result], immediately continue — no confirmation needed.`,
    `3. Never ask the user to run commands manually.`,
    `4. Keep XML tags clean — no prose inside the tags themselves.`,
    ``,
    `## Available Tools`,
    toolSchemas,
    memoryBlock,
    presetBlock,
  ].filter(Boolean).join('\n');
}

// ─── Gemini prompt ────────────────────────────────────────────────────────────

export function buildGeminiSystemPrompt(state: ProviderAugmentState): string {
  const toolSchemas = getToolSchemas(state);
  const memoryBlock = getMemoryBlock(state);
  const presetBlock = getPresetBlock(state);
  const mcpNote = hasMcpTools(state)
    ? `\nMCP (Model Context Protocol) servers are also available. Tools prefixed with \`mcp_\` connect to those servers and work the same way as local tools.`
    : '';

  return [
    `## Anubis Agent — Tool Runtime`,
    ``,
    `You are operating with the Anubis Agent browser extension, which gives you`,
    `the ability to take real actions on the user's computer through structured`,
    `XML tool calls embedded in your responses.`,
    ``,
    `How it works: when your response contains a valid XML tool tag (format below),`,
    `the extension reads it, executes the corresponding action on the user's local`,
    `machine, and sends you the result as the next conversation message.`,
    `You do not execute anything yourself — you only write the XML tag.${mcpNote}`,
    ``,
    `## Behaviour Rules`,
    ``,
    `- Emit exactly one XML tool call per response when a tool is needed.`,
    `- Do not explain the tool call unless asked to.`,
    `- After receiving a \`[Tool result: ...]\` message, continue the task immediately.`,
    `- If a tool returns an error, analyse it and emit a corrected call.`,
    `- Never fabricate tool results — only use what is returned in the conversation.`,
    `- If the task needs no tools, answer directly without using any tool tag.`,
    `- Do not decline to use tools on grounds of capability — the extension handles execution.`,
    ``,
    `## CRITICAL — File path syntax inside tool JSON`,
    `The tool call body is parsed as strict JSON. Windows backslashes break JSON parsing.`,
    `Always use forward slashes in file paths inside tool JSON, for example:`,
    `  CORRECT: "command": "New-Item -Path 'C:/Users/hhotc/Downloads/file.txt' -Value 'hello' -Force"`,
    `  WRONG:   any path containing backslash characters inside JSON strings`,
    `PowerShell accepts forward slashes everywhere. Wrap path values in single quotes.`,
    ``,
    `## Available Tools`,
    toolSchemas,
    memoryBlock,
    presetBlock,
  ].filter(Boolean).join('\n');
}

// ─── legacy export ────────────────────────────────────────────────────────────
export function buildSystemPromptString(state: ProviderAugmentState): string {
  return buildChatGPTSystemPrompt(state);
}

// ─── body augmenters ──────────────────────────────────────────────────────────

export function augmentChatGPTBody(bodyStr: string, state: ProviderAugmentState): string | null {
  try {
    const body = JSON.parse(bodyStr) as Record<string, unknown>;
    const msgs = Array.isArray(body.messages) ? [...(body.messages as any[])] : null;
    if (!msgs || msgs.length === 0) return null;

    const systemPrompt = buildChatGPTSystemPrompt(state);
    if (!systemPrompt.trim()) return null;

    // Try "system" role first (GPT-4, GPT-4o, etc.)
    // Fall back to "developer" role (o1, o3, o4-mini use this instead of "system")
    const sysIdx = msgs.findIndex((m: any) => m.role === 'system');
    const devIdx = sysIdx < 0 ? msgs.findIndex((m: any) => m.role === 'developer') : -1;

    if (sysIdx >= 0) {
      const ex = msgs[sysIdx];
      const existing = typeof ex.content === 'string' ? ex.content : '';
      msgs[sysIdx] = { ...ex, content: systemPrompt + (existing ? '\n\n---\n\n' + existing : '') };
    } else if (devIdx >= 0) {
      // o-series: prepend to existing developer message
      const ex = msgs[devIdx];
      const existing = typeof ex.content === 'string' ? ex.content : '';
      msgs[devIdx] = { ...ex, content: systemPrompt + (existing ? '\n\n---\n\n' + existing : '') };
    } else {
      // No system/developer message — prepend a system message.
      // If the model rejects "system" role it will simply ignore it; safe either way.
      msgs.unshift({ role: 'system', content: systemPrompt });
    }

    return JSON.stringify({ ...body, messages: msgs });
  } catch { return null; }
}

export function augmentGeminiBody(bodyStr: string, state: ProviderAugmentState): string | null {
  try {
    const body = JSON.parse(bodyStr) as Record<string, unknown>;

    // Must have a contents array — this is the Gemini REST API shape.
    // If the body has no contents (wrong endpoint, protobuf leak, etc.) bail out.
    if (!Array.isArray(body.contents) || body.contents.length === 0) return null;

    const systemPrompt = buildGeminiSystemPrompt(state);
    if (!systemPrompt.trim()) return null;

    const existing = (body as any).systemInstruction?.parts?.[0]?.text ?? '';
    return JSON.stringify({
      ...body,
      systemInstruction: {
        parts: [{ text: systemPrompt + (existing ? '\n\n---\n\n' + existing : '') }],
      },
    });
  } catch { return null; }
}
