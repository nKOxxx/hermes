#!/usr/bin/env node
// ARES Agent Backend - Handles git operations, agent spawning
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const STATE_FILE = path.join(process.env.HOME, 'Library/Application Support/ares-agent/state.json');
const AGENTS_DIR = path.join(process.env.HOME, 'Library/Application Support/ares-agent/agents');

fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
fs.mkdirSync(AGENTS_DIR, { recursive: true });

let state = { repos: [], workspaces: [] };
try { if (fs.existsSync(STATE_FILE)) state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch(e) {}

function saveState() { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); }

const git = {
    async clone(url, localPath) {
        return new Promise((resolve, reject) => {
            spawn('git', ['clone', url, localPath], { stdio: 'inherit' }).on('close', code => code === 0 ? resolve() : reject(new Error('clone failed')));
        });
    },
    async worktree(repoPath, name) {
        const worktreePath = path.join(AGENTS_DIR, name);
        try { execSync(`git worktree add -b agent/${name} ${worktreePath}`, { cwd: repoPath, stdio: 'inherit' }); } catch(e) {}
        return worktreePath;
    },
    async status(worktreePath) {
        try {
            const output = execSync('git status --porcelain', { cwd: worktreePath, encoding: 'utf8' });
            return output.trim().split('\n').filter(l => l).map(l => ({ path: l.slice(3), status: l.slice(0, 2).trim() }));
        } catch(e) { return []; }
    },
    async removeWorktree(repoPath, name) {
        try { execSync(`git worktree remove ${path.join(AGENTS_DIR, name)} --force`, { cwd: repoPath, stdio: 'inherit' }); } catch(e) {}
    }
};

const agents = new Map();
const clients = new Set();

function broadcast(data) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(msg);
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
    
    let body = ''; req.on('data', chunk => body += chunk); req.on('end', () => {
        let data = {}; try { data = JSON.parse(body); } catch(e) {}
        
        // Routes
        if (req.url === '/events') {
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
            clients.add(res); req.on('close', () => clients.delete(res)); return;
        }
        
        if (req.url === '/api/repos' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(state.repos)); return;
        }
        
        if (req.url === '/api/repos' && req.method === 'POST') {
            const { url } = data;
            if (!url) { res.writeHead(400); res.end('{"error":"url required"}'); return; }
            const name = url.split('/').pop().replace('.git', '');
            const repoPath = path.join(process.env.HOME, 'Projects', name);
            state.repos.push({ id: Date.now().toString(), name, url, path: repoPath });
            saveState();
            if (!fs.existsSync(repoPath)) git.clone(url, repoPath).catch(console.error);
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(state.repos[state.repos.length-1])); return;
        }
        
        if (req.url.startsWith('/api/workspaces') && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(state.workspaces)); return;
        }
        
        if (req.url === '/api/workspaces' && req.method === 'POST') {
            const { repoId, name, branch } = data;
            const repo = state.repos.find(r => r.id === repoId);
            if (!repo) { res.writeHead(404); res.end('{"error":"repo not found"}'); return; }
            const id = Date.now().toString();
            const workspace = { id, repoId, name, branch: branch || `agent/${name}`, path: path.join(AGENTS_DIR, name), status: 'idle', tasks: [], files: [] };
            state.workspaces.push(workspace);
            saveState();
            git.worktree(repo.path, name).then(p => { workspace.path = p; saveState(); }).catch(console.error);
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(workspace)); return;
        }
        
        if (req.url.startsWith('/api/workspaces/') && req.method === 'DELETE') {
            const id = req.url.slice('/api/workspaces/'.length);
            const idx = state.workspaces.findIndex(ws => ws.id === id);
            if (idx >= 0) {
                const ws = state.workspaces[idx];
                const repo = state.repos.find(r => r.id === ws.repoId);
                if (repo) git.removeWorktree(repo.path, ws.name).catch(console.error);
                if (agents.has(id)) { try { process.kill(agents.get(id).pid); } catch(e) {} agents.delete(id); }
                state.workspaces.splice(idx, 1); saveState();
            }
            res.writeHead(200); res.end('{}'); return;
        }
        
        if (req.url.startsWith('/api/workspaces/') && req.method === 'POST') {
            const id = req.url.slice('/api/workspaces/'.length);
            const ws = state.workspaces.find(w => w.id === id);
            if (!ws) { res.writeHead(404); res.end('{"error":"workspace not found"}'); return; }
            
            const { action, task, text, taskId } = data;
            
            if (action === 'spawn') {
                ws.status = 'running';
                const taskObj = { id: Date.now().toString(), text: task || 'Default task', completed: false };
                ws.tasks = ws.tasks || [];
                ws.tasks.push(taskObj);
                saveState();
                broadcast({ type: 'task_added', workspaceId: id, task: taskObj });
                
                const proc = spawn('sh', ['-c', `echo "Agent started: ${task}"; sleep 3; echo "Done"`], { cwd: ws.path, env: process.env });
                agents.set(id, { pid: proc.pid, output: '' });
                
                proc.stdout.on('data', d => { const ws2 = agents.get(id); if (ws2) ws2.output += d.toString(); broadcast({ type: 'output', workspaceId: id, line: d.toString() }); });
                proc.on('close', () => { ws.status = 'completed'; saveState(); broadcast({ type: 'agent_complete', workspaceId: id }); });
                
                res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true, taskId: taskObj.id })); return;
            }
            
            if (action === 'kill') {
                if (agents.has(id)) { try { process.kill(agents.get(id).pid); } catch(e) {} agents.delete(id); }
                ws.status = 'stopped'; saveState();
                broadcast({ type: 'agent_killed', workspaceId: id });
                res.writeHead(200); res.end('{}'); return;
            }
            
            if (action === 'status') {
                const files = ws.path ? git.status(ws.path) : [];
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: ws.status, output: agents.get(id)?.output || '', files, tasks: ws.tasks || [] })); return;
            }
            
            if (action === 'add_task') {
                ws.tasks = ws.tasks || [];
                const task = { id: Date.now().toString(), text, completed: false };
                ws.tasks.push(task);
                saveState();
                broadcast({ type: 'task_added', workspaceId: id, task });
                res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(task)); return;
            }
            
            if (action === 'complete_task') {
                const task = ws.tasks?.find(t => t.id === taskId);
                if (task) { task.completed = true; saveState(); broadcast({ type: 'task_completed', workspaceId: id, taskId }); }
                res.writeHead(200); res.end('{}'); return;
            }
        }
        
        res.writeHead(404); res.end('{"error":"not found"}');
    });
});

server.listen(8765, () => {
    console.log('[ares] Backend running on http://localhost:8765');
    console.log('[ares] State:', STATE_FILE);
});

process.on('SIGINT', () => { for (const [id] of agents) { try { process.kill(id); } catch(e) {} } saveState(); process.exit(0); });
