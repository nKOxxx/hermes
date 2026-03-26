import { useEffect } from 'react';
import { useAgentStore } from '../stores/agent';
import { useRepoStore } from '../stores/repo';
import { useUIStore } from '../stores/ui';

const modelColors: Record<string, { bg: string; text: string }> = {
  claude: { bg: 'bg-cyan-400/15', text: 'text-cyan-400' },
  gpt: { bg: 'bg-green-400/15', text: 'text-green-400' },
  minimax: { bg: 'bg-violet-400/15', text: 'text-violet-400' },
};

const statusColors: Record<string, string> = {
  running: 'border-yellow-400/50',
  completed: 'border-green-400/30',
  failed: 'border-red-400/30',
  reviewing: 'border-cyan-400/50',
  idle: 'border-[#27272a]',
};

const statusDotColors: Record<string, string> = {
  running: 'bg-yellow-400 animate-pulse',
  completed: 'bg-green-400',
  failed: 'bg-red-400',
  reviewing: 'bg-cyan-400',
  idle: 'bg-zinc-600',
};

function formatElapsed(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const diff = Math.floor((now - start) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

export default function Dashboard() {
  const stats = useAgentStore((s) => s.dashboardStats);
  const activeRuns = useAgentStore((s) => s.activeRuns);
  const fetchDashboard = useAgentStore((s) => s.fetchDashboard);
  const repos = useRepoStore((s) => s.repos);
  const workspaces = useRepoStore((s) => s.workspaces);
  const selectWorkspace = useUIStore((s) => s.selectWorkspace);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 10000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const running = stats?.running ?? activeRuns.filter((r) => r.status === 'running').length;
  const completed = stats?.completed ?? activeRuns.filter((r) => r.status === 'completed').length;
  const failed = stats?.failed ?? activeRuns.filter((r) => r.status === 'failed').length;
  const totalCost = stats?.total_cost ?? 0;

  const repoMap = new Map(repos.map((r) => [r.id, r]));

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4 px-6 py-4 border-b border-[#27272a]">
        <StatCard label="Running" value={running} color="text-yellow-400" />
        <StatCard label="Completed" value={completed} color="text-green-400" />
        <StatCard label="Failed" value={failed} color="text-red-400" />
        <StatCard label="Total Cost" value={`$${totalCost.toFixed(2)}`} color="text-cyan-400" />
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {workspaces.length === 0 ? (
          <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
            No workspaces yet. Add a repo and create a workspace to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {workspaces.map((ws) => {
              const repo = repoMap.get(ws.repo_id);
              const run = activeRuns.find((r) => r.workspace_id === ws.id);
              const model = ws.model || run?.model || '';
              const mColors = modelColors[model] || { bg: 'bg-zinc-800', text: 'text-zinc-400' };
              const isRunning = ws.status === 'running';

              return (
                <button
                  key={ws.id}
                  onClick={() => selectWorkspace(ws.id)}
                  className={`text-left p-4 rounded-xl border bg-[#111113] hover:bg-[#18181b] transition-all ${
                    statusColors[ws.status] || statusColors.idle
                  } ${isRunning ? 'shadow-[0_0_15px_rgba(34,211,238,0.08)]' : ''}`}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${statusDotColors[ws.status] || statusDotColors.idle}`} />
                      <span className="text-xs text-[#a1a1aa]">{repo?.name || 'unknown'}</span>
                    </div>
                    {model && (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${mColors.bg} ${mColors.text}`}>
                        {model.toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Name */}
                  <h3 className="text-sm font-medium text-[#fafafa] mb-1 truncate">
                    {ws.name}
                  </h3>

                  {/* Task preview */}
                  <p className="text-xs text-zinc-500 line-clamp-2 mb-3 min-h-[2rem]">
                    {ws.task || run?.task || 'No task assigned'}
                  </p>

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-600 capitalize">{ws.status}</span>
                    {run?.started_at && (
                      <span className="text-[10px] text-zinc-600">
                        {formatElapsed(run.started_at)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="bg-[#111113] border border-[#27272a] rounded-lg px-4 py-3">
      <div className="text-xs text-[#a1a1aa] mb-1">{label}</div>
      <div className={`text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
