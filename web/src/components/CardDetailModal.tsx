import { motion } from 'framer-motion';
import type { Card } from '../lib/types';
import { CardImage } from './CardTile';
import { Gauge, HudButton } from './hud';
import { colorClasses } from '../lib/colors';

export function CardDetailModal({ card, onClose }: { card: Card; onClose: () => void }) {
  const cc = colorClasses(card.color);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-void/80 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className={`relative flex max-h-[90vh] w-full max-w-6xl flex-col gap-6 overflow-auto border bg-panel/95 p-6 md:flex-row ${cc.border} shadow-hud-strong`}
      >
        <div className="mx-auto w-80 shrink-0 md:w-[26rem]">
          <div className="aspect-[5/7] w-full overflow-hidden border border-line">
            <CardImage card={card} />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-2xl text-ink">{card.name}</h2>
              <p className="font-mono text-sm text-muted">
                {card.cardNumber} · {card.setName} · {card.rarity}
              </p>
            </div>
            <HudButton variant="ghost" className="!text-sm" onClick={onClose}>
              Cerrar
            </HudButton>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Gauge label="Coste" value={card.cost} size="lg" />
            <Gauge label="Lv" value={card.level} size="lg" />
            {card.cardType === 'UNIT' && <Gauge label="AP" value={card.apRaw ?? card.ap} tone="amber" size="lg" />}
            {card.cardType === 'UNIT' && <Gauge label="HP" value={card.hpRaw ?? card.hp} tone="ok" size="lg" />}
            <div className="flex min-w-[55px] flex-col items-center border border-line bg-void/50 px-2 py-1.5">
              <span className="font-display text-[10px] uppercase tracking-[0.18em] text-muted">Color</span>
              <span className={`font-mono text-lg ${cc.text}`}>{card.color ?? '—'}</span>
            </div>
            <div className="flex min-w-[55px] flex-col items-center border border-line bg-void/50 px-2 py-1.5">
              <span className="font-display text-[10px] uppercase tracking-[0.18em] text-muted">Tipo</span>
              <span className="font-mono text-lg text-hud">{card.cardType}</span>
            </div>
          </div>

          {card.trait && <p className="mt-4 font-mono text-sm text-amber">{card.trait}</p>}
          {card.link && <p className="font-mono text-sm text-hud">Link: {card.link}</p>}

          {card.effect && (
            <div className="mt-4 whitespace-pre-line border-l-2 border-hud/40 bg-void/40 p-4 font-body text-[17px] leading-relaxed text-ink/90">
              {card.effect}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
