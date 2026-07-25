export function Gauge({
  label,
  value,
  tone = 'hud',
  size = 'md',
}: {
  label: string;
  value: string | number | null | undefined;
  tone?: 'hud' | 'amber' | 'alert' | 'ok';
  size?: 'md' | 'lg';
}) {
  const color =
    tone === 'amber' ? 'text-amber' : tone === 'alert' ? 'text-alert' : tone === 'ok' ? 'text-ok' : 'text-hud';
  const large = size === 'lg';
  return (
    <div
      className={`flex flex-col items-center border border-line bg-void/50 ${
        large ? 'min-w-[55px] px-2 py-1.5' : 'min-w-[42px] px-1.5 py-1'
      }`}
    >
      <span className={`font-display uppercase tracking-[0.18em] text-muted ${large ? 'text-[10px]' : 'text-[8px]'}`}>
        {label}
      </span>
      <span className={`font-mono ${large ? 'text-lg' : 'text-sm'} ${color}`}>{value ?? '—'}</span>
    </div>
  );
}
