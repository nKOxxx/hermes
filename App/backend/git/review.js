const { execSync } = require('child_process');

function run(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 30000 }).trim();
}

function getDiff(repoPath, branch) {
  try {
    const defaultBranch = getBaseBranch(repoPath);
    return run(`git diff ${defaultBranch}..${branch}`, repoPath);
  } catch (err) {
    throw new Error(`Failed to get diff: ${err.message}`);
  }
}

function getDiffStat(repoPath, branch) {
  try {
    const defaultBranch = getBaseBranch(repoPath);
    const stat = run(`git diff --stat ${defaultBranch}..${branch}`, repoPath);
    const numstat = run(`git diff --numstat ${defaultBranch}..${branch}`, repoPath);

    let filesChanged = 0;
    let insertions = 0;
    let deletions = 0;
    const files = [];

    if (numstat) {
      for (const line of numstat.split('\n')) {
        const [added, removed, file] = line.split('\t');
        filesChanged++;
        insertions += parseInt(added) || 0;
        deletions += parseInt(removed) || 0;
        files.push({
          file,
          insertions: parseInt(added) || 0,
          deletions: parseInt(removed) || 0,
        });
      }
    }

    return { filesChanged, insertions, deletions, files, summary: stat };
  } catch (err) {
    return { filesChanged: 0, insertions: 0, deletions: 0, files: [], summary: '' };
  }
}

function getDiffByFile(repoPath, branch, filePath) {
  try {
    const defaultBranch = getBaseBranch(repoPath);
    return run(`git diff ${defaultBranch}..${branch} -- "${filePath}"`, repoPath);
  } catch {
    return '';
  }
}

function getCommitLog(repoPath, branch) {
  try {
    const defaultBranch = getBaseBranch(repoPath);
    return run(`git log --oneline ${defaultBranch}..${branch}`, repoPath);
  } catch {
    return '';
  }
}

function merge(repoPath, branch, message) {
  try {
    // First check for conflicts with --no-commit
    run(`git merge --no-commit --no-ff ${branch}`, repoPath);
    // If no conflicts, commit
    run(`git commit -m "${message.replace(/"/g, '\\"')}"`, repoPath);
    return { success: true };
  } catch (err) {
    // Check if there are conflicts
    if (hasConflicts(repoPath)) {
      // Abort the merge
      try { run('git merge --abort', repoPath); } catch { /* ignore */ }
      return { success: false, conflicts: true, message: 'Merge conflicts detected' };
    }
    return { success: false, conflicts: false, message: err.message };
  }
}

function hasConflicts(repoPath) {
  try {
    const status = run('git status --porcelain', repoPath);
    return status.split('\n').some(line => line.startsWith('UU') || line.startsWith('AA') || line.startsWith('DD'));
  } catch {
    return false;
  }
}

function getBaseBranch(repoPath) {
  try {
    const ref = run('git symbolic-ref refs/remotes/origin/HEAD', repoPath);
    return ref.replace('refs/remotes/origin/', '');
  } catch {
    try {
      run('git rev-parse --verify main', repoPath);
      return 'main';
    } catch {
      return 'master';
    }
  }
}

function getChangedFilesList(repoPath, branch) {
  try {
    const defaultBranch = getBaseBranch(repoPath);
    const output = run(`git diff --name-status ${defaultBranch}..${branch}`, repoPath);
    if (!output) return [];
    return output.split('\n').map(line => {
      const [status, ...parts] = line.split('\t');
      return { status, file: parts.join('\t') };
    });
  } catch {
    return [];
  }
}

module.exports = {
  getDiff,
  getDiffStat,
  getDiffByFile,
  getCommitLog,
  merge,
  hasConflicts,
  getBaseBranch,
  getChangedFilesList,
};
