import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HudButton } from './hud';
import { proxied } from '../lib/img';
import { formatDeckText } from '../lib/deckImport';
import {
  encodeDeckImage,
  deckImageFileSlug,
  pickCoverCard,
  renderDeckImage,
  type DeckImageCard,
  type DeckImageFormat,
  type DeckImageOptions,
} from '../lib/deckImage';

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

export function DeckImageDialog({
  title,
  creator,
  cards,
  onClose,
}: {
  title: string;
  creator: string;
  cards: DeckImageCard[];
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const [options, setOptions] = useState<DeckImageOptions>({
    layout: 'poster',
    order: 'cost',
    format: 'png',
    size: 'standard',
    showCreator: true,
    showName: true,
    showCover: true,
    showQr: true,
    coverCardNumber: null,
  });
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [missingArt, setMissingArt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const playable = useMemo(() => cards.filter((card) => card.quantity > 0), [cards]);
  const cardKey = playable
    .map(
      (card) =>
        `${card.cardNumber}:${card.quantity}:${card.cardType ?? ''}:${card.color ?? ''}:${card.level ?? ''}:${card.cost ?? ''}:${card.imageUrl ?? ''}:${card.name}`,
    )
    .join('|');
  const qrText = formatDeckText(
    playable.map((card) => ({ cardNumber: card.cardNumber, quantity: card.quantity })),
    { title },
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (playable.length === 0) {
      sourceRef.current = null;
      setReady(false);
      setMissingArt(0);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setBusy(true);
        setError(null);
        try {
          const images = await loadImages(playable);
          if (cancelled) return;
          const rendered = await renderDeckImage(
            { title, creator, cards: playable, qrText },
            options,
            images,
          );
          if (cancelled) return;
          sourceRef.current = rendered.canvas;
          const preview = canvasRef.current;
          if (preview) {
            preview.width = rendered.canvas.width;
            preview.height = rendered.canvas.height;
            preview.getContext('2d')?.drawImage(rendered.canvas, 0, 0);
          }
          setMissingArt(rendered.missingArt);
          setReady(true);
        } catch {
          if (!cancelled) setError('No se pudo generar la imagen');
        } finally {
          if (!cancelled) setBusy(false);
        }
      })();
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cardKey, creator, options, qrText, title]);

  async function blobFor(format: DeckImageFormat): Promise<Blob | null> {
    const source = sourceRef.current;
    if (!source) return null;
    return encodeDeckImage(source, format);
  }

  async function download() {
    const blob = await blobFor(options.format);
    if (!blob) return;
    const extension = options.format === 'jpeg' ? 'jpg' : 'png';
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${deckImageFileSlug(title)}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash('Imagen descargada');
  }

  async function copy() {
    const blob = await blobFor('png');
    if (!blob) return;
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        flash('Este navegador no puede copiar imágenes. Usa Descargar.');
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      flash('Imagen copiada');
    } catch {
      flash('No se pudo copiar. Usa Descargar.');
    }
  }

  async function share() {
    const blob = await blobFor(options.format);
    if (!blob) return;
    const extension = options.format === 'jpeg' ? 'jpg' : 'png';
    const file = new File([blob], `${deckImageFileSlug(title)}.${extension}`, { type: blob.type });
    if (typeof navigator.share !== 'function' || !navigator.canShare?.({ files: [file] })) {
      flash('Compartir no está disponible en este navegador.');
      return;
    }
    try {
      await navigator.share({ files: [file], title: title || 'Deck' });
      flash('Imagen compartida');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      flash('No se pudo compartir la imagen.');
    }
  }

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 1800);
  }

  const canShare = typeof navigator.share === 'function';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-3" onClick={onClose}>
      <div
        className="flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden border border-hud/30 bg-panel shadow-hud"
        role="dialog"
        aria-modal="true"
        aria-label="Imagen del deck"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="font-display text-xs uppercase tracking-[0.22em] text-hud">Imagen</h2>
            <p className="font-mono text-[11px] text-muted">Póster del deck listo para copiar o descargar</p>
          </div>
          <button
            type="button"
            className="font-mono text-lg text-muted hover:text-ink"
            aria-label="Cerrar"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <aside className="max-h-[42dvh] shrink-0 space-y-4 overflow-auto border-b border-line p-4 lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r">
            <OptionGroup label="Disposición">
              <Radio
                name="deck-image-layout"
                checked={options.layout === 'poster'}
                onChange={() => patch(setOptions, { layout: 'poster' })}
                label="Póster"
              />
              <Radio
                name="deck-image-layout"
                checked={options.layout === 'grid'}
                onChange={() => patch(setOptions, { layout: 'grid' })}
                label="Rejilla"
              />
            </OptionGroup>
            <OptionGroup label="Orden">
              <Radio
                name="deck-image-order"
                checked={options.order === 'default'}
                onChange={() => patch(setOptions, { order: 'default' })}
                label="Por defecto"
              />
              <Radio
                name="deck-image-order"
                checked={options.order === 'level'}
                onChange={() => patch(setOptions, { order: 'level' })}
                label="Nivel"
              />
              <Radio
                name="deck-image-order"
                checked={options.order === 'cost'}
                onChange={() => patch(setOptions, { order: 'cost' })}
                label="Coste"
              />
            </OptionGroup>
            <OptionGroup label="Formato">
              <Radio
                name="deck-image-format"
                checked={options.format === 'png'}
                onChange={() => patch(setOptions, { format: 'png' })}
                label="PNG (sin pérdida)"
              />
              <Radio
                name="deck-image-format"
                checked={options.format === 'jpeg'}
                onChange={() => patch(setOptions, { format: 'jpeg' })}
                label="JPEG (más pequeño)"
              />
            </OptionGroup>
            <OptionGroup label="Tamaño">
              <Radio
                name="deck-image-size"
                checked={options.size === 'standard'}
                onChange={() => patch(setOptions, { size: 'standard' })}
                label="Estándar (1080p)"
              />
              <Radio
                name="deck-image-size"
                checked={options.size === 'large'}
                onChange={() => patch(setOptions, { size: 'large' })}
                label="Grande (1920p)"
              />
              <Radio
                name="deck-image-size"
                checked={options.size === 'ultra'}
                onChange={() => patch(setOptions, { size: 'ultra' })}
                label="Ultra (2560p)"
              />
            </OptionGroup>
            <OptionGroup label="Contenido">
              <Check
                checked={options.showCreator}
                onChange={(showCreator) => patch(setOptions, { showCreator })}
                label="Creador"
              />
              <Check
                checked={options.showName}
                onChange={(showName) => patch(setOptions, { showName })}
                label="Nombre del deck"
              />
              <Check
                checked={options.showCover}
                onChange={(showCover) => patch(setOptions, { showCover })}
                label="Portada"
              />
              {options.showCover && (
                <CoverPicker
                  cards={playable}
                  selected={options.coverCardNumber}
                  onSelect={(coverCardNumber) => patch(setOptions, { coverCardNumber })}
                />
              )}
              <Check
                checked={options.showQr}
                onChange={(showQr) => patch(setOptions, { showQr })}
                label="Código QR"
              />
              <p className="font-mono text-[10px] leading-relaxed text-muted">
                El QR lleva la lista en texto, para poder importarla al escanearlo.
              </p>
            </OptionGroup>
          </aside>

          <div className="min-h-[240px] flex-1 overflow-auto bg-[#101116] p-3">
            {playable.length === 0 ? (
              <p className="p-6 text-center font-mono text-sm text-muted">El deck no tiene cartas.</p>
            ) : (
              <>
                {!ready && busy && (
                  <p className="p-6 text-center font-mono text-sm text-muted">Generando imagen…</p>
                )}
                <canvas
                  ref={canvasRef}
                  className={`mx-auto h-auto w-full max-w-3xl ${ready ? '' : 'hidden'}`}
                />
                {ready && busy && (
                  <p className="mt-2 text-center font-mono text-[11px] text-muted">Actualizando…</p>
                )}
                {missingArt > 0 && ready && (
                  <p className="mt-2 text-center font-mono text-[11px] text-amber">
                    {missingArt === 1
                      ? 'Una carta no tiene ilustración y muestra el nombre.'
                      : `${missingArt} cartas no tienen ilustración y muestran el nombre.`}
                  </p>
                )}
                {error && <p className="mt-2 text-center font-mono text-[12px] text-alert">{error}</p>}
              </>
            )}
          </div>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          <HudButton variant="ghost" onClick={() => void copy()} disabled={!ready || busy || playable.length === 0}>
            Copiar imagen
          </HudButton>
          <HudButton variant="ok" onClick={() => void download()} disabled={!ready || busy || playable.length === 0}>
            Descargar
          </HudButton>
          {canShare && (
            <HudButton variant="ghost" onClick={() => void share()} disabled={!ready || busy || playable.length === 0}>
              Compartir
            </HudButton>
          )}
          <HudButton variant="ghost" onClick={onClose}>
            Cerrar
          </HudButton>
          {notice && <span className="font-mono text-[12px] text-ok">{notice}</span>}
        </footer>
      </div>
    </div>
  );
}

function patch(
  setOptions: (value: DeckImageOptions | ((current: DeckImageOptions) => DeckImageOptions)) => void,
  partial: Partial<DeckImageOptions>,
) {
  setOptions((current) => ({ ...current, ...partial }));
}

function OptionGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="font-display text-[9px] uppercase tracking-[0.18em] text-muted">{label}</legend>
      <div className="flex flex-col gap-1">{children}</div>
    </fieldset>
  );
}

function Radio({
  name,
  checked,
  onChange,
  label,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 font-ui text-sm text-ink">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="accent-hud" />
      {label}
    </label>
  );
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 font-ui text-sm text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-hud"
      />
      {label}
    </label>
  );
}

function CoverPicker({
  cards,
  selected,
  onSelect,
}: {
  cards: DeckImageCard[];
  selected: string | null;
  onSelect: (cardNumber: string) => void;
}) {
  const choices = cards.filter((card) => card.quantity > 0 && card.imageUrl);
  const active = pickCoverCard(choices, selected)?.cardNumber ?? null;
  if (choices.length === 0) {
    return <p className="font-mono text-[10px] text-muted">Ninguna carta del deck tiene ilustración.</p>;
  }
  return (
    <div className="space-y-1.5">
      <p className="font-display text-[9px] uppercase tracking-[0.18em] text-muted">Carta representante</p>
      <div className="grid max-h-44 grid-cols-4 gap-1.5 overflow-auto pr-1">
        {choices.map((card) => {
          const src = proxied(card.imageUrl, 160);
          const on = card.cardNumber === active;
          return (
            <button
              key={card.cardNumber}
              type="button"
              title={`${card.name} (${card.cardNumber})`}
              aria-label={`Usar ${card.name} como representante`}
              aria-pressed={on}
              onClick={() => onSelect(card.cardNumber)}
              className={`overflow-hidden border ${on ? 'border-hud shadow-hud' : 'border-line opacity-80 hover:opacity-100'}`}
            >
              {src ? (
                <img src={src} alt="" className="aspect-[5/7] w-full object-cover object-top" />
              ) : (
                <span className="flex aspect-[5/7] items-center justify-center px-1 text-center font-mono text-[8px] text-muted">
                  {card.cardNumber}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

async function loadImages(cards: DeckImageCard[]): Promise<Map<string, HTMLImageElement | null>> {
  const images = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    cards.map(async (card) => {
      if (images.has(card.cardNumber)) return;
      images.set(card.cardNumber, await loadProxied(card.imageUrl));
    }),
  );
  return images;
}

function loadProxied(url: string | null): Promise<HTMLImageElement | null> {
  const src = proxied(url, 1200);
  if (!src) return Promise.resolve(null);
  const cached = imageCache.get(src);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image.naturalWidth > 0 ? image : null);
    image.onerror = () => resolve(null);
    image.src = src;
  });
  imageCache.set(src, pending);
  return pending;
}
