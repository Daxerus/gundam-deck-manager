import type { ReactNode } from 'react';

type Tone = 'hud' | 'amber' | 'alert' | 'ok' | 'muted';

const tones: Record<Tone, string> = {
  hud: 'border-hud/50 text-hud',
  amber: 'border-amber/50 text-amber',
  alert: 'border-alert/50 text-alert',
  ok: 'border-ok/50 text-ok',
  muted: 'border-line text-muted',
};

export function StatusBadge({
  tone = 'muted',
  blink = false,
  children,
  className = '',
}: {
  tone?: Tone;
  blink?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-display text-[10px] uppercase tracking-[0.18em] ${tones[tone]} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${blink ? 'animate-blink' : ''}`} />
      {children}
    </span>
  );
}
