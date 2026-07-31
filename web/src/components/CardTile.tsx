import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
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
  onLend,
  onReceive,
  readOnly = false,
}: {
  card: Card;
  owned?: number;
  status?: CardStatusBreakdown;
  onChangeOwned?: (qty: number) => void;
  footer?: ReactNode;
  onClick?: () => void;
  onReturnLoan?: (loanId: number, productId: string, maxQty: number, username: string) => void;
  onLend?: (maxQty: number) => void;
  /** Register a card borrowed from an unregistered contact (catalog). */
  onReceive?: () => void;
  readOnly?: boolean;
}) {
  const cc = colorClasses(card.color);
  const [helperOpen, setHelperOpen] = useState(false);
  const [compactLabelVisible, setCompactLabelVisible] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const compactLabelTimer = useRef<number | null>(null);

  const displayQty = status?.displayQty ?? owned;
  const statusColor: StatusColor = status?.statusColor ?? (owned > 0 ? 'green' : 'green');
  const lentOutTotal = status?.lentOut.reduce((s, r) => s + r.qty, 0) ?? 0;
  const stepperMin = lentOutTotal;
  const stepperValue = displayQty;
  const helperRowCount = status
    ? status.decks.length +
      status.lentOut.length +
      status.borrowedIn.length +
      (status.box > 0 ? 1 : 0)
    : 0;

  const openHelper = useCallback(() => {
    if (compactLabelTimer.current !== null) {
      window.clearTimeout(compactLabelTimer.current);
      compactLabelTimer.current = null;
    }
    setCompactLabelVisible(true);
    setHelperOpen(true);
  }, []);

  const closeHelper = useCallback(() => {
    if (compactLabelTimer.current !== null) {
      window.clearTimeout(compactLabelTimer.current);
    }
    // Keep the label's layout space, but hide its glyphs while the shared
    // layout box morphs back to the compact badge.
    setCompactLabelVisible(false);
    setHelperOpen(false);
    compactLabelTimer.current = window.setTimeout(() => {
      setCompactLabelVisible(true);
      compactLabelTimer.current = null;
    }, 300);
  }, []);

  useEffect(() => {
    if (!helperOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        closeHelper();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeHelper();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [closeHelper, helperOpen]);

  useEffect(
    () => () => {
      if (compactLabelTimer.current !== null) {
        window.clearTimeout(compactLabelTimer.current);
      }
    },
    [],
  );

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
          <motion.span
            layoutId={`quantity-helper-${card.productId}`}
            transition={{ layout: { duration: 0.28, ease: 'easeInOut' } }}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (status) openHelper();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                e.preventDefault();
                if (status) openHelper();
              }
            }}
            className={`absolute bottom-1 right-1 inline-flex h-7 items-center border bg-void/85 px-1.5 font-mono text-[16px] ${STATUS_BADGE[statusColor]} ${
              status ? 'cursor-pointer hover:bg-void' : ''
            }`}
            title={status ? 'Ver ubicaciones' : undefined}
          >
            <span
              className={`transition-opacity duration-100 ${
                compactLabelVisible ? 'opacity-100' : 'opacity-0'
              }`}
            >
              x{displayQty}
            </span>
          </motion.span>
        )}

        {helperOpen && status && (
          <div
            className="absolute bottom-1 right-1 z-10 flex w-[calc(100%_-_0.5rem)] flex-col gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            {status.decks.map((d, index) => (
              <HelperRow
                key={`d-${d.deckId}`}
                tone="red"
                label={`x${d.qty} ${d.name}`}
                revealOrder={helperRowCount - 1 - index}
                layoutId={
                  status.box <= 0 &&
                  status.borrowedIn.length === 0 &&
                  status.lentOut.length === 0 &&
                  index === status.decks.length - 1
                    ? `quantity-helper-${card.productId}`
                    : undefined
                }
              />
            ))}
            {status.lentOut.map((r, index) => (
              <HelperRow
                key={`l-${r.contactId ?? r.userId}-${r.loanId}`}
                tone="blue"
                label={`x${r.qty} → ${r.username}`}
                revealOrder={helperRowCount - 1 - (status.decks.length + index)}
                layoutId={
                  status.box <= 0 &&
                  status.borrowedIn.length === 0 &&
                  index === status.lentOut.length - 1
                    ? `quantity-helper-${card.productId}`
                    : undefined
                }
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
            {status.borrowedIn.map((r, index) => (
              <HelperRow
                key={`b-${r.contactId ?? r.userId}-${r.loanId}`}
                tone="purple"
                label={`x${r.qty} ← ${r.username}`}
                revealOrder={
                  helperRowCount -
                  1 -
                  (status.decks.length + status.lentOut.length + index)
                }
                layoutId={
                  status.box <= 0 && index === status.borrowedIn.length - 1
                    ? `quantity-helper-${card.productId}`
                    : undefined
                }
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
            {status.box > 0 && (
              <HelperRow
                tone="green"
                label={`x${status.box} Colección`}
                revealOrder={0}
                layoutId={`quantity-helper-${card.productId}`}
                action={
                  onLend && !readOnly
                    ? { label: 'Prestar', onClick: () => onLend(status.box) }
                    : undefined
                }
              />
            )}
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
      {onReceive && !readOnly && (
        <button
          type="button"
          onClick={onReceive}
          className="flex w-full items-center justify-center border-t border-borrow/40 px-2 py-1 font-display text-[10px] uppercase tracking-[0.14em] text-borrow hover:bg-borrow/10"
        >
          Recibir prestado
        </button>
      )}
      {footer}
    </div>
  );
}

function HelperRow({
  tone,
  label,
  action,
  revealOrder,
  layoutId,
}: {
  tone: 'green' | 'red' | 'blue' | 'purple';
  label: string;
  action?: { label: string; onClick: () => void };
  revealOrder: number;
  layoutId?: string;
}) {
  const colors =
    tone === 'green'
      ? 'border-ok text-ok'
      : tone === 'red'
        ? 'border-alert text-alert'
        : tone === 'blue'
          ? 'border-loan text-loan'
          : 'border-borrow text-borrow';
  const rowDelay = layoutId ? 0 : 0.08 + revealOrder * 0.07;
  return (
    <motion.div
      layoutId={layoutId}
      initial={layoutId ? false : { y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{
        ...(layoutId
          ? { layout: { duration: 0.28, ease: 'easeInOut' as const } }
          : {
              duration: 0.24,
              delay: rowDelay,
              ease: 'easeInOut' as const,
            }),
      }}
      className={`flex h-7 items-center justify-between gap-1 border bg-void/85 px-1.5 font-mono text-[16px] ${colors}`}
    >
      <TypewriterText
        text={label}
        delayMs={(layoutId ? 80 : rowDelay * 1000 + 70)}
      />
      {action && (
        <button
          type="button"
          className="shrink-0 border border-current px-1 text-[9px] uppercase hover:bg-current/10"
          onClick={(e) => {
            e.stopPropagation();
            action.onClick();
          }}
        >
          {action.label}
        </button>
      )}
    </motion.div>
  );
}

function TypewriterText({ text, delayMs }: { text: string; delayMs: number }) {
  const [length, setLength] = useState(0);

  useEffect(() => {
    setLength(0);
    let intervalId: number | null = null;
    const startId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        setLength((current) => {
          if (current >= text.length) {
            if (intervalId !== null) window.clearInterval(intervalId);
            return current;
          }
          return current + 1;
        });
      }, 18);
    }, delayMs);

    return () => {
      window.clearTimeout(startId);
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, [delayMs, text]);

  const complete = length >= text.length;
  return (
    <span className="min-w-0 truncate uppercase tracking-wide" aria-label={text}>
      <span aria-hidden="true">{text.slice(0, length)}</span>
      {!complete && (
        <span aria-hidden="true" className="ml-px animate-blink">
          _
        </span>
      )}
    </span>
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
