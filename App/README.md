# ARES Agent - macOS App

## Quick Start

```bash
cd ~/multi-agent/App
npm start
```

## Development

```bash
npm start        # Run in development mode
npm run build   # Build distributable .app
```

## Requirements

- macOS 12+ (Monterey or later)
- Node.js 18+ (for building)

## Building the App

When you have Xcode properly configured:

```bash
npm install -g electron-builder
npm run build
```

This creates `dist/ARESAgent.dmg` - a distributable installer.

## Current Status

- ✅ App structure created
- ✅ HTML/JS frontend
- ✅ Electron main process
- ⚠️ Native build requires Xcode command line tools
- ⚠️ Running requires display (can't run headless)

## Files

```
App/
├── main.js          # Electron main process
├── index.html       # Web UI
├── package.json      # Dependencies
└── dist/            # Built app (after build)
```

## Usage

1. Open ARES Agent app
2. Click "Spawn Agent" to create new agent
3. Agents work in parallel in git worktrees
4. Click agent to view status/logs
5. "Collect Results" to gather outputs
