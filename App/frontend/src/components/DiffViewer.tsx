import { useEffect, useState } from 'react';
import { api } from '../hooks/useAPI';
import { useUIStore } from '../stores/ui';

interface DiffFile {
  filename: string;
  insertions: number;
  deletions: number;
  patch: string;
}

interface DiffData {
  files: DiffFile[];
  review_id?: string;
  total_insertions: number;
  total_deletions: number;
}

export default function DiffViewer() {
  const workspaceId = useUIStore((s) => s.selectedWorkspaceId);
  const [diff, setDiff] = useState<DiffData | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    api<DiffData>('GET', `/api/workspaces/${workspaceId}/diff`)
      .then((data) => {
        setDiff(data);
        if (data.files?.length > 0) {
          setSelectedFile(data.files[0].filename);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const handleApprove = async () => {
    if (!diff?.review_id) return;
    setActionLoading(true);
    try {
      await api('POST', `/api/reviews/${diff.review_id}/merge`);
    } catch (err) {
      console.error('Merge failed:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!diff?.review_id) return;
    setActionLoading(true);
    try {
      await api('POST', `/api/reviews/${diff.review_id}/reject`);
    } catch (err) {
      console.error('Reject failed:', err);
    } finally {
      setActionLoading(false);
    }
  };

  if (!workspaceId) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600">
        Select a workspace to view diffs
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500">
        Loading diff...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400">
        {error}
      </div>
    );
  }

  if (!diff || !diff.files?.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600">
        No changes to review
      </div>
    );
  }

  const activeFile = diff.files.find((f) => f.filename === selectedFile);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Stats bar */}
      <div className="flex items-center gap-6 px-6 py-3 border-b border-[#27272a] bg-[#111113]">
        <span className="text-sm text-[#a1a1aa]">
          {diff.files.length} file{diff.files.length !== 1 ? 's' : ''} changed
        </span>
        <span className="text-sm text-green-400">+{diff.total_insertions}</span>
        <span className="text-sm text-red-400">-{diff.total_deletions}</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* File list */}
        <div className="w-64 border-r border-[#27272a] bg-[#111113] overflow-y-auto">
          {diff.files.map((file) => (
            <button
              key={file.filename}
              onClick={() => setSelectedFile(file.filename)}
              className={`w-full text-left px-4 py-2.5 text-sm border-b border-[#27272a]/50 transition-colors ${
                selectedFile === file.filename
                  ? 'bg-[#18181b] text-[#fafafa]'
                  : 'text-[#a1a1aa] hover:bg-[#18181b]/50'
              }`}
            >
              <div className="truncate font-mono text-xs">{file.filename}</div>
              <div className="flex gap-2 mt-1">
                <span className="text-green-400 text-xs">+{file.insertions}</span>
                <span className="text-red-400 text-xs">-{file.deletions}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Diff content */}
        <div className="flex-1 overflow-y-auto bg-[#09090b] p-4">
          {activeFile ? (
            <pre className="font-mono text-xs leading-5">
              {activeFile.patch.split('\n').map((line, i) => {
                let color = 'text-zinc-400';
                let bg = '';
                if (line.startsWith('+')) {
                  color = 'text-green-400';
                  bg = 'bg-green-400/5';
                } else if (line.startsWith('-')) {
                  color = 'text-red-400';
                  bg = 'bg-red-400/5';
                } else if (line.startsWith('@@')) {
                  color = 'text-cyan-400';
                  bg = 'bg-cyan-400/5';
                }
                return (
                  <div key={i} className={`${color} ${bg} px-2`}>
                    {line}
                  </div>
                );
              })}
            </pre>
          ) : (
            <div className="text-zinc-600 text-sm">Select a file to view</div>
          )}
        </div>
      </div>

      {/* Actions */}
      {diff.review_id && (
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#27272a] bg-[#111113]">
          <button
            onClick={handleReject}
            disabled={actionLoading}
            className="px-5 py-2 text-sm text-red-400 border border-red-400/30 rounded-lg hover:bg-red-400/10 disabled:opacity-50 transition-colors"
          >
            Reject
          </button>
          <button
            onClick={handleApprove}
            disabled={actionLoading}
            className="px-5 py-2 text-sm bg-green-500 text-black font-medium rounded-lg hover:bg-green-400 disabled:opacity-50 transition-colors"
          >
            Approve & Merge
          </button>
        </div>
      )}
    </div>
  );
}
