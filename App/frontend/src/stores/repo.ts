import { create } from 'zustand';
import { api } from '../hooks/useAPI';

export interface Repo {
  id: string;
  url: string;
  name: string;
  path: string;
  created_at: string;
}

export interface Workspace {
  id: string;
  repo_id: string;
  name: string;
  branch: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'reviewing';
  model?: string;
  task?: string;
  created_at: string;
  updated_at: string;
}

interface RepoState {
  repos: Repo[];
  workspaces: Workspace[];
  loading: boolean;

  fetchRepos: () => Promise<void>;
  addRepo: (url: string) => Promise<Repo>;
  deleteRepo: (id: string) => Promise<void>;

  fetchWorkspaces: () => Promise<void>;
  addWorkspace: (repoId: string, name: string) => Promise<Workspace>;
  deleteWorkspace: (id: string) => Promise<void>;

  updateWorkspace: (id: string, updates: Partial<Workspace>) => void;
}

export const useRepoStore = create<RepoState>((set) => ({
  repos: [],
  workspaces: [],
  loading: false,

  fetchRepos: async () => {
    set({ loading: true });
    try {
      const repos = await api<Repo[]>('GET', '/api/repos');
      set({ repos, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addRepo: async (url: string) => {
    const repo = await api<Repo>('POST', '/api/repos', { url });
    set((s) => ({ repos: [...s.repos, repo] }));
    return repo;
  },

  deleteRepo: async (id: string) => {
    await api('DELETE', `/api/repos/${id}`);
    set((s) => ({
      repos: s.repos.filter((r) => r.id !== id),
      workspaces: s.workspaces.filter((w) => w.repo_id !== id),
    }));
  },

  fetchWorkspaces: async () => {
    try {
      const workspaces = await api<Workspace[]>('GET', '/api/workspaces');
      set({ workspaces });
    } catch {
      // ignore
    }
  },

  addWorkspace: async (repoId: string, name: string) => {
    const ws = await api<Workspace>('POST', '/api/workspaces', { repoId, name });
    set((s) => ({ workspaces: [...s.workspaces, ws] }));
    return ws;
  },

  deleteWorkspace: async (id: string) => {
    await api('DELETE', `/api/workspaces/${id}`);
    set((s) => ({ workspaces: s.workspaces.filter((w) => w.id !== id) }));
  },

  updateWorkspace: (id: string, updates: Partial<Workspace>) => {
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === id ? { ...w, ...updates } : w
      ),
    }));
  },
}));
