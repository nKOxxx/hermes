import { useState, useEffect } from 'react';
import { useRepoStore, type Repo } from '../stores/repo';
import { useUIStore } from '../stores/ui';

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: 'bg-yellow-400 animate-pulse',
    completed: 'bg-green-400',
    failed: 'bg-red-400',
    reviewing: 'bg-cyan-400',
    idle: 'bg-zinc-600',
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${colors[status] || colors.idle}`}
    />
  );
}

export default function Sidebar() {
  const repos = useRepoStore((s) => s.repos);
  const workspaces = useRepoStore((s) => s.workspaces);
  const fetchRepos = useRepoStore((s) => s.fetchRepos);
  const fetchWorkspaces = useRepoStore((s) => s.fetchWorkspaces);
  const addRepo = useRepoStore((s) => s.addRepo);
  const addWorkspace = useRepoStore((s) => s.addWorkspace);
  const deleteRepo = useRepoStore((s) => s.deleteRepo);

  const selectedWorkspaceId = useUIStore((s) => s.selectedWorkspaceId);
  const selectWorkspace = useUIStore((s) => s.selectWorkspace);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);

  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set());
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [addingRepo, setAddingRepo] = useState(false);
  const [newWsRepoId, setNewWsRepoId] = useState<string | null>(null);
  const [wsName, setWsName] = useState('');
  const [addingWs, setAddingWs] = useState(false);

  useEffect(() => {
    fetchRepos();
    fetchWorkspaces();
  }, [fetchRepos, fetchWorkspaces]);

  const toggleRepo = (id: string) => {
    setExpandedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddRepo = async () => {
    if (!repoUrl.trim()) return;
    setAddingRepo(true);
    try {
      const repo = await addRepo(repoUrl.trim());
      setExpandedRepos((prev) => new Set(prev).add(repo.id));
      setRepoUrl('');
      setShowAddRepo(false);
    } catch (err) {
      console.error('Failed to add repo:', err);
    } finally {
      setAddingRepo(false);
    }
  };

  const handleAddWorkspace = async () => {
    if (!wsName.trim() || !newWsRepoId) return;
    setAddingWs(true);
    try {
      const ws = await addWorkspace(newWsRepoId, wsName.trim());
      selectWorkspace(ws.id);
      setWsName('');
      setNewWsRepoId(null);
    } catch (err) {
      console.error('Failed to add workspace:', err);
    } finally {
      setAddingWs(false);
    }
  };

  if (!sidebarOpen) return null;

  const repoWorkspaces = (repoId: string) =>
    workspaces.filter((w) => w.repo_id === repoId);

  return (
    <div className="w-64 h-full bg-[#111113] border-r border-[#27272a] flex flex-col flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-[#27272a]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-cyan-400/20 flex items-center justify-center">
            <span className="text-cyan-400 text-xs font-bold">A</span>
          </div>
          <span className="text-sm font-semibold tracking-wider text-[#fafafa]">
            ARES
          </span>
        </div>
        <button
          onClick={() => setShowAddRepo(true)}
          className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          + Repo
        </button>
      </div>

      {/* Repo list */}
      <div className="flex-1 overflow-y-auto">
        {repos.length === 0 && (
          <div className="px-4 py-8 text-center text-zinc-600 text-xs">
            No repos yet. Add one to get started.
          </div>
        )}
        {repos.map((repo) => (
          <RepoItem
            key={repo.id}
            repo={repo}
            workspaces={repoWorkspaces(repo.id)}
            expanded={expandedRepos.has(repo.id)}
            onToggle={() => toggleRepo(repo.id)}
            selectedWorkspaceId={selectedWorkspaceId}
            onSelectWorkspace={selectWorkspace}
            onNewWorkspace={() => {
              setNewWsRepoId(repo.id);
              setWsName('');
            }}
            onDeleteRepo={() => deleteRepo(repo.id)}
          />
        ))}
      </div>

      {/* Add Repo Modal */}
      {showAddRepo && (
        <ModalOverlay onClose={() => setShowAddRepo(false)}>
          <h3 className="text-sm font-semibold text-[#fafafa] mb-3">Add Repository</h3>
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/user/repo"
            className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-zinc-600 focus:outline-none focus:border-cyan-400/50 mb-3"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleAddRepo()}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowAddRepo(false)}
              className="px-3 py-1.5 text-xs text-[#a1a1aa] hover:text-[#fafafa]"
            >
              Cancel
            </button>
            <button
              onClick={handleAddRepo}
              disabled={!repoUrl.trim() || addingRepo}
              className="px-4 py-1.5 text-xs bg-cyan-400 text-black font-medium rounded-lg hover:bg-cyan-300 disabled:opacity-50"
            >
              {addingRepo ? 'Adding...' : 'Add'}
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* New Workspace Modal */}
      {newWsRepoId && (
        <ModalOverlay onClose={() => setNewWsRepoId(null)}>
          <h3 className="text-sm font-semibold text-[#fafafa] mb-3">New Workspace</h3>
          <input
            type="text"
            value={wsName}
            onChange={(e) => setWsName(e.target.value)}
            placeholder="workspace-name"
            className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-zinc-600 focus:outline-none focus:border-cyan-400/50 mb-3"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleAddWorkspace()}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setNewWsRepoId(null)}
              className="px-3 py-1.5 text-xs text-[#a1a1aa] hover:text-[#fafafa]"
            >
              Cancel
            </button>
            <button
              onClick={handleAddWorkspace}
              disabled={!wsName.trim() || addingWs}
              className="px-4 py-1.5 text-xs bg-cyan-400 text-black font-medium rounded-lg hover:bg-cyan-300 disabled:opacity-50"
            >
              {addingWs ? 'Creating...' : 'Create'}
            </button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

function RepoItem({
  repo,
  workspaces,
  expanded,
  onToggle,
  selectedWorkspaceId,
  onSelectWorkspace,
  onNewWorkspace,
  onDeleteRepo,
}: {
  repo: Repo;
  workspaces: ReturnType<typeof useRepoStore.getState>['workspaces'];
  expanded: boolean;
  onToggle: () => void;
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onNewWorkspace: () => void;
  onDeleteRepo: () => void;
}) {
  return (
    <div className="border-b border-[#27272a]/50">
      <div
        className="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-[#18181b] transition-colors group"
        onClick={onToggle}
      >
        <svg
          className={`w-3 h-3 text-zinc-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-xs text-[#fafafa] truncate flex-1">{repo.name}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDeleteRepo();
          }}
          className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all text-xs"
          title="Delete repo"
        >
          x
        </button>
      </div>

      {expanded && (
        <div className="pb-1">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => onSelectWorkspace(ws.id)}
              className={`w-full text-left flex items-center gap-2 pl-9 pr-4 py-1.5 text-xs transition-colors ${
                selectedWorkspaceId === ws.id
                  ? 'bg-cyan-400/10 text-cyan-400'
                  : 'text-[#a1a1aa] hover:bg-[#18181b] hover:text-[#fafafa]'
              }`}
            >
              <StatusDot status={ws.status} />
              <span className="truncate">{ws.name}</span>
            </button>
          ))}
          <button
            onClick={onNewWorkspace}
            className="w-full text-left pl-9 pr-4 py-1.5 text-xs text-zinc-600 hover:text-cyan-400 transition-colors"
          >
            + New Workspace
          </button>
        </div>
      )}
    </div>
  );
}

function ModalOverlay({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#111113] border border-[#27272a] rounded-xl p-5 w-80 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
