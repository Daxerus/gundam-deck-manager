import { HudButton, StatusBadge } from './hud';
import type { CollectionDraft } from '../lib/useCollectionDraft';

/** Inline controls for the filters panel: draft state plus explicit save / discard. */
export function CollectionSaveControls({
  draft,
  className = '',
}: {
  draft: CollectionDraft;
  className?: string;
}) {
  const { pendingCount, isSaving, error } = draft;
  const dirty = pendingCount > 0;

  return (
    <div className={`border-t border-line/60 pt-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {dirty ? (
          <StatusBadge tone="amber" blink>
            {pendingCount} sin guardar
          </StatusBadge>
        ) : (
          <StatusBadge tone="ok">Sincronizado</StatusBadge>
        )}
        <span className="font-mono text-[11px] text-muted">
          Autoguardado cada 30 s y al salir de la página.
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <HudButton variant="ghost" onClick={draft.discard} disabled={!dirty || isSaving}>
            Descartar
          </HudButton>
          <HudButton variant="ok" onClick={draft.save} disabled={!dirty || isSaving}>
            {isSaving ? 'Guardando…' : 'Guardar cambios'}
          </HudButton>
        </div>
      </div>
      {error && <p className="mt-2 font-mono text-[12px] text-alert">{error}</p>}
    </div>
  );
}

/** Floating twin of the save button, stacked over the scroll-to-top control. */
export function CollectionSaveFab({ draft }: { draft: CollectionDraft }) {
  const { pendingCount, isSaving } = draft;
  const visible = pendingCount > 0;

  return (
    <button
      type="button"
      onClick={draft.save}
      disabled={isSaving}
      tabIndex={visible ? undefined : -1}
      className={`fixed bottom-[4.5rem] right-5 z-30 flex h-11 items-center gap-2 border border-ok/60 bg-void/90 px-3 font-display text-[11px] uppercase tracking-[0.16em] text-ok shadow-hud backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-ok hover:bg-ok/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ok disabled:cursor-not-allowed disabled:opacity-60 ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      }`}
      aria-hidden={!visible}
      aria-label={`Guardar ${pendingCount} cambios en la colección`}
      title="Guardar cambios de la colección"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-5 w-5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        <path d="M4 4h12l4 4v12H4z" />
        <path d="M8 4v6h8V4M8 20v-6h8v6" />
      </svg>
      <span>{isSaving ? 'Guardando…' : `Guardar (${pendingCount})`}</span>
    </button>
  );
}
