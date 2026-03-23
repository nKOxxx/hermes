#!/bin/bash
# OpenClaw Agent Spawner
# Usage: ./spawn-agent.sh "task" "cwd"
TASK="$1"
CWD="$2"
shift 2

echo "[spawner] Task: $TASK"
echo "[spawner] CWD: $CWD"

# Find OpenClaw
OPENCLAW=""
for p in /opt/homebrew/bin/openclaw /usr/local/bin/openclaw ~/.local/bin/openclaw openclaw; do
    if "$p" --version &>/dev/null 2>&1; then
        OPENCLAW="$p"
        break
    fi
done

if [ -z "$OPENCLAW" ]; then
    echo "[spawner] OpenClaw not found in PATH"
    exit 1
fi

echo "[spawner] Using: $OPENCLAW"

# Spawn with exec to inherit process
exec "$OPENCLAW" agent --task "$TASK" --cwd "$CWD" "$@"
