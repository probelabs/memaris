# Mnemaris

> A memory-driven analysis tool for Claude Code conversations. Extract insights and improve future AI sessions.

Mnemaris analyzes your Claude Code conversation history to identify patterns, mistakes, and successful approaches. It creates actionable insights to help you improve future AI interactions by learning from past conversations.

## Features

- **Smart Project Detection**: Automatically detects Claude Code conversations in your current project
- **AI-Powered Analysis**: Uses Claude Code SDK to analyze conversation patterns and extract insights
- **Memory Profiles**: Creates profiles of your coding style, preferences, and common patterns
- **Mistake Prevention**: Identifies recurring issues and provides actionable recommendations
- **CLAUDE.md Integration**: Automatically updates project files with insights for future sessions
- **Session Filtering**: Excludes SDK analysis sessions and focuses on meaningful conversations

## Installation

```bash
npm install -g @probelabs/mnemaris
```

## Quick Start

Navigate to any project directory where you've used Claude Code:

```bash
# Basic analysis
mnemaris analyze

# Recent sessions only (last 10)
mnemaris analyze --recent

# AI-powered deep analysis
mnemaris analyze --ai-powered --depth 100

# Update CLAUDE.md with recommendations
mnemaris analyze --ai-powered --update-claude-md

# Dry run to preview CLAUDE.md changes
mnemaris analyze --ai-powered --update-claude-md --dry-run
```

## Commands

### `analyze [path]`

Analyze Claude Code conversations in the current or specified project directory.

**Options:**
- `--recent` - Analyze only the 10 most recent sessions
- `--ai-powered` - Use Claude Code SDK for deep AI analysis
- `--depth <number>` - Maximum number of messages to analyze (default: 50)
- `--confidence <number>` - Confidence threshold for pattern matching (default: 0.7)
- `--exclude-patterns <patterns>` - Comma-separated patterns to exclude sessions
- `--update-claude-md` - Update CLAUDE.md with recommendations
- `--dry-run` - Preview CLAUDE.md changes without writing
- `--debug` - Show project detection details
- `--debug-messages` - Show truncated large messages with file paths

### `scan`

Scan and list all available Claude Code projects.

### `export`

Export analysis results in various formats (JSON, markdown).

## How It Works

1. **Project Detection**: Mnemaris scans your current directory and matches it with Claude Code conversation storage in `~/.claude/projects/`

2. **Session Analysis**: Parses JSONL conversation files and extracts messages, filtering out SDK analysis sessions

3. **Pattern Recognition**: Uses either pattern-matching algorithms or AI analysis to identify:
   - Common mistakes and how to avoid them
   - Successful interaction patterns
   - User preferences and coding style
   - Environmental context (OS, tools, etc.)

4. **Insight Generation**: Creates actionable recommendations for improving future AI sessions

5. **Memory Integration**: Optionally updates `CLAUDE.md` with insights that Claude Code can use in future conversations

## Analysis Types

### Pattern Matching (Default)
Fast regex-based analysis that identifies:
- Tool usage patterns
- Error frequencies
- Conversation structures
- User behavior patterns

### AI-Powered Analysis (Recommended)
Uses Claude Code SDK for deeper analysis:
- Contextual mistake identification
- Success pattern recognition
- Personalized recommendations
- Style and preference profiling

## Examples

```bash
# Analyze current project with AI insights
mnemaris analyze --ai-powered

# Quick analysis of recent sessions
mnemaris analyze --recent --depth 25

# Update project memory with insights
mnemaris analyze --ai-powered --update-claude-md

# Preview recommendations without writing
mnemaris analyze --ai-powered --update-claude-md --dry-run

# Exclude certain session types
mnemaris analyze --exclude-patterns "analysis,debug" --ai-powered

# Debug project detection issues
mnemaris analyze --debug
```

## Output

Mnemaris provides structured insights including:

- **Mistakes to Avoid**: Common errors and anti-patterns with specific examples
- **Successful Patterns**: Effective approaches that led to good outcomes  
- **User Profile**: Your coding style, preferences, and environment
- **Recommendations**: Actionable advice for future Claude Code sessions

## Requirements

- Node.js ≥18.0.0
- Claude Code (conversations stored in `~/.claude/projects/`)

## Development

```bash
# Clone and install
git clone https://github.com/probelabs/mnemaris.git
cd mnemaris
bun install

# Development mode
bun run dev

# Build
bun run build

# Test
bun test
```

## License

MIT

---

*Mnemaris: From the ancient Greek μνήμη (mneme) meaning memory - helping AI remember and learn from every conversation.*
