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

function estimateDuration(
  lines: LogLine[],
  intervalMs: number,
  characterIntervalMs?: number,
) {
  if (characterIntervalMs === undefined) return lines.length * intervalMs;

  let ms = 0;
  for (let i = 0; i < lines.length; i += 1) {
    ms += Math.max(1, lines[i].text.length) * characterIntervalMs;
    if (i < lines.length - 1) ms += intervalMs;
  }
  return ms+100;
}

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
  const containerRef = useRef<HTMLDivElement>(null);

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

    const container = containerRef.current;
    let scrollRaf = 0;
    let typingTimeout = 0;
    let typingInterval = 0;

    const startSmoothScroll = () => {
      if (!container) return;
      const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
      if (maxScroll <= 0) return;

      const duration = Math.max(1, estimateDuration(lines, intervalMs, characterIntervalMs));
      const start = performance.now() + 1300;

      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        container.scrollTop = t * maxScroll;
        if (t < 1) {
          scrollRaf = requestAnimationFrame(tick);
        } else {
          container.scrollTop = maxScroll;
        }
      };

      container.scrollTop = 0;
      scrollRaf = requestAnimationFrame(tick);
    };

    // Wait a frame so reserved line heights are laid out before measuring scroll.
    scrollRaf = requestAnimationFrame(() => {
      startSmoothScroll();
    });

    if (characterIntervalMs !== undefined) {
      let lineIndex = 0;
      let characterIndex = 0;

      const typeNextCharacter = () => {
        characterIndex += 1;
        setCurrentText(lines[lineIndex].text.slice(0, characterIndex));

        if (characterIndex < lines[lineIndex].text.length) {
          typingTimeout = window.setTimeout(typeNextCharacter, characterIntervalMs);
          return;
        }

        typingTimeout = window.setTimeout(() => {
          lineIndex += 1;
          setShown(lineIndex);
          setCurrentText('');
          characterIndex = 0;

          if (lineIndex >= lines.length) {
            if (container) container.scrollTop = container.scrollHeight;
            finish();
          } else {
            typingTimeout = window.setTimeout(typeNextCharacter, characterIntervalMs);
          }
        }, intervalMs);
      };

      typingTimeout = window.setTimeout(typeNextCharacter, characterIntervalMs);
    } else {
      let i = 0;
      typingInterval = window.setInterval(() => {
        i += 1;
        setShown(i);
        if (i >= lines.length) {
          window.clearInterval(typingInterval);
          if (container) container.scrollTop = container.scrollHeight;
          finish();
        }
      }, intervalMs);
    }

    return () => {
      cancelAnimationFrame(scrollRaf);
      window.clearTimeout(typingTimeout);
      window.clearInterval(typingInterval);
    };
  }, [characterIntervalMs, intervalMs, lines]);

  return (
    <div
      ref={containerRef}
      className={`border border-line bg-void/70 p-3 font-mono text-[12px] leading-relaxed ${className}`}
    >
      {lines.map((l, idx) => {
        if (idx < shown) {
          return (
            <div key={idx} className={toneClass[l.tone ?? 'hud']}>
              <span className="text-muted">{'>'} </span>
              {l.text}
            </div>
          );
        }

        if (idx === shown && shown < lines.length) {
          return (
            <div key={idx} className={`relative ${toneClass[l.tone ?? 'hud']}`}>
              <div className="invisible" aria-hidden>
                <span className="text-muted">{'>'} </span>
                {l.text}
              </div>
              <div className="absolute inset-0">
                <span className="text-muted">{'>'} </span>
                {currentText}
                <span className="text-hud animate-blink">_</span>
              </div>
            </div>
          );
        }

        // Reserve final height so scroll can run continuously start → end.
        return (
          <div key={idx} className="invisible" aria-hidden>
            <span className="text-muted">{'>'} </span>
            {l.text}
          </div>
        );
      })}
    </div>
  );
}
