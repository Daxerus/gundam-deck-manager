import type { CardFilters } from '../lib/queries';
import type { SetInfo } from '../lib/types';
import { CARD_COLORS } from '../lib/colors';

const CARD_TYPES = ['UNIT', 'PILOT', 'COMMAND', 'BASE', 'RESOURCE'];

export function Filters({
  filters,
  onChange,
  sets,
  cardTypes = CARD_TYPES,
}: {
  filters: CardFilters;
  onChange: (next: CardFilters) => void;
  sets: SetInfo[];
  cardTypes?: string[];
}) {
  const set = (patch: Partial<CardFilters>) => {
    const next: CardFilters = { ...filters, offset: 0, ...patch };
    for (const key of Object.keys(patch) as (keyof CardFilters)[]) {
      if (patch[key] === '') delete next[key];
    }
    onChange(next);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Buscar">
        <input
          className="hud-input w-48"
          placeholder="nombre…"
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
              {s.setCode} · {s.setName}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Color">
        <select className="hud-input w-32" value={filters.color ?? ''} onChange={(e) => set({ color: e.target.value })}>
          <option value="">Todos</option>
          {CARD_COLORS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
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
      <Field label="Coste">
        <input
          className="hud-input w-16"
          type="number"
          min={0}
          value={filters.cost ?? ''}
          onChange={(e) => set({ cost: e.target.value })}
        />
      </Field>
      <button
        type="button"
        onClick={() => onChange({ limit: filters.limit, offset: 0 })}
        className="border border-line px-3 py-2 font-display text-[11px] uppercase tracking-[0.16em] text-muted hover:border-alert/40 hover:text-alert"
      >
        Reset
      </button>
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
