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
  characterIntervalMs,
  onDone,
  className = '',
}: {
  lines: LogLine[];
  intervalMs?: number;
  characterIntervalMs?: number;
  onDone?: () => void;
  className?: string;
}) {
  const [shown, setShown] = useState(prefers() ? lines.length : 0);
  const [currentText, setCurrentText] = useState('');
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);

  onDoneRef.current = onDone;

  useEffect(() => {
    const finish = () => {
      if (!doneRef.current) {
        doneRef.current = true;
        onDoneRef.current?.();
      }
    };

    if (prefers()) {
      setShown(lines.length);
      setCurrentText('');
      finish();
      return;
    }

    setShown(0);
    setCurrentText('');
    doneRef.current = false;

    if (lines.length === 0) {
      finish();
      return;
    }

    if (characterIntervalMs !== undefined) {
      let lineIndex = 0;
      let characterIndex = 0;
      let timeout: number;

      const typeNextCharacter = () => {
        characterIndex += 1;
        setCurrentText(lines[lineIndex].text.slice(0, characterIndex));

        if (characterIndex < lines[lineIndex].text.length) {
          timeout = window.setTimeout(typeNextCharacter, characterIntervalMs);
          return;
        }

        timeout = window.setTimeout(() => {
          lineIndex += 1;
          setShown(lineIndex);
          setCurrentText('');
          characterIndex = 0;

          if (lineIndex >= lines.length) {
            finish();
          } else {
            timeout = window.setTimeout(typeNextCharacter, characterIntervalMs);
          }
        }, intervalMs);
      };

      timeout = window.setTimeout(typeNextCharacter, characterIntervalMs);
      return () => window.clearTimeout(timeout);
    }

    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= lines.length) {
        clearInterval(t);
        finish();
      }
    }, intervalMs);
    return () => clearInterval(t);
  }, [characterIntervalMs, intervalMs, lines]);

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
      {shown < lines.length && (
        <div className={toneClass[lines[shown].tone ?? 'hud']}>
          <span className="text-muted">{'>'} </span>
          {currentText}
          <span className="text-hud animate-blink">_</span>
        </div>
      )}
    </div>
  );
}
