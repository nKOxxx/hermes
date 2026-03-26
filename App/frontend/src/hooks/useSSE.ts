import { useEffect, useRef } from 'react';
import { useAgentStore, type OutputLine } from '../stores/agent';
import { useRepoStore } from '../stores/repo';

export function useSSE() {
  const sourceRef = useRef<EventSource | null>(null);
  const appendOutput = useAgentStore((s) => s.appendOutput);
  const updateRun = useAgentStore((s) => s.updateRun);
  const fetchDashboard = useAgentStore((s) => s.fetchDashboard);
  const updateWorkspace = useRepoStore((s) => s.updateWorkspace);

  useEffect(() => {
    if (sourceRef.current) return;

    const es = new EventSource('/events');
    sourceRef.current = es;

    es.addEventListener('agent_output', (e) => {
      try {
        const data = JSON.parse(e.data);
        const line: OutputLine = {
          type: data.type || 'text',
          content: data.content || data.text || '',
          timestamp: data.timestamp,
        };
        if (data.workspace_id) {
          appendOutput(data.workspace_id, line);
        }
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener('run_update', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.run) {
          updateRun(data.run);
        }
        if (data.workspace_id && data.status) {
          updateWorkspace(data.workspace_id, { status: data.status });
        }
      } catch {
        // ignore
      }
    });

    es.addEventListener('workspace_update', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.id && data.status) {
          updateWorkspace(data.id, data);
        }
      } catch {
        // ignore
      }
    });

    es.addEventListener('task_update', (e) => {
      try {
        // Re-fetch dashboard on task changes to keep stats fresh
        JSON.parse(e.data);
        fetchDashboard();
      } catch {
        // ignore
      }
    });

    es.addEventListener('dashboard', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.stats) {
          useAgentStore.setState({ dashboardStats: data.stats });
        }
      } catch {
        // ignore
      }
    });

    es.onerror = () => {
      // EventSource will auto-reconnect
    };

    return () => {
      es.close();
      sourceRef.current = null;
    };
  }, [appendOutput, updateRun, fetchDashboard, updateWorkspace]);
}
