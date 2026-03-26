import { useState } from 'react';
import { useAgentStore } from '../stores/agent';
import { useUIStore } from '../stores/ui';
import { useRepoStore } from '../stores/repo';

const MODELS = [
  { id: 'claude', label: 'Claude', color: 'bg-cyan-400' },
  { id: 'gpt', label: 'GPT', color: 'bg-green-400' },
  { id: 'minimax', label: 'MiniMax', color: 'bg-violet-400' },
] as const;

export default function SpawnModal() {
  const open = useUIStore((s) => s.spawnModalOpen);
  const setOpen = useUIStore((s) => s.setSpawnModalOpen);
  const selectedId = useUIStore((s) => s.selectedWorkspaceId);
  const spawnAgent = useAgentStore((s) => s.spawnAgent);
  const updateWorkspace = useRepoStore((s) => s.updateWorkspace);

  const [model, setModel] = useState<string>('claude');
  const [task, setTask] = useState('');
  const [maxTurns, setMaxTurns] = useState(25);
  const [temperature, setTemperature] = useState(0.7);
  const [spawning, setSpawning] = useState(false);

  if (!open || !selectedId) return null;

  const handleSpawn = async () => {
    if (!task.trim()) return;
    setSpawning(true);
    try {
      const options: Record<string, unknown> = {};
      if (model === 'claude') {
        options.max_turns = maxTurns;
      } else {
        options.temperature = temperature;
      }
      await spawnAgent(selectedId, model, task, options);
      updateWorkspace(selectedId, { status: 'running', model, task });
      setTask('');
      setOpen(false);
    } catch (err) {
      console.error('Spawn failed:', err);
    } finally {
      setSpawning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#111113] border border-[#27272a] rounded-xl w-full max-w-lg p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-[#fafafa] mb-4">Spawn Agent</h2>

        {/* Model selector */}
        <div className="mb-4">
          <label className="text-sm text-[#a1a1aa] mb-2 block">Model</label>
          <div className="flex gap-2">
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  model === m.id
                    ? `${m.color} text-black`
                    : 'bg-[#18181b] text-[#a1a1aa] hover:bg-[#27272a]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Task input */}
        <div className="mb-4">
          <label className="text-sm text-[#a1a1aa] mb-2 block">Task</label>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Describe what the agent should do..."
            className="w-full h-32 bg-[#09090b] border border-[#27272a] rounded-lg p-3 text-sm text-[#fafafa] placeholder-zinc-600 resize-none focus:outline-none focus:border-cyan-400/50"
          />
        </div>

        {/* Model-specific options */}
        {model === 'claude' ? (
          <div className="mb-6">
            <label className="text-sm text-[#a1a1aa] mb-2 block">
              Max Turns: {maxTurns}
            </label>
            <input
              type="range"
              min={1}
              max={100}
              value={maxTurns}
              onChange={(e) => setMaxTurns(Number(e.target.value))}
              className="w-full accent-cyan-400"
            />
          </div>
        ) : (
          <div className="mb-6">
            <label className="text-sm text-[#a1a1aa] mb-2 block">
              Temperature: {temperature.toFixed(1)}
            </label>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full accent-cyan-400"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setOpen(false)}
            className="px-4 py-2 text-sm text-[#a1a1aa] hover:text-[#fafafa] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSpawn}
            disabled={!task.trim() || spawning}
            className="px-6 py-2 bg-cyan-400 text-black text-sm font-medium rounded-lg hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {spawning ? 'Spawning...' : 'Spawn'}
          </button>
        </div>
      </div>
    </div>
  );
}
