import { useEffect, useRef, useState } from 'react';
import type { CardFilters } from '../lib/queries';
import { useSourceTitles, useTraits } from '../lib/queries';
import type { SetInfo } from '../lib/types';
import { CARD_COLORS } from '../lib/colors';

const CARD_TYPES = ['UNIT', 'PILOT', 'COMMAND', 'BASE', 'RESOURCE'];

function parseCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function Filters({
  filters,
  onChange,
  sets,
  cardTypes = CARD_TYPES,
  showStatusColor = false,
}: {
  filters: CardFilters;
  onChange: (next: CardFilters) => void;
  sets: SetInfo[];
  cardTypes?: string[];
  showStatusColor?: boolean;
}) {
  const sourceTitles = useSourceTitles();
  const traits = useTraits();

  const set = (patch: Partial<CardFilters>) => {
    const next: CardFilters = { ...filters, offset: 0, ...patch };
    for (const key of Object.keys(patch) as (keyof CardFilters)[]) {
      if (patch[key] === '') delete next[key];
    }
    onChange(next);
  };

  const selectedTraits = parseCsv(filters.traits);
  const selectedColors = parseCsv(filters.color);

  const toggleCsv = (key: 'traits' | 'color', value: string, current: string[]) => {
    const next = current.includes(value)
      ? current.filter((t) => t !== value)
      : [...current, value];
    set({ [key]: next.length ? next.join(',') : '' });
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Nombre o número">
        <input
          className="hud-input w-56"
          placeholder="nombre o GD05-001…"
          value={filters.name ?? ''}
          onChange={(e) => set({ name: e.target.value })}
        />
      </Field>
      <Field label="Efecto">
        <input
          className="hud-input w-44"
          placeholder="texto de efecto…"
          value={filters.effect ?? ''}
          onChange={(e) => set({ effect: e.target.value })}
        />
      </Field>
      <Field label="Set">
        <select className="hud-input w-40" value={filters.set_code ?? ''} onChange={(e) => set({ set_code: e.target.value })}>
          <option value="">Todos</option>
          {sets.map((s) => (
            <option key={s.setCode} value={s.setCode}>
              {s.setName ? `${s.setCode} · ${s.setName}` : s.setCode}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Serie">
        <select
          className="hud-input w-48"
          value={filters.source_title ?? ''}
          onChange={(e) => set({ source_title: e.target.value })}
        >
          <option value="">Todas</option>
          {(sourceTitles.data ?? []).map((s) => (
            <option key={s.sourceTitle} value={s.sourceTitle}>
              {s.sourceTitle}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex flex-col gap-1">
        <span className="font-display text-[9px] uppercase tracking-[0.2em] text-muted">Traits</span>
        <MultiSelect
          options={(traits.data ?? []).map((t) => t.trait)}
          selected={selectedTraits}
          onToggle={(trait) => toggleCsv('traits', trait, selectedTraits)}
          onClear={() => set({ traits: '' })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-display text-[9px] uppercase tracking-[0.2em] text-muted">Color</span>
        <MultiSelect
          options={[...CARD_COLORS]}
          selected={selectedColors}
          onToggle={(color) => toggleCsv('color', color, selectedColors)}
          onClear={() => set({ color: '' })}
          widthClass="w-40"
        />
      </div>
      <Field label="Tipo">
        <select className="hud-input w-32" value={filters.card_type ?? ''} onChange={(e) => set({ card_type: e.target.value })}>
          <option value="">Todos</option>
          {cardTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Nivel">
        <input
          className="hud-input w-16"
          type="number"
          min={0}
          value={filters.level ?? ''}
          onChange={(e) => set({ level: e.target.value })}
        />
      </Field>
      {showStatusColor && (
        <Field label="Estado">
          <select
            className="hud-input w-36"
            value={filters.status_color ?? ''}
            onChange={(e) => set({ status_color: e.target.value })}
          >
            <option value="">Todos</option>
            <option value="green">Verde · colección</option>
            <option value="yellow">Amarillo · mixto</option>
            <option value="red">Rojo · en decks</option>
          </select>
        </Field>
      )}
      <button
        type="button"
        onClick={() =>
          onChange({
            limit: filters.limit,
            offset: 0,
            ...(filters.owned_only ? { owned_only: filters.owned_only } : {}),
            ...(filters.group_variants ? { group_variants: filters.group_variants } : {}),
          })
        }
        className="border border-line px-3 py-2 font-display text-[11px] uppercase tracking-[0.16em] text-muted hover:border-alert/40 hover:text-alert"
      >
        Reset
      </button>
    </div>
  );
}

function MultiSelect({
  options,
  selected,
  onToggle,
  onClear,
  emptyLabel = 'Sin opciones',
  widthClass = 'w-48',
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  emptyLabel?: string;
  widthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const label =
    selected.length === 0
      ? 'Todos'
      : selected.length <= 2
        ? selected.join(', ')
        : `${selected.length} seleccionados`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={`hud-input flex ${widthClass} items-center justify-between gap-2 text-left`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-muted">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 max-h-56 w-64 overflow-y-auto border border-line bg-void/95 shadow-hud">
          <div className="sticky top-0 flex items-center justify-between border-b border-line bg-void px-2 py-1.5">
            <span className="font-display text-[9px] uppercase tracking-[0.16em] text-muted">
              Al menos uno
            </span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="font-display text-[9px] uppercase tracking-[0.16em] text-muted hover:text-alert"
              >
                Limpiar
              </button>
            )}
          </div>
          {options.length === 0 ? (
            <p className="px-3 py-2 font-mono text-[11px] text-muted">{emptyLabel}</p>
          ) : (
            <ul role="listbox" aria-multiselectable className="py-1">
              {options.map((option) => {
                const checked = selected.includes(option);
                return (
                  <li key={option}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-hud/10">
                      <input
                        type="checkbox"
                        className="accent-hud"
                        checked={checked}
                        onChange={() => onToggle(option)}
                      />
                      <span className="truncate font-ui text-[13px] text-ink">{option}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-display text-[9px] uppercase tracking-[0.2em] text-muted">{label}</span>
      {children}
    </label>
  );
}
