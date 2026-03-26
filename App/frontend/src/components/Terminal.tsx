import { useEffect, useRef } from 'react';
import type { OutputLine } from '../stores/agent';

interface TerminalProps {
  lines: OutputLine[];
}

const typeColors: Record<string, string> = {
  text: 'text-white',
  tool_use: 'text-cyan-400',
  error: 'text-red-400',
  system: 'text-zinc-500',
  result: 'text-green-400',
};

export default function Terminal({ lines }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lines]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto bg-[#09090b] rounded-lg border border-[#27272a] p-4 font-mono text-sm leading-relaxed"
    >
      {lines.length === 0 ? (
        <div className="text-zinc-600 flex items-center justify-center h-full">
          <div className="text-center">
            <div className="text-2xl mb-2">{'>'}_</div>
            <div>Waiting for agent output...</div>
          </div>
        </div>
      ) : (
        lines.map((line, i) => (
          <div key={i} className={`${typeColors[line.type] || 'text-white'} whitespace-pre-wrap break-all`}>
            {line.type === 'tool_use' && (
              <span className="text-cyan-600 mr-2">[tool]</span>
            )}
            {line.type === 'error' && (
              <span className="text-red-600 mr-2">[error]</span>
            )}
            {line.type === 'system' && (
              <span className="text-zinc-600 mr-2">[sys]</span>
            )}
            {line.type === 'result' && (
              <span className="text-green-600 mr-2">[result]</span>
            )}
            {line.content}
          </div>
        ))
      )}
    </div>
  );
}
