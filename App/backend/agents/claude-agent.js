const { spawn } = require('child_process');
const BaseAgent = require('./base-agent');
const { stmts } = require('../db');

class ClaudeAgent extends BaseAgent {
  constructor(runId, workspaceId, task, worktreePath, options = {}) {
    super(runId, workspaceId, options.model || 'claude', task, worktreePath);
    this.maxTurns = options.maxTurns || 50;
    this.claudeModel = options.claudeModel || 'sonnet'; // sonnet, opus, haiku
  }

  async start() {
    this.status = 'running';
    stmts.updateWorkspaceStatus.run('running', this.workspaceId);

    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--max-turns', String(this.maxTurns),
      '--dangerously-skip-permissions',
      '--verbose',
      this.task,
    ];

    // Add model flag if specified
    if (this.claudeModel && this.claudeModel !== 'sonnet') {
      args.unshift('--model', this.claudeModel);
    }

    this._onOutput('system', `Spawning Claude agent in ${this.worktreePath}...`);
    this._onOutput('system', `Task: ${this.task}`);
    this._onOutput('system', `Model: ${this.claudeModel} | Max turns: ${this.maxTurns}`);

    this.process = spawn('claude', args, {
      cwd: this.worktreePath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    this.pid = this.process.pid;
    stmts.updateRunPid.run(this.pid, this.runId);

    let buffer = '';

    this.process.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        this._parseLine(line.trim());
      }
    });

    this.process.stderr.on('data', (data) => {
      this._onOutput('stderr', data.toString());
    });

    this.process.on('close', (code) => {
      // Flush remaining buffer
      if (buffer.trim()) {
        this._parseLine(buffer.trim());
      }
      this._onComplete(code === 0 ? 'completed' : 'failed', code);
    });

    this.process.on('error', (err) => {
      this._onOutput('error', `Process error: ${err.message}`);
      this._onComplete('failed', -1);
    });

    return this.pid;
  }

  _parseLine(line) {
    try {
      const event = JSON.parse(line);
      this._handleStreamEvent(event);
    } catch {
      // Not JSON — raw text output
      this._onOutput('stdout', line);
    }
  }

  _handleStreamEvent(event) {
    switch (event.type) {
      case 'assistant':
        if (event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === 'text') {
              this._onOutput('text', block.text);
            } else if (block.type === 'tool_use') {
              this._onOutput('tool_use', block.input?.command || block.input?.content || JSON.stringify(block.input), {
                tool: block.name,
                id: block.id,
              });
            }
          }
        }
        // Track token usage
        if (event.message?.usage) {
          this.inputTokens += event.message.usage.input_tokens || 0;
          this.outputTokens += event.message.usage.output_tokens || 0;
        }
        break;

      case 'content_block_delta':
        if (event.delta?.type === 'text_delta') {
          this._onOutput('text_delta', event.delta.text);
        } else if (event.delta?.type === 'input_json_delta') {
          this._onOutput('tool_delta', event.delta.partial_json);
        }
        break;

      case 'content_block_start':
        if (event.content_block?.type === 'tool_use') {
          this._onOutput('tool_start', '', {
            tool: event.content_block.name,
            id: event.content_block.id,
          });
        }
        break;

      case 'content_block_stop':
        this._onOutput('tool_stop', '', { index: event.index });
        break;

      case 'message_start':
        if (event.message?.usage) {
          this.inputTokens += event.message.usage.input_tokens || 0;
        }
        break;

      case 'message_delta':
        if (event.usage) {
          this.outputTokens += event.usage.output_tokens || 0;
        }
        if (event.delta?.stop_reason) {
          this._onOutput('system', `Stop reason: ${event.delta.stop_reason}`);
        }
        break;

      case 'result':
        // Final result from --print mode
        if (event.result) {
          this._onOutput('result', event.result);
        }
        if (event.cost_usd) {
          this._onOutput('system', `Cost: $${event.cost_usd.toFixed(4)}`);
        }
        if (event.usage) {
          this.inputTokens = event.usage.input_tokens || this.inputTokens;
          this.outputTokens = event.usage.output_tokens || this.outputTokens;
        }
        break;

      default:
        // Log unknown events for debugging
        this._onOutput('debug', JSON.stringify(event));
    }
  }
}

module.exports = ClaudeAgent;
