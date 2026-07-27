import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Card, CardStatusBreakdown, StatusColor } from '../lib/types';
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

const STATUS_BADGE: Record<StatusColor, string> = {
  green: 'border-ok/50 text-ok',
  yellow: 'border-amber/50 text-amber',
  red: 'border-alert/50 text-alert',
};

export function CardTile({
  card,
  owned = 0,
  status,
  onChangeOwned,
  footer,
  onClick,
  onReturnLoan,
  readOnly = false,
}: {
  card: Card;
  owned?: number;
  status?: CardStatusBreakdown;
  onChangeOwned?: (qty: number) => void;
  footer?: ReactNode;
  onClick?: () => void;
  onReturnLoan?: (loanId: number, productId: string, maxQty: number, username: string) => void;
  readOnly?: boolean;
}) {
  const cc = colorClasses(card.color);
  const [helperOpen, setHelperOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const displayQty = status?.displayQty ?? owned;
  const statusColor: StatusColor = status?.statusColor ?? (owned > 0 ? 'green' : 'green');
  const lentOutTotal = status?.lentOut.reduce((s, r) => s + r.qty, 0) ?? 0;
  const stepperMin = lentOutTotal;
  const stepperValue = displayQty;

  useEffect(() => {
    if (!helperOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setHelperOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHelperOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [helperOpen]);

  return (
    <div
      ref={rootRef}
      className={`group relative border bg-panel/60 ${cc.border} transition-colors hover:shadow-hud`}
    >
      <button
        type="button"
        onClick={() => {
          if (helperOpen) return;
          onClick?.();
        }}
        className="relative block aspect-[5/7] w-full overflow-hidden"
        aria-label={card.name}
      >
        <CardImage card={card} className="transition-transform duration-300 group-hover:scale-[1.04]" />
        <span
          className={`absolute right-1 top-1 h-3 w-3 rounded-full ${cc.bg} shadow`}
          title={card.color ?? 'colorless'}
        />

        {displayQty > 0 && !helperOpen && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (status) setHelperOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                e.preventDefault();
                if (status) setHelperOpen(true);
              }
            }}
            className={`absolute bottom-1 right-1 border bg-void/85 px-1.5 font-mono text-[16px] ${STATUS_BADGE[statusColor]} ${
              status ? 'cursor-pointer hover:bg-void' : ''
            }`}
            title={status ? 'Ver ubicaciones' : undefined}
          >
            x{displayQty}
          </span>
        )}

        {helperOpen && status && (
          <div
            className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-0.5 bg-void/80 p-1 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {status.decks.map((d) => (
              <HelperRow key={`d-${d.deckId}`} tone="red" label={`x${d.qty} ${d.name}`} />
            ))}
            {status.lentOut.map((r) => (
              <HelperRow
                key={`l-${r.userId}-${r.loanId}`}
                tone="blue"
                label={`x${r.qty} → ${r.username}`}
                action={
                  onReturnLoan
                    ? {
                        label: 'Devolver',
                        onClick: () => onReturnLoan(r.loanId, card.productId, r.qty, r.username),
                      }
                    : undefined
                }
              />
            ))}
            {status.borrowedIn.map((r) => (
              <HelperRow
                key={`b-${r.userId}-${r.loanId}`}
                tone="purple"
                label={`x${r.qty} ← ${r.username}`}
                action={
                  onReturnLoan
                    ? {
                        label: 'Devolver',
                        onClick: () => onReturnLoan(r.loanId, card.productId, r.qty, r.username),
                      }
                    : undefined
                }
              />
            ))}
            {status.box > 0 && <HelperRow tone="green" label={`x${status.box} Colección`} />}
          </div>
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

      {onChangeOwned && !readOnly && (
        <QuantityStepper
          value={stepperValue}
          min={stepperMin}
          onChange={(nextDisplay) => {
            const nextOwned = Math.max(0, nextDisplay - lentOutTotal);
            onChangeOwned(nextOwned);
          }}
        />
      )}
      {footer}
    </div>
  );
}

function HelperRow({
  tone,
  label,
  action,
}: {
  tone: 'green' | 'red' | 'blue' | 'purple';
  label: string;
  action?: { label: string; onClick: () => void };
}) {
  const bg =
    tone === 'green'
      ? 'bg-ok/80'
      : tone === 'red'
        ? 'bg-alert/80'
        : tone === 'blue'
          ? 'bg-loan/80'
          : 'bg-borrow/80';
  return (
    <div className={`flex items-center justify-between gap-1 px-1.5 py-0.5 font-mono text-[10px] text-void ${bg}`}>
      <span className="truncate uppercase tracking-wide">{label}</span>
      {action && (
        <button
          type="button"
          className="shrink-0 border border-void/40 px-1 text-[9px] uppercase hover:bg-void/20"
          onClick={(e) => {
            e.stopPropagation();
            action.onClick();
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/** Shared − / qty / + controls used by catalog, collection and deck editor. */
export function QuantityStepper({
  value,
  onChange,
  min = 0,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
}) {
  return (
    <div className="flex items-stretch border-t border-line">
      <StepBtn label="−" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} />
      <div className="flex-1 border-x border-line py-1 text-center font-mono text-sm text-ink">{value}</div>
      <StepBtn label="+" onClick={() => onChange(value + 1)} tone="ok" />
    </div>
  );
}

function StepBtn({
  label,
  onClick,
  disabled,
  tone,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'ok';
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-9 py-1 font-mono text-sm disabled:opacity-30 ${
        tone === 'ok' ? 'text-ok hover:bg-ok/10' : 'text-muted hover:bg-line/40'
      }`}
    >
      {label}
    </button>
  );
}
