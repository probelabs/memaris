<div align="center">

# Mnemaris

![Mnemaris](mnemaris.gif)

**Stop re-teaching your AI. Turn past sessions into persistent memory.**

[![npm version](https://badge.fury.io/js/@probelabs%2Fmnemaris.svg)](https://www.npmjs.com/package/@probelabs/mnemaris)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Part of Probe Ecosystem](https://img.shields.io/badge/Probe-Ecosystem-00ff88)](https://probelabs.com)

[Website](https://probelabs.com/mnemaris) • [Documentation](#-commands) • [NPM Package](https://www.npmjs.com/package/@probelabs/mnemaris)

</div>

---

## What is Mnemaris?

Mnemaris analyzes your Claude Code conversation history to extract patterns, preferences, and lessons learned. It turns every correction, rejected approach, and successful pattern into permanent memory that follows you across sessions.

**The Problem:** Every time you start a new Claude Code session, you're teaching the same preferences again. "Don't use sudo with npm." "Prefer async/await." "Always add error boundaries."

**The Solution:** Mnemaris reads your past sessions, identifies what worked and what didn't, then creates a personalized `CLAUDE.md` file with instructions tailored to your coding style.

## 🚀 Quick Start

```bash
# Install globally
npm install -g @probelabs/mnemaris

# Navigate to your project
cd your-project

# Preview insights (no file changes)
mnemaris

# Apply insights to CLAUDE.md
mnemaris --update
```

That's it! Mnemaris will analyze your Claude Code history and generate personalized instructions.

## 📖 How It Works

<table>
<tr>
<td width="33%" align="center">

**📝 Your Conversations**

Every correction, preference, and rejected approach in your Claude Code sessions

</td>
<td width="33%" align="center">

**🤖 AI Analysis**

Extracts patterns, identifies mistakes to avoid, and learns your coding style

</td>
<td width="33%" align="center">

**✨ Optimized CLAUDE.md**

Personalized instructions that make every future session start smarter

</td>
</tr>
</table>

## 🎯 Key Features

- **Smart Project Detection** - Automatically finds Claude Code conversations in your project
- **AI-Powered Analysis** - Uses advanced pattern recognition to extract meaningful insights
- **Memory Profiles** - Creates profiles of your coding style and preferences
- **Mistake Prevention** - Identifies recurring issues and provides actionable recommendations
- **Privacy First** - All analysis happens locally, your conversations never leave your machine

## 📚 Commands

### Basic Usage

```bash
mnemaris                    # Preview insights (default)
mnemaris --update          # Apply insights to CLAUDE.md
mnemaris /path/to/project  # Analyze specific project
```

### Advanced Options

| Option | Description |
|--------|-------------|
| `--update` | Write changes to CLAUDE.md (default: preview only) |
| `--all-sessions` | Analyze all sessions instead of recent ones |
| `--depth <n>` | Maximum messages to analyze (default: 200) |
| `--pattern-only` | Use pattern-matching instead of AI analysis |
| `--exclude-patterns` | Exclude sessions matching patterns |
| `--debug` | Show debug information |

### Other Commands

```bash
# Discover all Claude Code projects
mnemaris scan

# Export analysis results
mnemaris export my-project json
mnemaris export my-project markdown

# Focus on specific insights
mnemaris insights --type preferences
```

## 🛠️ Requirements

- Node.js 18+ or Bun runtime
- Claude Code with existing conversation history
- Optional: `ANTHROPIC_API_KEY` for AI-powered analysis (uses pattern-matching by default)

## 🔧 Development

```bash
# Clone the repository
git clone https://github.com/probelabs/mnemaris.git
cd mnemaris

# Install dependencies
bun install

# Run in development mode
bun run dev

# Build for production
bun run build
```

## 🌐 Part of the Probe Ecosystem

Mnemaris is part of the [Probe ecosystem](https://probelabs.com)—tools dedicated to improving human and AI collaboration in development.

- **[Probe](https://probelabs.com)** - Code search that understands context
- **[Vow](https://probelabs.com/vow)** - Accountability gates for AI agents
- **[AFK](https://probelabs.com/afk)** - Remote control for Claude Code via Telegram

## 📄 License

MIT © [Probe Labs](https://probelabs.com)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📮 Support

Questions or feedback? Reach out at [hello@probelabs.com](mailto:hello@probelabs.com)

---

*Mnemaris: From the ancient Greek μνήμη (mneme) meaning memory - helping AI remember and learn from every conversation.*