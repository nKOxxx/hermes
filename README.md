# ARES Agent v3

Personal multi-agent orchestrator — run parallel Claude, GPT & MiniMax agents in isolated git worktrees across all your repos.

Your own [Conductor](https://www.conductor.build), but self-hosted and multi-model.

## Features

- **Multi-model agents** — Claude Code (primary coding), GPT (research), MiniMax (general tasks)
- **Git worktree isolation** — each agent works in its own branch, no conflicts
- **Real-time streaming** — watch agents work via Server-Sent Events
- **Code review & merge** — diff viewer with approve/reject/merge workflow
- **Dashboard** — mission control view across all repos and agents
- **Unified proxy** — single layer for auth, rate limits, and cost tracking
- **SQLite persistence** — all state survives restarts, no external database needed
- **Electron desktop app** — native macOS app with tray icon

## Quick Start

```bash
cd App
npm install
cd frontend && npm install && npm run build && cd ..
npm start
```

### Development Mode

```bash
cd App
npm install
cd frontend && npm install && cd ..
npm run dev
```

## Architecture

```
App/
  main.js                    # Electron main process
  backend/
    server.js                # Express API server
    db.js                    # SQLite database
    proxy/router.js          # Unified model proxy with cost tracking
    agents/
      claude-agent.js        # Claude Code CLI spawner
      gpt-agent.js           # OpenAI API agent
      minimax-agent.js       # MiniMax API agent
    git/
      worktree.js            # Git worktree lifecycle
      review.js              # Diff, merge, conflict detection
    streaming/sse.js         # Server-Sent Events
  frontend/                  # React + Vite + Tailwind
    src/
      components/            # Sidebar, Dashboard, Terminal, DiffViewer, SpawnModal
      stores/                # Zustand state management
      hooks/                 # SSE + API hooks
```

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-...     # For Claude Code CLI
OPENAI_API_KEY=sk-...        # For GPT research agents
MINIMAX_API_KEY=...          # For MiniMax general agents
ARES_PORT=8765               # Backend port (default: 8765)
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/repos | List repositories |
| POST | /api/repos | Add repository (clone from URL) |
| POST | /api/workspaces | Create workspace (git worktree) |
| POST | /api/workspaces/:id/spawn | Spawn agent `{ model, task }` |
| POST | /api/workspaces/:id/kill | Stop running agent |
| GET | /api/workspaces/:id/diff | Get diff vs main branch |
| POST | /api/reviews/:id/merge | Merge agent's work to main |
| GET | /api/dashboard | All agents across all repos |
| GET | /api/proxy/usage | Cost & token tracking |
| GET | /events | SSE stream |

## License

MIT
