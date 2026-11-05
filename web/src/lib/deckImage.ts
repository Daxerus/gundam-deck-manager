import type { DeckImageCard } from './deckImageModel';

export type {
  DeckImageCard,
  DeckImageCurve,
  DeckImageFormat,
  DeckImageLayout,
  DeckImageOptions,
  DeckImageOrder,
  DeckImageSize,
  PreparedDeckImage,
} from './deckImageModel';

export {
  DECK_IMAGE_WIDTH,
  deckImageFileSlug,
  pickCoverCard,
  prepareDeckImage,
} from './deckImageModel';

import { DECK_IMAGE_WIDTH, prepareDeckImage } from './deckImageModel';
import type { DeckImageFormat, DeckImageOptions } from './deckImageModel';

const INK = '#fafafa';
const INK_2 = '#cfcfd4';
const INK_3 = '#9a9aa3';
const VOID = '#101116';
const BRAND = '#ff0';
const LINE = '#3d3d45';
const BAR = '#d4d7dd';
const FONT = 'Arial, "Segoe UI", sans-serif';
const DISPLAY = '"Arial Black", Arial, sans-serif';

export interface DeckImageRenderInput {
  title: string;
  creator: string;
  cards: DeckImageCard[];
  qrText: string;
}

export async function renderDeckImage(
  input: DeckImageRenderInput,
  options: DeckImageOptions,
  images: ReadonlyMap<string, HTMLImageElement | null>,
): Promise<{ canvas: HTMLCanvasElement; missingArt: number }> {
  const prepared = prepareDeckImage(input.cards, options);
  const width = DECK_IMAGE_WIDTH[options.size];
  const scale = width / prepared.sheet.width;
  const height = Math.max(1, Math.ceil(prepared.sheet.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const px = (n: number) => n * scale;
  const missingIds = new Set<string>();

  ctx.fillStyle = VOID;
  ctx.fillRect(0, 0, width, height);

  const heroH = px(prepared.sheet.heroHeight);
  if (options.showCover && prepared.cover) {
    drawCover(ctx, images.get(prepared.cover.cardNumber) ?? null, width, heroH);
  }

  drawInfo(ctx, input, options, prepared, px, width, heroH);

  if (options.showQr && input.qrText.trim()) {
    const qr = await loadQr(input.qrText);
    if (qr) drawQr(ctx, qr, width, heroH, px);
  }

  const contentLeft = px(prepared.sheet.padX);
  const contentWidth = px(prepared.sheet.width - prepared.sheet.padX * 2);
  const headingTop = heroH + px(14);
  drawSectionHeading(ctx, contentLeft, headingTop, contentWidth, px);

  const { columns, faceWidth, faceHeight, gapX, gapY, caption, showCount } = prepared.sheet;
  prepared.cells.forEach((card, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = prepared.sheet.padX + col * (faceWidth + gapX);
    const y = prepared.sheet.cardsTop + row * (faceHeight + caption + gapY);
    const image = images.get(card.cardNumber) ?? null;
    if (!image) missingIds.add(card.cardNumber);
    drawCard(ctx, card, image, x, y, faceWidth, faceHeight, caption, showCount, px);
  });

  return { canvas, missingArt: missingIds.size };
}

export function encodeDeckImage(canvas: HTMLCanvasElement, format: DeckImageFormat): Promise<Blob> {
  const type = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const quality = format === 'jpeg' ? 0.92 : undefined;
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo codificar la imagen'))), type, quality);
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  width: number,
  heroH: number,
) {
  if (!image) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, heroH);
  ctx.clip();

  // A tall crop keeps the character art and drops the card frame and text box.
  const artH = heroH * 1.45;
  const artW = width * 0.68;
  const artX = width - artW * 0.92;
  const artY = (heroH - artH) / 2;
  drawImageCover(ctx, image, artX, artY, artW, artH, 0.2);
  ctx.fillStyle = 'rgba(16, 17, 22, 0.18)';
  ctx.fillRect(0, 0, width, heroH);

  const fade = ctx.createLinearGradient(0, 0, width, 0);
  fade.addColorStop(0, VOID);
  fade.addColorStop(0.34, VOID);
  fade.addColorStop(0.58, 'rgba(16, 17, 22, 0)');
  fade.addColorStop(1, 'rgba(16, 17, 22, 0.15)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, width, heroH);

  const vertical = ctx.createLinearGradient(0, heroH * 0.55, 0, heroH);
  vertical.addColorStop(0, 'rgba(16, 17, 22, 0)');
  vertical.addColorStop(1, VOID);
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, width, heroH);
  ctx.restore();
}

function drawInfo(
  ctx: CanvasRenderingContext2D,
  input: DeckImageRenderInput,
  options: DeckImageOptions,
  prepared: ReturnType<typeof prepareDeckImage>,
  px: (n: number) => number,
  width: number,
  heroH: number,
) {
  const maxW = Math.min(px(860), width - px(48));
  let y = px(34);
  const x = px(40);

  if (options.showName) {
    const title = (input.title.trim() || 'Deck').toUpperCase();
    const used = drawTitle(ctx, title, x, y, maxW, px);
    y += used + px(8);
  }

  if (options.showCreator && input.creator.trim()) {
    drawAuthor(ctx, input.creator.trim(), x, y, px);
    y += px(26);
  }

  y += px(14);
  drawTypes(ctx, prepared.types, x, y, px);
  y += px(58);

  y += px(8);
  drawColors(ctx, prepared.colors, x, y, maxW, px);
  y += px(40);

  const curveTop = Math.min(y + px(8), heroH - px(96));
  drawCurves(ctx, prepared.curves, x, curveTop, maxW, px);
}

function drawTitle(
  ctx: CanvasRenderingContext2D,
  title: string,
  x: number,
  y: number,
  maxW: number,
  px: (n: number) => number,
) {
  let size = px(84);
  const min = px(36);
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  setLetterSpacing(ctx, px(-2.4));
  while (size > min) {
    ctx.font = `900 ${size}px ${DISPLAY}`;
    if (ctx.measureText(title).width <= maxW) {
      ctx.fillText(title, x, y);
      setLetterSpacing(ctx, 0);
      return size * 1.05;
    }
    size -= px(2);
  }
  ctx.font = `900 ${min}px ${DISPLAY}`;
  const lines = wrapText(ctx, title, maxW).slice(0, 2);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * min * 1.05));
  setLetterSpacing(ctx, 0);
  return lines.length * min * 1.05;
}

function drawAuthor(
  ctx: CanvasRenderingContext2D,
  creator: string,
  x: number,
  y: number,
  px: (n: number) => number,
) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `450 ${px(24)}px ${FONT}`;
  ctx.fillStyle = INK_2;
  const prefix = 'by ';
  ctx.fillText(prefix, x, y + px(13));
  const prefixW = ctx.measureText(prefix).width;
  ctx.font = `700 ${px(24)}px ${FONT}`;
  ctx.fillStyle = INK;
  ctx.fillText(creator, x + prefixW, y + px(13));
}

function drawTypes(
  ctx: CanvasRenderingContext2D,
  types: { label: string; count: number }[],
  x: number,
  y: number,
  px: (n: number) => number,
) {
  let cursor = x;
  for (const type of types) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `700 ${px(29)}px ${FONT}`;
    ctx.fillStyle = INK;
    const count = String(type.count);
    const countW = ctx.measureText(count).width;
    ctx.fillText(count, cursor, y);
    ctx.font = `650 ${px(16)}px ${FONT}`;
    ctx.fillStyle = INK_2;
    const labelW = ctx.measureText(type.label).width;
    ctx.fillText(type.label, cursor, y + px(32));
    cursor += Math.max(countW, labelW) + px(30);
  }
}

function drawColors(
  ctx: CanvasRenderingContext2D,
  colors: { color: string; count: number; hex: string }[],
  x: number,
  y: number,
  maxW: number,
  px: (n: number) => number,
) {
  const gap = px(colors.length > 4 ? 16 : 26);
  let cursor = x;
  for (const color of colors) {
    if (cursor - x > maxW - px(40)) break;
    const dot = px(22);
    ctx.beginPath();
    ctx.fillStyle = color.hex;
    ctx.arc(cursor + dot / 2, y + dot / 2 + px(4), dot / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.stroke();
    cursor += dot + px(8);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${px(26)}px ${FONT}`;
    ctx.fillStyle = INK;
    const count = String(color.count);
    ctx.fillText(count, cursor, y + px(15));
    cursor += ctx.measureText(count).width + px(8);
    ctx.font = `600 ${px(16)}px ${FONT}`;
    ctx.fillStyle = INK_2;
    const label = color.color.toUpperCase();
    ctx.fillText(label, cursor, y + px(16));
    cursor += ctx.measureText(label).width + gap;
  }
}

function drawCurves(
  ctx: CanvasRenderingContext2D,
  curves: ReturnType<typeof prepareDeckImage>['curves'],
  x: number,
  y: number,
  maxW: number,
  px: (n: number) => number,
) {
  if (curves.length === 0) return;
  const gap = px(28);
  const groupW = Math.min(px(360), (maxW - gap * (curves.length - 1)) / curves.length);
  curves.forEach((curve, index) => {
    drawCurve(ctx, curve, x + index * (groupW + gap), y, groupW, px);
  });
}

function drawCurve(
  ctx: CanvasRenderingContext2D,
  curve: ReturnType<typeof prepareDeckImage>['curves'][number],
  x: number,
  y: number,
  width: number,
  px: (n: number) => number,
) {
  const labelW = px(64);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `700 ${px(15)}px ${FONT}`;
  ctx.fillStyle = INK_2;
  ctx.fillText(curve.label, x, y + px(4));
  if (curve.average != null) {
    ctx.font = `700 ${px(26)}px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.fillText(curve.average.toFixed(1), x, y + px(22));
  }

  const barsX = x + labelW;
  const barsW = Math.max(px(40), width - labelW);
  const buckets = curve.buckets;
  const gap = px(buckets.length > 10 ? 3 : 6);
  const binW = (barsW - gap * Math.max(0, buckets.length - 1)) / Math.max(1, buckets.length);
  const barMax = px(36);
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const last = buckets.length - 1;
  const step = last > 8 ? 2 : 1;

  buckets.forEach((bucket, index) => {
    const barH = Math.max(px(1), (bucket.count / maxCount) * barMax);
    const bx = barsX + index * (binW + gap);
    const by = y + barMax - barH;
    ctx.fillStyle = BAR;
    ctx.fillRect(bx, by, Math.max(1, binW), barH);
    const showLabel = index === last || (index % step === 0 && last - index >= step);
    if (!showLabel) return;
    ctx.font = `500 ${Math.max(8, Math.min(px(13), binW + px(4)))}px ${FONT}`;
    ctx.fillStyle = INK_3;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(bucket.label, bx + binW / 2, y + barMax + px(4));
  });
}

function drawQr(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  heroH: number,
  px: (n: number) => number,
) {
  const size = px(124);
  const x = width - px(28) - size;
  const y = heroH - px(20) - size;
  const radius = px(13);
  ctx.save();
  roundRect(ctx, x, y, size, size, radius);
  ctx.clip();
  ctx.drawImage(image, x, y, size, size);
  ctx.restore();
}

function drawSectionHeading(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  px: (n: number) => number,
) {
  const label = 'DECK';
  ctx.font = `800 ${px(16)}px ${FONT}`;
  const textW = ctx.measureText(label).width;
  const boxW = textW + px(18);
  const boxH = px(32);
  ctx.fillStyle = BRAND;
  ctx.fillRect(x, y + px(4), boxW, boxH);
  ctx.lineWidth = px(1.5);
  ctx.strokeStyle = INK;
  ctx.strokeRect(x, y + px(4), boxW, boxH);
  ctx.fillStyle = VOID;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + boxW / 2, y + px(4) + boxH / 2);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = px(1);
  ctx.beginPath();
  ctx.moveTo(x + boxW + px(16), y + px(4) + boxH / 2);
  ctx.lineTo(x + width, y + px(4) + boxH / 2);
  ctx.stroke();
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  card: DeckImageCard,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  faceW: number,
  faceH: number,
  caption: number,
  showCount: boolean,
  px: (n: number) => number,
) {
  const dx = px(x);
  const dy = px(y);
  const dw = px(faceW);
  const dh = px(faceH);
  const radius = px(8);

  ctx.save();
  roundRect(ctx, dx, dy, dw, dh, radius);
  ctx.clip();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(dx, dy, dw, dh);
  if (image) {
    drawImageContain(ctx, image, dx, dy, dw, dh);
  } else {
    drawNameFallback(ctx, card.name, dx, dy, dw, dh, px);
  }
  ctx.restore();

  if (showCount) {
    drawCountBadge(ctx, card.quantity, dx, dy, dw, faceW, px);
  }

  if (caption > 0) {
    ctx.font = `650 ${px(22)}px ${FONT}`;
    ctx.fillStyle = INK_2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const captionY = dy + dh + px(caption) / 2;
    const code = card.cardNumber.toUpperCase();
    const maxW = dw - px(4);
    ctx.fillText(fitLine(ctx, code, maxW), dx + dw / 2, captionY);
  }
}

function drawCountBadge(
  ctx: CanvasRenderingContext2D,
  quantity: number,
  x: number,
  y: number,
  faceW: number,
  refFaceW: number,
  px: (n: number) => number,
) {
  const badgeScale = refFaceW / 313.6;
  const height = px(58 * badgeScale);
  const font = px(40 * badgeScale);
  const text = `\u00d7${quantity}`;
  ctx.font = `900 ${font}px ${DISPLAY}`;
  const textW = ctx.measureText(text).width;
  const width = Math.max(px(72 * badgeScale), textW + px(18 * badgeScale));
  const bx = x + faceW - width - px(8 * badgeScale);
  const by = y + px(8 * badgeScale);
  const radius = px(8 * badgeScale);
  ctx.fillStyle = '#0a0a0b';
  roundRect(ctx, bx, by, width, height, radius);
  ctx.fill();
  ctx.lineWidth = Math.max(1, px(2 * badgeScale));
  ctx.strokeStyle = '#ffffff';
  roundRect(ctx, bx, by, width, height, radius);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + width / 2, by + height / 2 + px(1));
}

function drawNameFallback(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  px: (n: number) => number,
) {
  ctx.fillStyle = '#1a1a1e';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${px(16)}px ${FONT}`;
  const lines = wrapText(ctx, name || 'Sin imagen', w - px(16)).slice(0, 5);
  const lineH = px(20);
  const block = lines.length * lineH;
  lines.forEach((line, index) => {
    ctx.fillText(line, x + w / 2, y + h / 2 - block / 2 + index * lineH + lineH / 2);
  });
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  focusY = 0.5,
) {
  const sourceRatio = image.width / image.height;
  const boxRatio = w / h;
  let sx = 0;
  let sy = 0;
  let sw = image.width;
  let sh = image.height;
  if (sourceRatio > boxRatio) {
    sw = image.height * boxRatio;
    sx = (image.width - sw) / 2;
  } else {
    sh = image.width / boxRatio;
    const spare = Math.max(0, image.height - sh);
    sy = spare * Math.min(1, Math.max(0, focusY));
  }
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
}

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const sourceRatio = image.width / image.height;
  const boxRatio = w / h;
  let dw = w;
  let dh = h;
  if (sourceRatio > boxRatio) dh = w / sourceRatio;
  else dw = h * sourceRatio;
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

async function loadQr(text: string): Promise<HTMLImageElement | null> {
  try {
    const { toDataURL } = await import('qrcode');
    const url = await toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 512,
      color: { dark: '#000000', light: '#ffffff' },
    });
    return await loadDataUrl(url);
  } catch {
    return null;
  }
}

function loadDataUrl(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0] ?? '';
  for (const word of words.slice(1)) {
    const next = `${current} ${word}`;
    if (ctx.measureText(next).width <= maxWidth) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

function fitLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, value: number) {
  const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  spaced.letterSpacing = `${value}px`;
}
