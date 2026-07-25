import { useState, type ReactNode } from 'react';
import type { Card } from '../lib/types';
import { colorClasses } from '../lib/colors';
import { proxied } from '../lib/img';

export function CardImage({
  card,
  className = '',
  width = 400,
}: {
  card: Pick<Card, 'name' | 'imageUrl'>;
  className?: string;
  width?: number;
}) {
  const [err, setErr] = useState(false);
  const src = proxied(card.imageUrl, width);
  if (!src || err) {
    return (
      <div className={`flex items-center justify-center bg-void/80 text-center ${className}`}>
        <span className="px-2 font-mono text-[10px] text-muted">{card.name}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={card.name}
      loading="lazy"
      onError={() => setErr(true)}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}

export function CardTile({
  card,
  owned = 0,
  onChangeOwned,
  footer,
  onClick,
}: {
  card: Card;
  owned?: number;
  onChangeOwned?: (qty: number) => void;
  footer?: ReactNode;
  onClick?: () => void;
}) {
  const cc = colorClasses(card.color);
  return (
    <div className={`group relative border bg-panel/60 ${cc.border} transition-colors hover:shadow-hud`}>
      <button
        type="button"
        onClick={onClick}
        className="relative block aspect-[5/7] w-full overflow-hidden"
        aria-label={card.name}
      >
        <CardImage card={card} className="transition-transform duration-300 group-hover:scale-[1.04]" />
        <span className={`absolute right-1 top-1 h-3 w-3 rounded-full ${cc.bg} shadow`} title={card.color ?? 'colorless'} />
        {owned > 0 && (
          <span className="absolute bottom-1 right-1 border border-ok/50 bg-void/85 px-1.5 font-mono text-[16px] text-ok">
            x{owned}
          </span>
        )}
      </button>

      <div className="px-2 py-1.5">
        <div className="truncate font-ui text-[13px] font-medium text-ink" title={card.name}>
          {card.name}
        </div>
        <div className="flex items-center justify-between font-mono text-[10px] text-muted">
          <span>{card.cardNumber}</span>
          <span>{card.cardType}</span>
        </div>
      </div>

      {onChangeOwned && (
        <div className="flex items-stretch border-t border-line">
          <StepBtn label="−" onClick={() => onChangeOwned(Math.max(0, owned - 1))} disabled={owned <= 0} />
          <div className="flex-1 border-x border-line py-1 text-center font-mono text-sm text-ink">{owned}</div>
          <StepBtn label="+" onClick={() => onChangeOwned(owned + 1)} tone="ok" />
        </div>
      )}
      {footer}
    </div>
  );
}

function StepBtn({
  label,
  onClick,
  disabled,
  tone = 'hud',
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'hud' | 'ok';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-9 py-1 font-display text-sm ${tone === 'ok' ? 'text-ok hover:bg-ok/10' : 'text-hud hover:bg-hud/10'} disabled:opacity-30`}
    >
      {label}
    </button>
  );
}
