<div align="center">

# Memaris

![Memaris](memaris.gif)

**Stop re-teaching your AI. Turn past sessions into persistent memory.**

[![npm version](https://badge.fury.io/js/@probelabs%2Fmnemaris.svg)](https://www.npmjs.com/package/@probelabs/mnemaris)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Part of Probe Ecosystem](https://img.shields.io/badge/Probe-Ecosystem-00ff88)](https://probelabs.com)

[Website](https://probelabs.com/memaris) • [Documentation](#-commands) • [NPM Package](https://www.npmjs.com/package/@probelabs/mnemaris)

</div>

---

## What is Memaris?

Memaris analyzes your Claude Code conversation history to extract patterns, preferences, and lessons learned. It turns every correction, rejected approach, and successful pattern into permanent memory that follows you across sessions.

**The Problem:** Every time you start a new Claude Code session, you're teaching the same preferences again. "Don't use sudo with npm." "Prefer async/await." "Always add error boundaries."

**The Solution:** Memaris reads your past sessions, identifies what worked and what didn't, then creates a personalized `CLAUDE.md` file with instructions tailored to your coding style.

## 🚀 Quick Start

```bash
# Navigate to your project
cd your-project

# Preview insights (no file changes)
npx -y @probelabs/mnemaris

# Apply insights to CLAUDE.md  
npx -y @probelabs/mnemaris --update
```

That's it! No installation needed - just run and go. Memaris will analyze your Claude Code history and generate personalized instructions.

> **💡 Pro tip:** The first command previews what insights will be added. Use `--update` to actually modify your CLAUDE.md file.

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
npx -y @probelabs/mnemaris                    # Preview insights (default)
npx -y @probelabs/mnemaris --update          # Apply insights to CLAUDE.md
npx -y @probelabs/mnemaris /path/to/project  # Analyze specific project
```

### Advanced Options

| Option | Description | Example |
|--------|-------------|---------|
| `--update` | Write changes to CLAUDE.md (default: preview only) | `npx -y @probelabs/mnemaris --update` |
| `--all` | Analyze all conversation history in batches | `npx -y @probelabs/mnemaris --all --update` |
| `--batch-size <n>` | Token batch size when using --all (default: 50000) | `npx -y @probelabs/mnemaris --all --batch-size 25000` |
| `--depth <n>` | Maximum messages to analyze (deprecated, use --tokens) | `npx -y @probelabs/mnemaris --depth 100` |
| `--tokens <n>` | Maximum tokens to analyze (default: 50000) | `npx -y @probelabs/mnemaris --tokens 25000` |
| `--pattern-only` | Use pattern-matching instead of AI analysis | `npx -y @probelabs/mnemaris --pattern-only` |
| `--exclude-patterns` | Exclude sessions matching patterns | `npx -y @probelabs/mnemaris --exclude-patterns "debug,test"` |
| `--debug` | Show debug information | `npx -y @probelabs/mnemaris --debug` |

### Pro Tips

```bash
# For large projects with lots of history
npx -y @probelabs/mnemaris --all --batch-size 30000 --update

# Quick analysis for recent work only
npx -y @probelabs/mnemaris --tokens 10000 --update

# Pattern-only analysis (faster, no API key needed)
npx -y @probelabs/mnemaris --pattern-only --update
```

### Other Commands

```bash
# Discover all Claude Code projects
npx -y @probelabs/mnemaris scan

# Export analysis results
npx -y @probelabs/mnemaris export my-project json
npx -y @probelabs/mnemaris export my-project markdown

# Focus on specific insights
npx -y @probelabs/mnemaris insights --type preferences
```

## 🛠️ Requirements

- **Node.js 18+** or **Bun runtime**
- **Claude Code** with existing conversation history in `~/.claude/projects/`
- **Optional:** `ANTHROPIC_API_KEY` for AI-powered analysis
  - Without API key: Uses fast pattern-matching analysis
  - With API key: Uses advanced AI analysis for deeper insights

### Environment Setup

```bash
# Optional: Enable AI-powered analysis
export ANTHROPIC_API_KEY="your-api-key-here"

# Verify Claude Code history exists
ls ~/.claude/projects/
```

> **Note:** Mnemaris works great with pattern-matching analysis (no API key required), but AI-powered analysis provides much richer insights.

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

## 🔍 Troubleshooting

### "No Claude Code projects found"
```bash
# Check if Claude Code history exists
ls ~/.claude/projects/

# If empty, use Claude Code first to create conversation history
```

### "Project not detected"
```bash
# Use absolute path
npx -y @probelabs/mnemaris /full/path/to/your/project --debug

# Or use the scan command to see all detected projects
npx -y @probelabs/mnemaris scan
```

### AI Analysis Not Working
```bash
# Verify API key is set
echo $ANTHROPIC_API_KEY

# Use pattern-only analysis as fallback
npx -y @probelabs/mnemaris --pattern-only --update
```

### Performance Issues
```bash
# Reduce analysis scope
npx -y @probelabs/mnemaris --tokens 10000 --update

# Use smaller batch sizes
npx -y @probelabs/mnemaris --all --batch-size 25000 --update
```

## 🌐 Part of the Probe Ecosystem

Memaris is part of the [Probe ecosystem](https://probelabs.com)—tools dedicated to improving human and AI collaboration in development.

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

*Memaris: From the ancient Greek μνήμη (mneme) meaning memory - helping AI remember and learn from every conversation.*