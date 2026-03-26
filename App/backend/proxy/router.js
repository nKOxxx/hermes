const { stmts } = require('../db');

// Cost per 1M tokens (approximate, update as pricing changes)
const PRICING = {
  claude: { input: 3.00, output: 15.00 },     // Claude Sonnet 4
  'claude-opus': { input: 15.00, output: 75.00 },
  gpt: { input: 2.50, output: 10.00 },        // GPT-4o
  'gpt-o1': { input: 15.00, output: 60.00 },
  minimax: { input: 1.00, output: 1.00 },     // MiniMax 2.7 estimate
};

function getApiKey(model) {
  const keys = {
    claude: process.env.ANTHROPIC_API_KEY,
    'claude-opus': process.env.ANTHROPIC_API_KEY,
    gpt: process.env.OPENAI_API_KEY,
    'gpt-o1': process.env.OPENAI_API_KEY,
    minimax: process.env.MINIMAX_API_KEY,
  };
  const key = keys[model];
  if (!key) throw new Error(`No API key configured for model: ${model}. Set the appropriate env var.`);
  return key;
}

function estimateCost(model, inputTokens, outputTokens) {
  const pricing = PRICING[model] || PRICING.claude;
  return ((inputTokens * pricing.input) + (outputTokens * pricing.output)) / 1_000_000;
}

function updateRunCost(runId, inputTokens, outputTokens, model) {
  const cost = estimateCost(model, inputTokens, outputTokens);
  stmts.updateRunTokens.run(inputTokens, outputTokens, cost, runId);
  return cost;
}

function getUsageSummary() {
  const dashboard = stmts.getDashboard.get();
  const byModel = stmts.getCostByModel.all();
  return { ...dashboard, byModel };
}

// Rate limiting (simple token bucket per model)
const rateLimits = {};
const RATE_LIMITS = {
  claude: { maxConcurrent: 10, cooldownMs: 500 },
  gpt: { maxConcurrent: 10, cooldownMs: 200 },
  minimax: { maxConcurrent: 10, cooldownMs: 200 },
};

function checkRateLimit(model) {
  const baseModel = model.startsWith('claude') ? 'claude' : model.startsWith('gpt') ? 'gpt' : 'minimax';
  const limit = RATE_LIMITS[baseModel] || { maxConcurrent: 3, cooldownMs: 1000 };

  if (!rateLimits[baseModel]) {
    rateLimits[baseModel] = { active: 0, lastCall: 0 };
  }

  const state = rateLimits[baseModel];
  const now = Date.now();

  if (state.active >= limit.maxConcurrent) {
    return { allowed: false, reason: `Max concurrent ${baseModel} agents (${limit.maxConcurrent}) reached` };
  }

  if (now - state.lastCall < limit.cooldownMs) {
    return { allowed: false, reason: `Rate limit cooldown for ${baseModel} (${limit.cooldownMs}ms)` };
  }

  state.active++;
  state.lastCall = now;
  return { allowed: true };
}

function releaseRateLimit(model) {
  const baseModel = model.startsWith('claude') ? 'claude' : model.startsWith('gpt') ? 'gpt' : 'minimax';
  if (rateLimits[baseModel] && rateLimits[baseModel].active > 0) {
    rateLimits[baseModel].active--;
  }
}

module.exports = {
  getApiKey,
  estimateCost,
  updateRunCost,
  getUsageSummary,
  checkRateLimit,
  releaseRateLimit,
  PRICING,
};
