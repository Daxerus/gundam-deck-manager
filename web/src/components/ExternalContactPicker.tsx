import { useMemo, useState } from 'react';
import { useLoanContacts } from '../lib/queries';

export type ContactSelection =
  | { mode: 'existing'; contactId: number; nick: string }
  | { mode: 'new'; nick: string };

export function ExternalContactPicker({
  value,
  onChange,
}: {
  value: ContactSelection | null;
  onChange: (next: ContactSelection | null) => void;
}) {
  const contacts = useLoanContacts();
  const [newNick, setNewNick] = useState('');
  const list = contacts.data ?? [];

  const selectedId = value?.mode === 'existing' ? value.contactId : '';
  const usingNew = value?.mode === 'new';

  const sorted = useMemo(
    () => [...list].sort((a, b) => a.nick.localeCompare(b.nick, undefined, { sensitivity: 'base' })),
    [list],
  );

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="font-display text-[9px] uppercase tracking-[0.2em] text-muted">
          No registrado guardado
        </span>
        <select
          className="hud-input w-full"
          value={selectedId}
          disabled={contacts.isLoading}
          onChange={(e) => {
            const id = Number(e.target.value) || 0;
            if (!id) {
              onChange(usingNew && newNick.trim() ? { mode: 'new', nick: newNick.trim() } : null);
              return;
            }
            const row = sorted.find((c) => c.id === id);
            if (!row) return;
            setNewNick('');
            onChange({ mode: 'existing', contactId: row.id, nick: row.nick });
          }}
        >
          <option value="">Elige un nick…</option>
          {sorted.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nick}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-display text-[9px] uppercase tracking-[0.2em] text-muted">
          O escribe un nick nuevo
        </span>
        <input
          className="hud-input w-full"
          placeholder="ej. Pedro"
          value={usingNew ? value.nick : newNick}
          onChange={(e) => {
            const nick = e.target.value;
            setNewNick(nick);
            const trimmed = nick.trim();
            onChange(trimmed ? { mode: 'new', nick: trimmed } : null);
          }}
        />
      </label>

      {contacts.isLoading && <p className="font-mono text-[11px] text-muted">Cargando nicks…</p>}
      {!contacts.isLoading && sorted.length === 0 && (
        <p className="font-mono text-[11px] text-muted">
          Aún no tienes nicks guardados. Escribe uno y se reutilizará en futuros préstamos.
        </p>
      )}
    </div>
  );
}

export function selectionToPayload(sel: ContactSelection): { contactId?: number; nick?: string } {
  if (sel.mode === 'existing') return { contactId: sel.contactId };
  return { nick: sel.nick };
}
