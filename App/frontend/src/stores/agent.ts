import { create } from 'zustand';
import { api } from '../hooks/useAPI';

export interface ActiveRun {
  id: string;
  workspace_id: string;
  model: string;
  task: string;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  finished_at?: string;
  cost?: number;
}

export interface DashboardStats {
  running: number;
  completed: number;
  failed: number;
  total_cost: number;
  runs: ActiveRun[];
}

export interface OutputLine {
  type: 'text' | 'tool_use' | 'error' | 'system' | 'result';
  content: string;
  timestamp?: string;
}

interface AgentState {
  activeRuns: ActiveRun[];
  outputBuffers: Map<string, OutputLine[]>;
  dashboardStats: DashboardStats | null;
  loading: boolean;

  spawnAgent: (
    workspaceId: string,
    model: string,
    task: string,
    options?: Record<string, unknown>
  ) => Promise<void>;
  killAgent: (workspaceId: string) => Promise<void>;
  fetchDashboard: () => Promise<void>;
  fetchRunOutput: (runId: string) => Promise<void>;

  appendOutput: (workspaceId: string, line: OutputLine) => void;
  updateRun: (run: ActiveRun) => void;
  removeRun: (runId: string) => void;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  activeRuns: [],
  outputBuffers: new Map(),
  dashboardStats: null,
  loading: false,

  spawnAgent: async (workspaceId, model, task, options = {}) => {
    const run = await api<ActiveRun>('POST', `/api/workspaces/${workspaceId}/spawn`, {
      model,
      task,
      options,
    });
    set((s) => {
      const newBuffers = new Map(s.outputBuffers);
      newBuffers.set(workspaceId, []);
      return {
        activeRuns: [...s.activeRuns, run],
        outputBuffers: newBuffers,
      };
    });
  },

  killAgent: async (workspaceId) => {
    await api('POST', `/api/workspaces/${workspaceId}/kill`);
    set((s) => ({
      activeRuns: s.activeRuns.filter((r) => r.workspace_id !== workspaceId),
    }));
  },

  fetchDashboard: async () => {
    set({ loading: true });
    try {
      const stats = await api<DashboardStats>('GET', '/api/dashboard');
      set({
        dashboardStats: stats,
        activeRuns: stats.runs || [],
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  fetchRunOutput: async (runId: string) => {
    try {
      const data = await api<{ lines: OutputLine[] }>('GET', `/api/runs/${runId}/output`);
      const run = get().activeRuns.find((r) => r.id === runId);
      if (run && data.lines) {
        set((s) => {
          const newBuffers = new Map(s.outputBuffers);
          newBuffers.set(run.workspace_id, data.lines);
          return { outputBuffers: newBuffers };
        });
      }
    } catch {
      // ignore
    }
  },

  appendOutput: (workspaceId, line) => {
    set((s) => {
      const newBuffers = new Map(s.outputBuffers);
      const existing = newBuffers.get(workspaceId) || [];
      newBuffers.set(workspaceId, [...existing, line]);
      return { outputBuffers: newBuffers };
    });
  },

  updateRun: (run) => {
    set((s) => {
      const exists = s.activeRuns.find((r) => r.id === run.id);
      if (exists) {
        return {
          activeRuns: s.activeRuns.map((r) => (r.id === run.id ? run : r)),
        };
      }
      return { activeRuns: [...s.activeRuns, run] };
    });
  },

  removeRun: (runId) => {
    set((s) => ({
      activeRuns: s.activeRuns.filter((r) => r.id !== runId),
    }));
  },
}));
