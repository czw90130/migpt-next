# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MiGPT-Next is a TypeScript-based project that integrates Xiaomi smart speakers (小爱音箱) with AI language models, enabling custom message replies and intelligent voice interactions. The project is built as a monorepo using pnpm workspaces and Turborepo.

## Development Commands

### Installation
```bash
pnpm install
```

### Building
```bash
# Build all packages
pnpm build

# Build specific package (run from package directory)
pnpm build
```

### Code Quality
```bash
# Format and lint (uses Biome)
npx @biomejs/biome check --write

# Format and lint specific files
npx @biomejs/biome check --write --no-errors-on-unmatched --diagnostic-level=error <files>
```

### Publishing
```bash
# Version packages, build, and publish to npm (requires maintainer access)
pnpm publish-packages
```

## Monorepo Structure

This is a pnpm workspace monorepo with the following architecture:

### Apps (`apps/`)
- **`apps/next`**: Main package `@mi-gpt/next` - the primary entry point that users import. Exports the `MiGPT` class and orchestrates the entire system.
- **`apps/example`**: Example configuration showing how to use MiGPT-Next with Docker.

### Packages (`packages/`)
- **`@mi-gpt/engine`**: Core engine (`MiGPTEngine`, `BaseEngine`) - handles message lifecycle, AI invocation, and response coordination.
- **`@mi-gpt/miot`**: Xiaomi IoT integration - provides `MiNA` (voice/TTS), `MIoT` (device control), and authentication via `getMiService()`.
- **`@mi-gpt/chat`**: Chat management (`ChatBot`) - handles conversation history, context, and prompt templating with variable substitution.
- **`@mi-gpt/openai`**: OpenAI client wrapper - handles API calls with streaming, cancellation, and proxy support.
- **`@mi-gpt/stream`**: Stream response utilities (`StreamResponse`) - manages chunked text streaming for TTS playback.
- **`@mi-gpt/utils`**: Shared utilities - string manipulation, parsing, type utilities.
- **`@mi-gpt/config`**: Shared build configurations for Biome (linting/formatting) and tsup (bundling).

## Architecture Flow

1. **Entry Point**: `apps/next/src/index.ts` exports `MiGPT` singleton (instance of `MiJiaEngine`)
2. **Message Loop**: `MiJiaEngine.start()` polls for messages via `MiMessage.fetchNextMessage()` every 1+ second
3. **Message Handling**: `MiGPTEngine.onMessage()` processes messages:
   - Calls user's custom `onMessage` hook if provided
   - If message starts with `callAIKeywords` (default: ["请", "你"]), aborts Xiaomi's reply and calls AI
   - Supports returning `{ text }`, `{ url }`, or `{ stream }` for responses
4. **AI Integration**:
   - `ChatBot.chatWithStream()` constructs messages with history + system prompt
   - `OpenAI.chat()` handles streaming/non-streaming requests with cancellation support
   - `StreamResponse` chunks responses for sequential TTS playback
5. **Speaker Control**: `MiSpeaker` wraps `MiNA` to play text (TTS) or audio URLs via `play()`
6. **Device Control**: `MiOT.doAction()` sends device commands (volume, actions, etc.)

## Key Technical Details

### Message Processing
- Messages are polled from Xiaomi's service (not push-based)
- Only one message is processed at a time; new messages cancel previous AI requests
- Custom `onMessage` can return `{ handled: true }` to bypass default AI behavior

### Prompt System
- Supports variable substitution: `{varName}` in prompts is replaced with values from `context.vars`
- Built-in vars: `{msg}` (user message), `{time}` (UTC+8 timestamp)
- System, user, and assistant prompts are all templated

### Xiaomi Authentication
- Supports either `userId + password` OR `passToken`
- Device identification via `did` (device name or miotDID/mac)
- Debug mode prints all available devices for troubleshooting

### Streaming Architecture
- AI responses can be streamed for low-latency playback
- Each chunk is played sequentially via TTS
- Streaming is cancellable when new messages arrive

## Configuration Files

- **`turbo.json`**: Turborepo config - defines build task with dependency resolution
- **`pnpm-workspace.yaml`**: Workspace definition - includes `apps/*` and `packages/*`
- **`biome.json`**: Extends `@mi-gpt/config/biome` for consistent formatting/linting
- **`lefthook.yml`**: Git pre-commit hook - runs Biome check on staged files
- **`.changeset/config.json`**: Changesets config for versioning and publishing

## Deployment

### Docker
The project is packaged as a Docker image (`idootop/migpt-next`). Users mount their `config.js` file:
```bash
docker run -it --rm -v $(pwd)/config.js:/app/config.js idootop/migpt-next:latest
```

### Node.js
Users install `@mi-gpt/next` and import `MiGPT`:
```typescript
import { MiGPT } from "@mi-gpt/next";
await MiGPT.start({ /* config */ });
```

## Important Notes

- This project interfaces with Xiaomi's unofficial APIs and is for research/personal use only
- TTS reliability varies by device model; some devices may require custom `ttsCommand` parameters
- Continuous conversation mode was removed due to API limitations and response latency
- Package manager is locked to `pnpm@9.15.9` (specified in `package.json`)
- Minimum Node.js version: 16

## Testing Devices

When users report TTS issues, refer them to the FAQ in README.md about customizing `onMessage` with device-specific `ttsCommand` values (e.g., `engine.MiOT.doAction(5, 1, text)`).
