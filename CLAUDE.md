---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";

// import .css files directly and it works
import './index.css';

import { createRoot } from "react-dom/client";

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.

## AI Interaction Guidelines

### User Environment & Preferences
- **OS**: macOS (Darwin 23.6.0) with limited sudo access for system diagnostics
- **Communication style**: Expert level, concise responses preferred
- **Boundaries**: Will not kill critical system processes, prefers non-destructive debugging methods

### Critical Instructions
- **NEVER suggest killing system processes** if user explicitly states they don't want to kill them
- **Start with non-privileged tools** (ps, top, Activity Monitor) before attempting sudo-required diagnostics
- **If system diagnostic commands fail with permissions**, immediately pivot to user-accessible alternatives
- **For macOS system issues**, always provide context about normal vs abnormal behavior before suggesting fixes

### System Debugging Approach
1. Use basic process info commands first: `ps`, `top`
2. If detailed inspection is needed and fails due to permissions, suggest Activity Monitor GUI
3. Always explain both immediate fixes and long-term preventive measures
4. Focus on monitoring and diagnostic approaches rather than destructive fixes

### TodoWrite Usage
- Create structured plans with TodoWrite for complex system debugging tasks
- Track multiple diagnostic approaches systematically

# Claude Story Analyzer Development Notes

## Project Architecture
```
src/
├── parsers/           # Claude Code JSONL file parsing
├── analyzers/         # AI insight extraction (pattern-matching + AI-powered)
├── exporters/         # Report generation in multiple formats
├── cli/              # Command-line interface
└── types/            # TypeScript type definitions
```

## Key Implementation Insights

### 1. Claude Code Storage Format
- Conversations stored in `~/.claude/projects/[project-hash]/[session-id].jsonl`
- Project names encoded as `-Users-username-path-to-project`
- Each JSONL line is a message with `type`, `timestamp`, `message`, `uuid`, etc.
- Need to handle `user`, `assistant`, `summary`, and `tool_result` message types

### 2. Project Detection Strategy
- **Exact path match**: Most reliable, matches encoded paths exactly
- **Project name match**: Fallback, matches last directory segment  
- **Partial path match**: Last resort, matches common path segments
- Always pick most recently active project when multiple matches

### 3. AI-Powered vs Pattern-Matching Analysis
- **Pattern-matching**: Fast, regex-based, good for basic insights
- **AI-powered**: Requires API key, deep contextual analysis, slower but much better
- Chunk conversations into ~45k token segments for API calls
- Use single comprehensive prompt for both insights and user patterns

### 4. Development & Testing Tips

#### Quick Testing
```bash
# Test project detection
bun test-detector.ts

# Test simple analysis  
bun test-simple-analyze.ts

# Test specific depth
bun run dev analyze --depth 20 --debug
```

#### Build & Type Issues
```bash
# Separate tsconfig for declarations to avoid conflicts
tsconfig.json          # Main config with noEmit: true
tsconfig.build.json     # Build config for declarations

# Fix TypeScript strict null issues with !
const first = messages[0]!;  # Assert non-null
```

#### Common Problems
1. **Indentation errors**: Use consistent 2-space indentation
2. **API type issues**: Cast Anthropic response content as `any` if needed
3. **Progress bars**: Use cli-progress for long-running operations
4. **Rate limiting**: Add delays between API calls (1000ms recommended)

#### CLI Structure
- Separate command functions in `cli/commands/` for cleaner code
- Use Commander.js options properly with string defaults
- Handle missing API keys gracefully with helpful error messages

#### Testing Strategy
1. **Unit tests**: Test parsers and analyzers separately
2. **Integration tests**: Test with real JSONL files
3. **Manual testing**: Use current project as test case (meta!)
4. **Debug mode**: Always provide debug options for troubleshooting

#### Performance Optimization
- Limit message analysis with `--depth` parameter
- Use `--recent` flag to analyze only recent sessions
- Chunk large conversations for memory efficiency  
- Add progress indicators for long operations

## Environment Setup
```bash
# Required for AI-powered analysis
export ANTHROPIC_API_KEY=your_key_here

# Optional: faster package manager
export BUN_INSTALL="$HOME/.bun"
```

## Useful Commands
```bash
# Development
bun run dev analyze --debug              # Debug project detection
bun run dev analyze --depth 50          # Quick analysis
bun run dev analyze --ai-powered         # Full AI analysis

# Build & Deploy
bun run build                           # Build for production
bun test                               # Run tests
node dist/cli.js analyze               # Test built version
```

## Future Improvements
- Add conversation threading analysis
- Implement conversation search/filtering
- Export to more formats (Excel, PDF)
- Add real-time analysis of active sessions
- Implement conversation comparison between projects