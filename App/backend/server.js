#!/usr/bin/env node
// ============================================================================
// ARES Agent Backend v2.0 - Real OpenClaw Agent Integration
// ============================================================================

const { spawn, execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const { Readable } = require('stream');

// Config
const HOME = process.env.HOME || '/Users/ares';
const AGENT_DIR = path.join(HOME, 'Library/Application Support/ares-agent');
const STATE_FILE = path.join(AGENT_DIR, 'state.json');
const AGENTS_BASE = path.join(AGENT_DIR, 'agents');
const LOGS_DIR = path.join(AGENT_DIR, 'logs');

// Ensure directories
[AGENT_DIR, AGENTS_BASE, LOGS_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ============================================================================
// STATE
// ============================================================================

let state = { repos: [], workspaces: [], agents: {} };

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        }
    } catch (e) { console.error('[state] Load error:', e.message); }
}

function saveState() {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (e) { console.error('[state] Save error:', e.message); }
}

// ============================================================================
// LOGGING
// ============================================================================

function log(wsId, type, data) {
    const logFile = path.join(LOGS_DIR, `${wsId}.log`);
    const entry = `[${new Date().toISOString()}] [${type}] ${JSON.stringify(data)}\n`;
    fs.appendFileSync(logFile, entry);
    broadcast({ type, wsId, ...data });
}

// ============================================================================
// GIT OPERATIONS
// ============================================================================

const git = {
    clone(repoUrl, localPath) {
        return new Promise((resolve, reject) => {
            if (fs.existsSync(localPath)) {
                console.log(`[git] Exists: ${localPath}`);
                resolve(localPath);
                return;
            }
            console.log(`[git] Cloning ${repoUrl} → ${localPath}`);
            const child = spawn('git', ['clone', '--recursive', repoUrl, localPath], { stdio: 'inherit' });
            child.on('close', code => {
                if (code === 0) resolve(localPath);
                else reject(new Error(`Clone failed: ${code}`));
            });
        });
    },

    worktree(repoPath, wsName) {
        const wsPath = path.join(AGENTS_BASE, wsName);
        if (fs.existsSync(path.join(wsPath, '.git'))) {
            console.log(`[git] Worktree exists: ${wsPath}`);
            return Promise.resolve(wsPath);
        }
        return new Promise((resolve, reject) => {
            const branch = `agent/${wsName}`;
            console.log(`[git] Worktree ${branch} → ${wsPath}`);
            const child = spawn('git', ['worktree', 'add', '-b', branch, wsPath], { cwd: repoPath, stdio: 'inherit' });
            child.on('close', code => {
                if (code === 0) resolve(wsPath);
                else reject(new Error(`Worktree failed: ${code}`));
            });
        });
    },

    status(wsPath) {
        try {
            const out = execSync('git status --porcelain', { cwd: wsPath, encoding: 'utf8' });
            return out.trim().split('\n').filter(Boolean).map(line => ({
                status: line.slice(0, 2).trim(),
                path: line.slice(3)
            }));
        } catch (e) { return []; }
    },

    branches(repoPath) {
        try {
            const out = execSync('git branch -a', { cwd: repoPath, encoding: 'utf8' });
            return out.trim().split('\n').map(b => b.trim().replace(/^\* /, ''));
        } catch (e) { return ['main']; }
    },

    currentBranch(wsPath) {
        try {
            return execSync('git branch --show-current', { cwd: wsPath, encoding: 'utf8' }).trim();
        } catch (e) { return 'unknown'; }
    },

    removeWorktree(repoPath, wsName) {
        const wsPath = path.join(AGENTS_BASE, wsName);
        try {
            console.log(`[git] Removing worktree: ${wsPath}`);
            execSync(`git worktree remove "${wsPath}" --force`, { stdio: 'inherit' });
        } catch (e) { /* may not exist */ }
    },

    addRemote(wsPath, remoteUrl, remoteName = 'origin') {
        try {
            execSync(`git remote add ${remoteName} ${remoteUrl}`, { cwd: wsPath, stdio: 'inherit' });
        } catch (e) { /* may already exist */ }
    }
};

// ============================================================================
// OPENCLAW AGENT SPAWNING
// ============================================================================

const runningAgents = new Map(); // wsId -> { pid, proc, openclawSessionId }

// Find OpenClaw binary
function findOpenClaw() {
    const paths = [
        '/usr/local/bin/openclaw',
        '/opt/homebrew/bin/openclaw',
        path.join(HOME, '.local/bin/openclaw'),
        'openclaw' // PATH
    ];
    
    for (const p of paths) {
        try {
            execSync(`${p} --version`, { stdio: 'ignore' });
            console.log(`[openclaw] Found at: ${p}`);
            return p;
        } catch (e) { /* try next */ }
    }
    return 'openclaw'; // Fallback to PATH
}

const OPENCLAW_BIN = findOpenClaw();

const agentOps = {
    // Spawn real OpenClaw agent
    async spawn(ws, task) {
        if (runningAgents.has(ws.id)) {
            return { error: 'Agent already running in this workspace' };
        }

        console.log(`[agent] Spawning OpenClaw agent in ${ws.name} task: ${task}`);

        ws.status = 'running';
        ws.tasks = ws.tasks || [];
        const taskObj = {
            id: Date.now().toString(),
            text: task,
            completed: false,
            created: new Date().toISOString()
        };
        ws.tasks.push(taskObj);
        saveState();

        const worktreePath = ws.path || path.join(AGENTS_BASE, ws.name);
        const logFile = path.join(LOGS_DIR, `${ws.id}.log`);
        const sessionFile = path.join(LOGS_DIR, `${ws.id}.session`);

        // Build agent prompt
        const prompt = `You are an AI agent working in workspace: ${ws.name}
Task: ${task}
Working directory: ${worktreePath}

Instructions:
1. Read the task carefully
2. Analyze the codebase in ${worktreePath}
3. Make necessary changes
4. Commit your changes with clear messages
5. Report progress and completion

Start working now.`;

        // Spawn OpenClaw in interactive mode
        const proc = spawn(OPENCLAW_BIN, [
            'agent',
            '--task', prompt,
            '--cwd', worktreePath,
            '--session-file', sessionFile,
            '--output', 'stream'
        ], {
            cwd: worktreePath,
            env: {
                ...process.env,
                TASK: task,
                WORKSPACE_ID: ws.id,
                SESSION_FILE: sessionFile
            },
            stdio: ['pipe', 'pipe', 'pipe', 'pipe']
        });

        runningAgents.set(ws.id, {
            pid: proc.pid,
            proc,
            task,
            startTime: Date.now()
        });

        log(ws.id, 'spawn', { task, pid: proc.pid, worktreePath });

        // Handle stdout - stream to UI
        proc.stdout.on('data', data => {
            const line = data.toString();
            log(ws.id, 'stdout', { output: line });
            ws.lastOutput = line;
        });

        // Handle stderr
        proc.stderr.on('data', data => {
            const line = data.toString();
            log(ws.id, 'stderr', { output: line });
        });

        // Handle close
        proc.on('close', code => {
            console.log(`[agent] ${ws.id} exited with code ${code}`);
            ws.status = code === 0 ? 'completed' : 'failed';
            ws.exitCode = code;
            saveState();
            runningAgents.delete(ws.id);
            log(ws.id, 'complete', { code, duration: Date.now() - runningAgents.get(ws.id)?.startTime || 0 });
        });

        proc.on('error', err => {
            console.error(`[agent] ${ws.id} error:`, err);
            ws.status = 'failed';
            ws.error = err.message;
            saveState();
            runningAgents.delete(ws.id);
            log(ws.id, 'error', { error: err.message });
        });

        return { success: true, taskId: taskObj.id, sessionFile };
    },

    // Kill agent
    kill(wsId) {
        const agent = runningAgents.get(wsId);
        if (agent) {
            console.log(`[agent] Killing ${wsId} (pid ${agent.pid})`);
            try {
                process.kill(agent.pid, 'SIGTERM');
                setTimeout(() => {
                    const a = runningAgents.get(wsId);
                    if (a) {
                        try { process.kill(a.pid, 'SIGKILL'); } catch (e) {}
                    }
                }, 2000);
            } catch (e) {
                console.error('[agent] Kill error:', e.message);
            }
            runningAgents.delete(wsId);
        }

        const ws = state.workspaces.find(w => w.id === wsId);
        if (ws) {
            ws.status = 'stopped';
            saveState();
        }
        log(wsId, 'killed', {});
        return { success: true };
    },

    // Get agent output
    output(wsId) {
        const ws = state.workspaces.find(w => w.id === wsId);
        return ws?.lastOutput || '';
    },

    // Check if running
    isRunning(wsId) {
        return runningAgents.has(wsId);
    },

    // Get log
    getLog(wsId) {
        const logFile = path.join(LOGS_DIR, `${wsId}.log`);
        try {
            return fs.readFileSync(logFile, 'utf8');
        } catch (e) { return ''; }
    },

    // Get session ID
    getSession(wsId) {
        const ws = runningAgents.get(wsId);
        return ws?.openclawSessionId || null;
    }
};

// ============================================================================
// SSE BROADCAST
// ============================================================================

const clients = new Set();

function broadcast(data) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
        try { res.write(msg); } catch (e) { clients.delete(res); }
    }
}

// ============================================================================
// HTTP SERVER
// ============================================================================

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;
    const query = parsed.query;

    // SSE
    if (pathname === '/events') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        let data = {};
        try { data = body ? JSON.parse(body) : {}; } catch (e) {}

        // ====================================================================
        // REPOS
        // ====================================================================
        if (pathname === '/api/repos' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(state.repos));
            return;
        }

        if (pathname === '/api/repos' && req.method === 'POST') {
            const { url: repoUrl, path: localPath } = data;
            if (!repoUrl) { res.writeHead(400); res.end('{"error":"url required"}'); return; }

            const name = repoUrl.split('/').pop().replace('.git', '');
            const repoPath = localPath || path.join(HOME, 'Projects', name);
            const repo = {
                id: Date.now().toString(),
                name,
                url: repoUrl,
                path: repoPath,
                addedAt: new Date().toISOString()
            };
            state.repos.push(repo);
            saveState();

            // Async clone
            git.clone(repoUrl, repoPath).then(() => {
                log(repo.id, 'clone_complete', { path: repoPath });
            }).catch(e => {
                log(repo.id, 'clone_error', { error: e.message });
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(repo));
            return;
        }

        if (pathname.startsWith('/api/repos/') && req.method === 'DELETE') {
            const id = pathname.slice('/api/repos/'.length);
            state.repos = state.repos.filter(r => r.id !== id);
            saveState();
            res.writeHead(200); res.end('{}');
            return;
        }

        // ====================================================================
        // WORKSPACES
        // ====================================================================
        if (pathname === '/api/workspaces' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(state.workspaces));
            return;
        }

        if (pathname === '/api/workspaces' && req.method === 'POST') {
            const { repoId, name, branch } = data;
            const repo = state.repos.find(r => r.id === repoId);
            if (!repo) { res.writeHead(404); res.end('{"error":"Repo not found"}'); return; }

            const ws = {
                id: Date.now().toString(),
                repoId,
                name,
                branch: branch || `agent/${name}`,
                path: path.join(AGENTS_BASE, name),
                status: 'idle',
                tasks: [],
                files: [],
                created: new Date().toISOString(),
                lastOutput: ''
            };
            state.workspaces.push(ws);
            saveState();

            // Async worktree creation
            git.worktree(repo.path, name).then(wsPath => {
                ws.path = wsPath;
                // Add remote if repo has one
                if (repo.url) {
                    git.addRemote(wsPath, repo.url);
                }
                saveState();
                log(ws.id, 'worktree_ready', { path: wsPath });
            }).catch(e => {
                log(ws.id, 'worktree_error', { error: e.message });
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(ws));
            return;
        }

        if (pathname.startsWith('/api/workspaces/') && req.method === 'DELETE') {
            const wsId = pathname.slice('/api/workspaces/'.length);
            const ws = state.workspaces.find(w => w.id === wsId);
            if (ws) {
                agentOps.kill(wsId);
                const repo = state.repos.find(r => r.id === ws.repoId);
                if (repo) git.removeWorktree(repo.path, ws.name);
                state.workspaces = state.workspaces.filter(w => w.id !== wsId);
                saveState();
            }
            res.writeHead(200); res.end('{}');
            return;
        }

        // ====================================================================
        // WORKSPACE ACTIONS
        // ====================================================================
        if (pathname.startsWith('/api/workspaces/') && req.method === 'POST') {
            const wsId = pathname.slice('/api/workspaces/'.length);
            const ws = state.workspaces.find(w => w.id === wsId);
            if (!ws) { res.writeHead(404); res.end('{"error":"Workspace not found"}'); return; }

            const { action, task, taskId, text } = data;

            if (action === 'spawn') {
                const result = await agentOps.spawn(ws, task || 'Default task');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
                return;
            }

            if (action === 'kill') {
                const result = agentOps.kill(wsId);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
                return;
            }

            if (action === 'status') {
                ws.files = git.status(ws.path);
                ws.branch = git.currentBranch(ws.path);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: ws.status,
                    isRunning: agentOps.isRunning(wsId),
                    output: agentOps.output(wsId),
                    log: agentOps.getLog(wsId),
                    files: ws.files,
                    branch: ws.branch,
                    tasks: ws.tasks || []
                }));
                return;
            }

            if (action === 'add_task') {
                ws.tasks = ws.tasks || [];
                const taskObj = {
                    id: Date.now().toString(),
                    text,
                    completed: false,
                    created: new Date().toISOString()
                };
                ws.tasks.push(taskObj);
                saveState();
                broadcast({ type: 'task_added', wsId, task: taskObj });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(taskObj));
                return;
            }

            if (action === 'complete_task') {
                const t = ws.tasks?.find(t => t.id === taskId);
                if (t) { t.completed = true; saveState(); broadcast({ type: 'task_completed', wsId, taskId }); }
                res.writeHead(200); res.end('{}');
                return;
            }

            if (action === 'delete_task') {
                ws.tasks = (ws.tasks || []).filter(t => t.id !== taskId);
                saveState();
                res.writeHead(200); res.end('{}');
                return;
            }

            res.writeHead(404); res.end('{"error":"Unknown action"}');
            return;
        }

        // ====================================================================
        // AGENTS (global)
        // ====================================================================
        if (pathname === '/api/agents' && req.method === 'GET') {
            const agents = [];
            for (const [wsId, agent] of runningAgents) {
                const ws = state.workspaces.find(w => w.id === wsId);
                agents.push({
                    wsId,
                    name: ws?.name || wsId,
                    pid: agent.pid,
                    task: agent.task,
                    startTime: agent.startTime
                });
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(agents));
            return;
        }

        res.writeHead(404); res.end('{"error":"Not found"}');
    });
});

// ============================================================================
// START
// ============================================================================

loadState();
server.listen(8765, () => {
    console.log('[ARES] Backend v2.0 running on http://localhost:8765');
    console.log('[ARES] State:', STATE_FILE);
    console.log('[ARES] Agents dir:', AGENTS_BASE);
    console.log('[ARES] Logs:', LOGS_DIR);
});

process.on('SIGINT', () => {
    console.log('[ARES] Shutting down...');
    for (const [id] of runningAgents) agentOps.kill(id);
    saveState();
    process.exit(0);
});
