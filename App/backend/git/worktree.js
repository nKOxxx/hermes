const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { DATA_DIR } = require('../db');

const WORKTREES_DIR = path.join(DATA_DIR, 'worktrees');
fs.mkdirSync(WORKTREES_DIR, { recursive: true });

function run(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 30000 }).trim();
}

function getWorktreePath(repoName, wsName) {
  return path.join(WORKTREES_DIR, repoName, wsName);
}

async function create(repoPath, repoName, wsName) {
  const branch = `agent/${wsName}`;
  const wtPath = getWorktreePath(repoName, wsName);

  fs.mkdirSync(path.dirname(wtPath), { recursive: true });

  // Create worktree with new branch from current HEAD
  try {
    run(`git worktree add -b "${branch}" "${wtPath}"`, repoPath);
  } catch (err) {
    // Branch might already exist
    if (err.message.includes('already exists')) {
      run(`git worktree add "${wtPath}" "${branch}"`, repoPath);
    } else {
      throw err;
    }
  }

  return { branch, path: wtPath };
}

function remove(repoPath, repoName, wsName) {
  const wtPath = getWorktreePath(repoName, wsName);
  const branch = `agent/${wsName}`;

  try {
    run(`git worktree remove "${wtPath}" --force`, repoPath);
  } catch {
    // If worktree remove fails, try prune
    try {
      run('git worktree prune', repoPath);
    } catch { /* ignore */ }
    // Force remove directory
    if (fs.existsSync(wtPath)) {
      fs.rmSync(wtPath, { recursive: true, force: true });
    }
  }

  // Delete the branch
  try {
    run(`git branch -D "${branch}"`, repoPath);
  } catch { /* branch may not exist */ }
}

function list(repoPath) {
  try {
    const output = run('git worktree list --porcelain', repoPath);
    const worktrees = [];
    let current = {};

    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current.path) worktrees.push(current);
        current = { path: line.slice(9) };
      } else if (line.startsWith('HEAD ')) {
        current.head = line.slice(5);
      } else if (line.startsWith('branch ')) {
        current.branch = line.slice(7);
      } else if (line === 'bare') {
        current.bare = true;
      } else if (line === 'detached') {
        current.detached = true;
      }
    }
    if (current.path) worktrees.push(current);

    return worktrees;
  } catch {
    return [];
  }
}

function getChangedFiles(worktreePath) {
  try {
    const output = run('git status --porcelain', worktreePath);
    if (!output) return [];
    return output.split('\n').map(line => ({
      status: line.slice(0, 2).trim(),
      file: line.slice(3),
    }));
  } catch {
    return [];
  }
}

function getDefaultBranch(repoPath) {
  try {
    const ref = run('git symbolic-ref refs/remotes/origin/HEAD', repoPath);
    return ref.replace('refs/remotes/origin/', '');
  } catch {
    // Fallback: check if main or master exists
    try {
      run('git rev-parse --verify main', repoPath);
      return 'main';
    } catch {
      return 'master';
    }
  }
}

async function cloneRepo(url, localPath) {
  return new Promise((resolve, reject) => {
    exec(`git clone "${url}" "${localPath}"`, { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`Clone failed: ${stderr}`));
      else resolve(localPath);
    });
  });
}

module.exports = {
  create,
  remove,
  list,
  getChangedFiles,
  getDefaultBranch,
  getWorktreePath,
  cloneRepo,
  WORKTREES_DIR,
};
