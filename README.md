<p align="center">
  <img src="https://i.ibb.co/7mn1MRJ/Whats-App-Image-2026-07-01-at-8-32-51-PM.jpg" width="860" alt="Anubis Agent — AI agent workspace browser extension">
</p>

<h1 align="center">Anubis Agent</h1>

<p align="center">
  <strong>The AI agent that rules them all.</strong><br>
  A bilingual AI agent workspace for your browser — built for DeepSeek, with Gemini, ChatGPT, and partial Claude support. Memory, projects, Skills, MCP tools, browser control, automation, and multimodal media, all in one side panel.
</p>

<p align="center">
  <a href="https://anubis-agent.edgeone.app/"><img alt="Website" src="https://img.shields.io/badge/Website-anubis--agent.edgeone.app-6d28d9?style=flat-square"></a>
  <a href="https://microsoftedge.microsoft.com/addons/detail/anubis-agent/kbjcppdimbejplkbichigneccflgmocg"><img alt="Edge Add-ons" src="https://img.shields.io/badge/Edge%20Add--ons-available-16a34a?style=flat-square"></a>
  <a href="#license"><img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-2563eb?style=flat-square"></a>
</p>

<p align="center">
  <a href="https://www.paypal.com/ncp/payment/HKW49TPRDXG6G"><img alt="Donate" src="https://img.shields.io/badge/Donate-PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white"></a>
</p>

<p align="center">
  <a href="README_CN.md">中文说明</a> ·
  <a href="#product-positioning">Product Positioning</a> ·
  <a href="#feature-overview">Feature Overview</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#support-this-project">Support This Project</a>
</p>

---

## Support This Project

Anubis Agent is a free, open-source, one-person project. There is no company behind it, no funding round, and no ad revenue — just time spent nights and weekends building, fixing, and maintaining an extension that a lot of people now rely on every day.

If Anubis Agent has saved you time, made your workflow easier, or you just want to see it keep improving, please consider chipping in. Every donation — big or small — goes directly toward keeping this project alive: covering hosting, tooling, store fees, and the hours spent on new features and bug fixes.

**[Donate via PayPal →](https://www.paypal.com/ncp/payment/HKW49TPRDXG6G)**

You don't have to. But if you can, it genuinely helps. Thank you 🙏

---

## Product Positioning

Anubis Agent is an open-source browser extension that turns your browser into a full AI agent workspace. It is built primarily around [DeepSeek Web](https://chat.deepseek.com), with additional support for Gemini and ChatGPT, and early-stage support for Claude.

It runs on Chrome, Edge, and Firefox, and adds a bilingual (English / Simplified Chinese) side panel with long-term memory, Skills, MCP tools, browser control, scheduled automation, multimodal image/video analysis, conversation export, and saved snippets — all layered on top of the chat experience you already use.

**Website:** [anubis-agent.edgeone.app](https://anubis-agent.edgeone.app/)

## Table of Contents

- [Support This Project](#support-this-project)
- [Product Positioning](#product-positioning)
- [Feature Overview](#feature-overview)
- [Use Cases](#use-cases)
- [Core Features](#core-features)
- [Installation](#installation)
- [Building From Source](#building-from-source)
- [License](#license)
- [Support This Project (again)](#support-this-project)

## Feature Overview

| Area | What Anubis Agent provides |
|------|-----------------------------|
| Multi-provider support | Built for DeepSeek Web, with Gemini and ChatGPT support, and partial Claude support. |
| Agentic workflow | Turns chat into a workspace that can continue tasks, call tools, reuse memory, and run scheduled automation. |
| Side-panel chat | Adds side-panel chat, right-click text sending, tool-result rendering, across Chrome, Edge, and Firefox. |
| Bilingual UI | Switches between English and Simplified Chinese, keeping UI, tool descriptions, and model behavior consistent. |
| MCP tools | Manage MCP services, tool permissions, and execution status, with results returned into the same conversation. |
| Multimodal media | Attach images and videos for analysis through user-configured OpenAI / Gemini settings. |
| Browser control | Operate a user-selected browser tab once explicitly enabled. |
| Memory | Automatically saves, filters, and injects long-term memory across conversations. |
| Skills / `/skill` | Switch between built-in, custom, and GitHub-imported Skills for expert modes and task templates. |
| Projects | Group project instructions, project memories, and related conversations. |
| Artifacts | Create downloadable single files or project bundles for scripts, Markdown, JSON, HTML, and more. |
| Conversation export | Export conversations as HTML, Markdown, PDF, or an image manifest. |
| Saved snippets | Save, search, insert, and export reusable prompts and bookmarks. |
| Automation | Run scheduled tasks with manual start, cron/RRULE triggers, and status tracking. |
| Web search / fetch | Search the web or read a specified page when current information is needed. |

## Use Cases

- Turn your AI chat of choice into an agent workspace with tool execution, MCP, memory, and automation.
- Work in an English or Simplified Chinese workflow with matching UI and model behavior.
- Use side-panel chat, selected-text actions, and reusable prompts directly in Chrome, Edge, or Firefox.
- Add images or videos to a conversation so the model can continue explanations, summaries, or document tasks from the media analysis.
- Let the AI act in a user-selected browser tab, with explicit enable and detach controls.
- Save project context, personal preferences, and workflows as long-term memory and reusable Skills.
- Back up your own conversation history locally as readable, searchable files.
- Hand off multi-step tasks that need tool execution, web search, page reading, or scheduled follow-up.

## Core Features

### Side-Panel Chat
Direct chat with your model of choice from the side panel, right-click actions on selected text, reusable scenario templates, streaming responses, and independent conversations that don't mix with the current page.

### Multilingual Experience
Follow the browser language or set English / Simplified Chinese explicitly. The side panel, tool results, and model continuation prompts stay consistent, while your own memories, presets, and Skills are never rewritten or translated.

### Projects and Artifacts
Group related conversations under a project with shared instructions and memories, then generate downloadable single files or full project bundles for prototypes, scripts, and documentation — all handled locally, without a backend.

### Native-Feeling Tool Calls
Tool calls are detected and executed automatically, with clean collapsible result blocks, support for multiple tool calls per response, restore-after-refresh, and a live tok/s indicator while responses stream.

### Conversation Export
Export the current conversation as HTML, Markdown, or PDF directly from the reply action row, including attachment and image manifests, or save a single message as Markdown.

### Saved Items and Organization
Save reusable prompts, answer fragments, and reference notes; search and tag them; bulk-export as Markdown or JSON; and download code blocks straight from the page.

### Built-In Web Tools
`web_search` and `web_fetch` let the model pull in current information or read a specified page, then continue automatically to a final answer — with per-tool toggles and per-site permissions.

### Agentic Continuation
The model inspects tool results and decides its next step automatically, continuing through multi-step tasks with visible step blocks, refresh recovery, and a manual stop control.

### Browser Control
Opt-in control of a selected browser tab: navigation, clicks, hovers, form fills, key presses, and dialog handling, driven by text/structure snapshots rather than screenshots.

### MCP Tool System
Add remote or local MCP services, manage permissions and execution status, and enable the built-in Multimodal preset for image analysis through OpenAI and video analysis through Gemini.

### Memory System
Automatic long-term memory across four types — profile, feedback, topic, and reference — with smart injection, side-panel management, and JSON import/export.

### Skill System
Built-in, custom, GitHub-imported, and locally imported Skills, triggered with `/`, with independent enable/disable control and optional memory integration.

### Automation Tasks
Manual or scheduled tasks (cron / RRULE) that run in a dedicated conversation, with pause/edit/delete controls and trackable run status.

## Installation

1. Install Anubis Agent for Edge from the [Microsoft Edge Add-ons store](https://microsoftedge.microsoft.com/addons/detail/anubis-agent/kbjcppdimbejplkbichigneccflgmocg) (currently the only store listing available; Chrome Web Store and Firefox Add-ons support are planned).
2. Open the target chat (DeepSeek Web, Gemini, ChatGPT, or Claude) and open the Anubis Agent side panel.
3. Configure your language, memory, Skills, MCP tools, and any provider keys (OpenAI / Gemini) under Settings.
4. Optional: install native hosts for Multimodal or Shell/OfficeCLI support — see [Building From Source](#building-from-source) for the commands.

## Building From Source

```bash
npm install
npm run build:chrome    # or build:edge / build:firefox / build:all
npm run zip:chrome      # or zip:edge / zip:firefox / zip:all
```

Install the Multimodal Native Host:

```bash
npx deepseek-pp-multimodal-mcp install --browser chrome --extension-id <extension-id>
```

Install the Shell Native Host (for OfficeCLI document tools):

```bash
npx deepseek-pp-shell-host install --browser chrome --extension-id <extension-id>
```

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.

## Support This Project

Anubis Agent stays free and open source because people choose to support it. If it's useful to you, a donation of any size helps keep it going.

**[Donate via PayPal](https://www.paypal.com/ncp/payment/HKW49TPRDXG6G)** · **[Visit the website](https://anubis-agent.edgeone.app/)**

Thank you for using Anubis Agent — and thank you even more if you decide to support it. ❤️
**Website:** [anubis-agent.edgeone.app](https://anubis-agent.edgeone.app/)

## Table of Contents

- [Support This Project](#support-this-project)
- [Product Positioning](#product-positioning)
- [Feature Overview](#feature-overview)
- [Use Cases](#use-cases)
- [Core Features](#core-features)
- [Installation](#installation)
- [Building From Source](#building-from-source)
- [License](#license)
- [Support This Project (again)](#support-this-project)

## Feature Overview

| Area | What Anubis Agent provides |
|------|-----------------------------|
| Multi-provider support | Built for DeepSeek Web, with Gemini and ChatGPT support, and partial Claude support. |
| Agentic workflow | Turns chat into a workspace that can continue tasks, call tools, reuse memory, and run scheduled automation. |
| Side-panel chat | Adds side-panel chat, right-click text sending, tool-result rendering, across Chrome, Edge, and Firefox. |
| Bilingual UI | Switches between English and Simplified Chinese, keeping UI, tool descriptions, and model behavior consistent. |
| MCP tools | Manage MCP services, tool permissions, and execution status, with results returned into the same conversation. |
| Multimodal media | Attach images and videos for analysis through user-configured OpenAI / Gemini settings. |
| Browser control | Operate a user-selected browser tab once explicitly enabled. |
| Memory | Automatically saves, filters, and injects long-term memory across conversations. |
| Skills / `/skill` | Switch between built-in, custom, and GitHub-imported Skills for expert modes and task templates. |
| Projects | Group project instructions, project memories, and related conversations. |
| Artifacts | Create downloadable single files or project bundles for scripts, Markdown, JSON, HTML, and more. |
| Conversation export | Export conversations as HTML, Markdown, PDF, or an image manifest. |
| Saved snippets | Save, search, insert, and export reusable prompts and bookmarks. |
| Automation | Run scheduled tasks with manual start, cron/RRULE triggers, and status tracking. |
| Web search / fetch | Search the web or read a specified page when current information is needed. |

## Use Cases

- Turn your AI chat of choice into an agent workspace with tool execution, MCP, memory, and automation.
- Work in an English or Simplified Chinese workflow with matching UI and model behavior.
- Use side-panel chat, selected-text actions, and reusable prompts directly in Chrome, Edge, or Firefox.
- Add images or videos to a conversation so the model can continue explanations, summaries, or document tasks from the media analysis.
- Let the AI act in a user-selected browser tab, with explicit enable and detach controls.
- Save project context, personal preferences, and workflows as long-term memory and reusable Skills.
- Back up your own conversation history locally as readable, searchable files.
- Hand off multi-step tasks that need tool execution, web search, page reading, or scheduled follow-up.

## Core Features

### Side-Panel Chat
Direct chat with your model of choice from the side panel, right-click actions on selected text, reusable scenario templates, streaming responses, and independent conversations that don't mix with the current page.

### Multilingual Experience
Follow the browser language or set English / Simplified Chinese explicitly. The side panel, tool results, and model continuation prompts stay consistent, while your own memories, presets, and Skills are never rewritten or translated.

### Projects and Artifacts
Group related conversations under a project with shared instructions and memories, then generate downloadable single files or full project bundles for prototypes, scripts, and documentation — all handled locally, without a backend.

### Native-Feeling Tool Calls
Tool calls are detected and executed automatically, with clean collapsible result blocks, support for multiple tool calls per response, restore-after-refresh, and a live tok/s indicator while responses stream.

### Conversation Export
Export the current conversation as HTML, Markdown, or PDF directly from the reply action row, including attachment and image manifests, or save a single message as Markdown.

### Saved Items and Organization
Save reusable prompts, answer fragments, and reference notes; search and tag them; bulk-export as Markdown or JSON; and download code blocks straight from the page.

### Built-In Web Tools
`web_search` and `web_fetch` let the model pull in current information or read a specified page, then continue automatically to a final answer — with per-tool toggles and per-site permissions.

### Agentic Continuation
The model inspects tool results and decides its next step automatically, continuing through multi-step tasks with visible step blocks, refresh recovery, and a manual stop control.

### Browser Control
Opt-in control of a selected browser tab: navigation, clicks, hovers, form fills, key presses, and dialog handling, driven by text/structure snapshots rather than screenshots.

### MCP Tool System
Add remote or local MCP services, manage permissions and execution status, and enable the built-in Multimodal preset for image analysis through OpenAI and video analysis through Gemini.

### Memory System
Automatic long-term memory across four types — profile, feedback, topic, and reference — with smart injection, side-panel management, and JSON import/export.

### Skill System
Built-in, custom, GitHub-imported, and locally imported Skills, triggered with `/`, with independent enable/disable control and optional memory integration.

### Automation Tasks
Manual or scheduled tasks (cron / RRULE) that run in a dedicated conversation, with pause/edit/delete controls and trackable run status.

## Installation

1. Install Anubis Agent for your browser from the [Chrome Web Store](https://chromewebstore.google.com/detail/deepseek++/kdmpkkahkhdmdhfkdihkopikgcocbpbf?hl=zh-CN), Edge Add-ons, or Firefox Add-ons (where available).
2. Open the target chat (DeepSeek Web, Gemini, ChatGPT, or Claude) and open the Anubis Agent side panel.
3. Configure your language, memory, Skills, MCP tools, and any provider keys (OpenAI / Gemini) under Settings.
4. Optional: install native hosts for Multimodal or Shell/OfficeCLI support — see [Building From Source](#building-from-source) for the commands.

## Building From Source

```bash
npm install
npm run build:chrome    # or build:edge / build:firefox / build:all
npm run zip:chrome      # or zip:edge / zip:firefox / zip:all
```

Install the Multimodal Native Host:

```bash
npx deepseek-pp-multimodal-mcp install --browser chrome --extension-id <extension-id>
```

Install the Shell Native Host (for OfficeCLI document tools):

```bash
npx deepseek-pp-shell-host install --browser chrome --extension-id <extension-id>
```

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.

## Support This Project

Anubis Agent stays free and open source because people choose to support it. If it's useful to you, a donation of any size helps keep it going.

**[Donate via PayPal](https://www.paypal.com/ncp/payment/HKW49TPRDXG6G)** · **[Visit the website](https://anubis-agent.edgeone.app/)**

Thank you for using Anubis Agent — and thank you even more if you decide to support it. ❤️
