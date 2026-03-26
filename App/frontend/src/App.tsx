import { useEffect } from 'react';
import { useSSE } from './hooks/useSSE';
import { useUIStore, type Mode } from './stores/ui';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import AgentPanel from './components/AgentPanel';
import DiffViewer from './components/DiffViewer';

const TABS: { mode: Mode; label: string; shortcut: string }[] = [
  { mode: 'dashboard', label: 'Dashboard', shortcut: '1' },
  { mode: 'workspace', label: 'Workspace', shortcut: '2' },
  { mode: 'review', label: 'Review', shortcut: '3' },
];

export default function App() {
  useSSE();

  const mode = useUIStore((s) => s.mode);
  const setMode = useUIStore((s) => s.setMode);
  const selectedWorkspaceId = useUIStore((s) => s.selectedWorkspaceId);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '1') {
          e.preventDefault();
          setMode('dashboard');
        } else if (e.key === '2') {
          e.preventDefault();
          setMode('workspace');
        } else if (e.key === '3') {
          e.preventDefault();
          setMode('review');
        } else if (e.key === 'b') {
          e.preventDefault();
          toggleSidebar();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setMode, toggleSidebar]);

  const renderMain = () => {
    switch (mode) {
      case 'dashboard':
        return <Dashboard />;
      case 'workspace':
        return selectedWorkspaceId ? <AgentPanel /> : <Dashboard />;
      case 'review':
        return <DiffViewer />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-full w-full bg-[#09090b]">
      {sidebarOpen && <Sidebar />}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top tab bar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[#27272a] bg-[#111113]">
          {/* Sidebar toggle */}
          <button
            onClick={toggleSidebar}
            className="mr-2 p-1.5 rounded hover:bg-[#18181b] text-zinc-500 hover:text-[#fafafa] transition-colors"
            title="Toggle sidebar (Cmd+B)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Tabs */}
          {TABS.map((tab) => (
            <button
              key={tab.mode}
              onClick={() => setMode(tab.mode)}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === tab.mode
                  ? 'bg-[#18181b] text-[#fafafa]'
                  : 'text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b]/50'
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-[10px] text-zinc-600">
                {'\u2318'}{tab.shortcut}
              </span>
            </button>
          ))}
        </div>

        {/* Main content */}
        {renderMain()}
      </div>
    </div>
  );
}
