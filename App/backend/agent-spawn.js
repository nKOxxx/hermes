#!/usr/bin/env node
// ============================================================================
// OpenClaw Agent Spawner
// ============================================================================
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const task = args[0] || 'Default task';
const cwd = args[1] || process.cwd();

console.log('[spawner] Task:', task);
console.log('[spawner] CWD:', cwd);

// Find OpenClaw binary
function findOpenClaw() {
    const paths = [
        '/opt/homebrew/bin/openclaw',
        '/usr/local/bin/openclaw',
        path.join(process.env.HOME, '.local/bin/openclaw'),
        'openclaw'
    ];
    for (const p of paths) {
        try {
            require('child_process').execSync(p + ' --version', { stdio: 'ignore' });
            return p;
        } catch (e) {}
    }
    return 'openclaw';
}

const openclaw = findOpenClaw();
console.log('[spawner] OpenClaw:', openclaw);

// Spawn OpenClaw agent
const proc = spawn(openclaw, ['agent', '--task', task, '--cwd', cwd], {
    cwd,
    env: { ...process.env, FORCE_COLOR: '0' }
});

proc.stdout.on('data', d => process.stdout.write(d));
proc.stderr.on('data', d => process.stderr.write(d));
proc.on('close', code => process.exit(code));
proc.on('error', e => { console.error('[spawner]', e); process.exit(1); });
</parameter>
