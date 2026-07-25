import type { ReactNode } from 'react';

type Tone = 'hud' | 'amber' | 'alert' | 'ok';

const toneRing: Record<Tone, string> = {
  hud: 'border-hud/30 shadow-hud',
  amber: 'border-amber/40 shadow-[0_0_18px_-4px_rgba(255,176,32,0.4)]',
  alert: 'border-alert/40 shadow-alert',
  ok: 'border-ok/40 shadow-[0_0_18px_-4px_rgba(53,224,138,0.4)]',
};

const toneText: Record<Tone, string> = {
  hud: 'text-hud',
  amber: 'text-amber',
  alert: 'text-alert',
  ok: 'text-ok',
};

export function Panel({
  title,
  subtitle,
  right,
  tone = 'hud',
  children,
  className = '',
  bodyClassName = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  tone?: Tone;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`relative border bg-panel/70 backdrop-blur-sm ${toneRing[tone]} ${className}`}
    >
      <Brackets tone={tone} />
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-2">
          <div className="min-w-0">
            {title && (
              <h2 className={`font-display text-xs uppercase tracking-[0.22em] ${toneText[tone]}`}>
                {title}
              </h2>
            )}
            {subtitle && <p className="truncate font-mono text-[11px] text-muted">{subtitle}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      <div className={`p-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

function Brackets({ tone }: { tone: Tone }) {
  const c = tone === 'hud' ? 'border-hud/60' : tone === 'amber' ? 'border-amber/60' : tone === 'alert' ? 'border-alert/60' : 'border-ok/60';
  return (
    <>
      <span className={`pointer-events-none absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 ${c}`} />
      <span className={`pointer-events-none absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2 ${c}`} />
      <span className={`pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 ${c}`} />
      <span className={`pointer-events-none absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 ${c}`} />
    </>
  );
}
