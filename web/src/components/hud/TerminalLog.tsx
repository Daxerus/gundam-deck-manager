import { useEffect, useRef, useState } from 'react';

export type LogTone = 'hud' | 'amber' | 'alert' | 'ok' | 'muted';

export interface LogLine {
  text: string;
  tone?: LogTone;
}

const toneClass: Record<LogTone, string> = {
  hud: 'text-hud',
  amber: 'text-amber',
  alert: 'text-alert',
  ok: 'text-ok',
  muted: 'text-muted',
};

const prefers = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Console-style log that reveals lines sequentially (skips animation for reduced-motion). */
export function TerminalLog({
  lines,
  intervalMs = 220,
  onDone,
  className = '',
}: {
  lines: LogLine[];
  intervalMs?: number;
  onDone?: () => void;
  className?: string;
}) {
  const [shown, setShown] = useState(prefers() ? lines.length : 0);
  const doneRef = useRef(false);

  useEffect(() => {
    if (prefers()) {
      setShown(lines.length);
      if (!doneRef.current) {
        doneRef.current = true;
        onDone?.();
      }
      return;
    }
    setShown(0);
    doneRef.current = false;
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= lines.length) {
        clearInterval(t);
        if (!doneRef.current) {
          doneRef.current = true;
          onDone?.();
        }
      }
    }, intervalMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  return (
    <div
      className={`border border-line bg-void/70 p-3 font-mono text-[12px] leading-relaxed ${className}`}
    >
      {lines.slice(0, shown).map((l, idx) => (
        <div key={idx} className={toneClass[l.tone ?? 'hud']}>
          <span className="text-muted">{'>'} </span>
          {l.text}
        </div>
      ))}
      {shown < lines.length && <span className="text-hud animate-blink">_</span>}
    </div>
  );
}
