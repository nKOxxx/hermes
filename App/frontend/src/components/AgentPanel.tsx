import { useEffect, useState } from 'react';
import { useUIStore } from '../stores/ui';
import { useRepoStore } from '../stores/repo';
import { useAgentStore } from '../stores/agent';
import { api } from '../hooks/useAPI';
import Terminal from './Terminal';
import SpawnModal from './SpawnModal';

interface TaskItem {
  id: string;
  title: string;
  completed: boolean;
}

interface WorkspaceDetail {
  id: string;
  branch: string;
  status: string;
  model?: string;
  changed_files?: string[];
}

export default function AgentPanel() {
  const selectedId = useUIStore((s) => s.selectedWorkspaceId);
  const setMode = useUIStore((s) => s.setMode);
  const setSpawnModalOpen = useUIStore((s) => s.setSpawnModalOpen);
  const workspaces = useRepoStore((s) => s.workspaces);
  const repos = useRepoStore((s) => s.repos);
  const updateWorkspace = useRepoStore((s) => s.updateWorkspace);
  const outputBuffers = useAgentStore((s) => s.outputBuffers);
  const killAgent = useAgentStore((s) => s.killAgent);
  const activeRuns = useAgentStore((s) => s.activeRuns);

  const [detail, setDetail] = useState<WorkspaceDetail | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [taskInput, setTaskInput] = useState('');
  const [killing, setKilling] = useState(false);

  const workspace = workspaces.find((w) => w.id === selectedId);
  const repo = repos.find((r) => r.id === workspace?.repo_id);
  const run = activeRuns.find((r) => r.workspace_id === selectedId);
  const lines = (selectedId ? outputBuffers.get(selectedId) : undefined) ?? [];

  // Fetch workspace detail
  useEffect(() => {
    if (!selectedId) return;
    api<WorkspaceDetail>('GET', `/api/workspaces/${selectedId}`)
      .then(setDetail)
      .catch(() => {});
  }, [selectedId, workspace?.status]);

  // Fetch tasks
  useEffect(() => {
    if (!selectedId) return;
    api<TaskItem[]>('GET', `/api/workspaces/${selectedId}/tasks`)
      .then(setTasks)
      .catch(() => {});
  }, [selectedId]);

  const handleKill = async () => {
    if (!selectedId) return;
    setKilling(true);
    try {
      await killAgent(selectedId);
      updateWorkspace(selectedId, { status: 'idle' });
    } catch (err) {
      console.error('Kill failed:', err);
    } finally {
      setKilling(false);
    }
  };

  const handleReview = async () => {
    if (!selectedId) return;
    try {
      await api('POST', `/api/workspaces/${selectedId}/review`);
      updateWorkspace(selectedId, { status: 'reviewing' });
      setMode('review');
    } catch (err) {
      console.error('Review failed:', err);
    }
  };

  const handleAddTask = async () => {
    if (!selectedId || !taskInput.trim()) return;
    try {
      const task = await api<TaskItem>('POST', `/api/workspaces/${selectedId}/tasks`, {
        title: taskInput.trim(),
      });
      setTasks((prev) => [...prev, task]);
      setTaskInput('');
    } catch (err) {
      console.error('Add task failed:', err);
    }
  };

  const handleToggleTask = async (task: TaskItem) => {
    try {
      if (!task.completed) {
        await api('PATCH', `/api/tasks/${task.id}/complete`);
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, completed: true } : t))
        );
      } else {
        await api('DELETE', `/api/tasks/${task.id}`);
        setTasks((prev) => prev.filter((t) => t.id !== task.id));
      }
    } catch (err) {
      console.error('Task toggle failed:', err);
    }
  };

  if (!selectedId || !workspace) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
        Select a workspace from the sidebar
      </div>
    );
  }

  const modelBadge = workspace.model || run?.model;
  const modelColors: Record<string, string> = {
    claude: 'bg-cyan-400/15 text-cyan-400',
    gpt: 'bg-green-400/15 text-green-400',
    minimax: 'bg-violet-400/15 text-violet-400',
  };

  const isRunning = workspace.status === 'running';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#27272a] bg-[#111113]">
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">{repo?.name}</span>
          <span className="text-zinc-600">/</span>
          <span className="text-sm font-medium text-[#fafafa]">{workspace.name}</span>
          {modelBadge && (
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                modelColors[modelBadge] || 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {modelBadge.toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSpawnModalOpen(true)}
            className="px-3 py-1.5 text-xs bg-cyan-400 text-black font-medium rounded-lg hover:bg-cyan-300 transition-colors"
          >
            Spawn Agent
          </button>
          {isRunning && (
            <button
              onClick={handleKill}
              disabled={killing}
              className="px-3 py-1.5 text-xs border border-red-400/30 text-red-400 rounded-lg hover:bg-red-400/10 disabled:opacity-50 transition-colors"
            >
              {killing ? 'Killing...' : 'Kill'}
            </button>
          )}
          <button
            onClick={handleReview}
            className="px-3 py-1.5 text-xs border border-[#27272a] text-[#a1a1aa] rounded-lg hover:bg-[#18181b] transition-colors"
          >
            Review
          </button>
        </div>
      </div>

      {/* Main content: terminal + right panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Center: Terminal */}
        <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">
          <Terminal lines={lines} />

          {/* Task input at bottom */}
          <div className="flex gap-2">
            <input
              type="text"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder="Add a task..."
              className="flex-1 bg-[#111113] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-zinc-600 focus:outline-none focus:border-cyan-400/50"
              onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
            />
            <button
              onClick={handleAddTask}
              disabled={!taskInput.trim()}
              className="px-4 py-2 text-xs bg-[#18181b] border border-[#27272a] text-[#a1a1aa] rounded-lg hover:text-[#fafafa] hover:border-zinc-600 disabled:opacity-50 transition-colors"
            >
              Add
            </button>
          </div>
        </div>

        {/* Right panel */}
        <div className="w-80 border-l border-[#27272a] bg-[#111113] overflow-y-auto p-4 flex flex-col gap-5">
          {/* Status */}
          <Section title="Status">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isRunning
                    ? 'bg-yellow-400 animate-pulse'
                    : workspace.status === 'completed'
                    ? 'bg-green-400'
                    : workspace.status === 'failed'
                    ? 'bg-red-400'
                    : workspace.status === 'reviewing'
                    ? 'bg-cyan-400'
                    : 'bg-zinc-600'
                }`}
              />
              <span className="text-sm text-[#fafafa] capitalize">{workspace.status}</span>
            </div>
          </Section>

          {/* Branch */}
          <Section title="Branch">
            <span className="inline-block px-2 py-0.5 bg-[#18181b] border border-[#27272a] rounded text-xs text-cyan-400 font-mono">
              {detail?.branch || workspace.branch || 'main'}
            </span>
          </Section>

          {/* Model */}
          {modelBadge && (
            <Section title="Model">
              <span className="text-sm text-[#fafafa]">{modelBadge}</span>
            </Section>
          )}

          {/* Changed files */}
          <Section title="Changed Files">
            {detail?.changed_files && detail.changed_files.length > 0 ? (
              <ul className="space-y-1">
                {detail.changed_files.map((f, i) => (
                  <li key={i} className="text-xs font-mono text-[#a1a1aa] truncate">
                    {f}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-xs text-zinc-600">No changes yet</span>
            )}
          </Section>

          {/* Task checklist */}
          <Section title="Tasks">
            {tasks.length === 0 ? (
              <span className="text-xs text-zinc-600">No tasks</span>
            ) : (
              <ul className="space-y-1.5">
                {tasks.map((task) => (
                  <li key={task.id} className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleTask(task)}
                      className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                        task.completed
                          ? 'bg-cyan-400 border-cyan-400'
                          : 'border-[#27272a] hover:border-zinc-500'
                      }`}
                    >
                      {task.completed && (
                        <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <span
                      className={`text-xs ${
                        task.completed ? 'text-zinc-600 line-through' : 'text-[#a1a1aa]'
                      }`}
                    >
                      {task.title}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <SpawnModal />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">{title}</h4>
      {children}
    </div>
  );
}
