// Card color -> HUD accent classes (text / border / dot background)
export const CARD_COLORS = ['Blue', 'Green', 'Red', 'White', 'Purple'] as const;

const map: Record<string, { text: string; border: string; bg: string; hex: string }> = {
  Blue: { text: 'text-sky-300', border: 'border-sky-400/50', bg: 'bg-sky-400', hex: '#38bdf8' },
  Green: { text: 'text-emerald-300', border: 'border-emerald-400/50', bg: 'bg-emerald-400', hex: '#34d399' },
  Red: { text: 'text-rose-300', border: 'border-rose-400/50', bg: 'bg-rose-400', hex: '#fb7185' },
  White: { text: 'text-zinc-100', border: 'border-zinc-300/50', bg: 'bg-zinc-200', hex: '#e4e4e7' },
  Purple: { text: 'text-violet-300', border: 'border-violet-400/50', bg: 'bg-violet-400', hex: '#a78bfa' },
};

export function colorClasses(color: string | null | undefined) {
  return (color && map[color]) || { text: 'text-muted', border: 'border-line', bg: 'bg-muted', hex: '#6f909b' };
}
