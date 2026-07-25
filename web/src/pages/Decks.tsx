import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel, HudButton, StatusBadge } from '../components/hud';
import { useCreateDeck, useDecks, useDeleteDeck } from '../lib/queries';
import { MAIN_DECK_SIZE } from '../lib/rules';

export function Decks() {
  const decks = useDecks();
  const createDeck = useCreateDeck();
  const deleteDeck = useDeleteDeck();
  const navigate = useNavigate();
  const [name, setName] = useState('');

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const deck = await createDeck.mutateAsync({ name: name.trim() || 'Nuevo deck' });
    setName('');
    navigate(`/decks/${deck.id}`);
  }

  return (
    <div className="space-y-4">
      <Panel title="Deck Bay // Index" subtitle={`${decks.data?.length ?? 0} decks`}>
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-display text-[9px] uppercase tracking-[0.2em] text-muted">Nuevo deck</span>
            <input
              className="hud-input w-64"
              placeholder="nombre del deck…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <HudButton type="submit" variant="ok" className="py-2">
            + Crear deck
          </HudButton>
        </form>
      </Panel>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {decks.data?.map((d) => (
          <Panel
            key={d.id}
            tone={d.isActive ? 'ok' : d.complete ? 'hud' : 'amber'}
            title={d.name}
            right={
              d.isActive ? (
                <StatusBadge tone="ok" blink>
                  Activo
                </StatusBadge>
              ) : d.complete ? (
                <StatusBadge tone="hud">Listo</StatusBadge>
              ) : (
                <StatusBadge tone="amber">Incompleto</StatusBadge>
              )
            }
          >
            <div className="flex items-center justify-between font-mono text-[12px] text-muted">
              <span>
                Main:{' '}
                <span className={d.mainCount === MAIN_DECK_SIZE ? 'text-ok' : 'text-amber'}>
                  {d.mainCount}/{MAIN_DECK_SIZE}
                </span>
              </span>
              <span className={d.buildable ? 'text-ok' : 'text-alert'}>
                {d.buildable ? 'Construible' : 'Faltan cartas'}
              </span>
            </div>
            <div className="mt-3 flex gap-2">
              <HudButton onClick={() => navigate(`/decks/${d.id}`)}>Editar</HudButton>
              <HudButton
                variant="alert"
                onClick={() => {
                  if (confirm(`¿Eliminar el deck "${d.name}"?`)) deleteDeck.mutate(d.id);
                }}
              >
                Eliminar
              </HudButton>
            </div>
          </Panel>
        ))}
      </div>

      {decks.data && decks.data.length === 0 && (
        <Panel tone="amber">
          <p className="font-ui text-ink">No tienes decks todavía. Crea uno arriba para empezar.</p>
        </Panel>
      )}
    </div>
  );
}
