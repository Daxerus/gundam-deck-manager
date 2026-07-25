import type { ButtonHTMLAttributes } from 'react';

type Variant = 'hud' | 'amber' | 'alert' | 'ok' | 'ghost';

const variants: Record<Variant, string> = {
  hud: 'border-hud/50 text-hud hover:bg-hud/10 hover:shadow-hud',
  amber: 'border-amber/50 text-amber hover:bg-amber/10',
  alert: 'border-alert/50 text-alert hover:bg-alert/10',
  ok: 'border-ok/50 text-ok hover:bg-ok/10',
  ghost: 'border-line text-muted hover:text-ink hover:border-hud/40',
};

export function HudButton({
  variant = 'hud',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`hud-clip inline-flex items-center justify-center gap-2 border bg-void/50 px-3 py-1.5 font-display text-[11px] uppercase tracking-[0.16em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${className}`}
    />
  );
}
