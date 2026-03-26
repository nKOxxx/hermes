import { create } from 'zustand';

export type Mode = 'dashboard' | 'workspace' | 'review' | 'orchestration';

interface UIState {
  mode: Mode;
  selectedWorkspaceId: string | null;
  selectedRepoId: string | null;
  sidebarOpen: boolean;
  spawnModalOpen: boolean;

  setMode: (mode: Mode) => void;
  selectWorkspace: (id: string | null) => void;
  selectRepo: (id: string | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSpawnModalOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  mode: 'dashboard',
  selectedWorkspaceId: null,
  selectedRepoId: null,
  sidebarOpen: true,
  spawnModalOpen: false,

  setMode: (mode) => set({ mode }),

  selectWorkspace: (id) =>
    set({ selectedWorkspaceId: id, mode: id ? 'workspace' : 'dashboard' }),

  selectRepo: (id) => set({ selectedRepoId: id }),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setSpawnModalOpen: (open) => set({ spawnModalOpen: open }),
}));
