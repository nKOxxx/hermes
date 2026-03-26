const EventEmitter = require('events');
const { stmts } = require('../db');
const { updateRunCost, releaseRateLimit } = require('../proxy/router');

class BaseAgent extends EventEmitter {
  constructor(runId, workspaceId, model, task, worktreePath) {
    super();
    this.runId = runId;
    this.workspaceId = workspaceId;
    this.model = model;
    this.task = task;
    this.worktreePath = worktreePath;
    this.process = null;
    this.pid = null;
    this.status = 'pending';
    this.inputTokens = 0;
    this.outputTokens = 0;
  }

  async start() {
    throw new Error('start() must be implemented by subclass');
  }

  async stop() {
    if (this.process) {
      this.status = 'killed';
      this.process.kill('SIGTERM');
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    }
    this._onComplete('killed', -1);
  }

  _onOutput(stream, content, metadata = null) {
    stmts.insertOutput.run(this.runId, stream, content, metadata ? JSON.stringify(metadata) : null);
    this.emit('output', { runId: this.runId, workspaceId: this.workspaceId, stream, content, metadata });
  }

  _onComplete(status, exitCode = 0) {
    this.status = status;
    stmts.updateRunStatus.run(status, exitCode, this.runId);
    stmts.updateWorkspaceStatus.run(status === 'completed' ? 'reviewing' : status, this.workspaceId);

    // Update cost
    updateRunCost(this.runId, this.inputTokens, this.outputTokens, this.model);
    releaseRateLimit(this.model);

    this.emit('complete', { runId: this.runId, workspaceId: this.workspaceId, status, exitCode });
  }

  getStatus() {
    return {
      runId: this.runId,
      workspaceId: this.workspaceId,
      model: this.model,
      status: this.status,
      pid: this.pid,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
    };
  }
}

module.exports = BaseAgent;
