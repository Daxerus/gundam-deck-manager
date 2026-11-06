/** D1 rejects a statement with more than 100 bound parameters. */
export const D1_MAX_BOUND_PARAMS = 90;

export function chunks<T>(items: readonly T[], size = D1_MAX_BOUND_PARAMS): T[][] {
  if (size < 1) throw new Error('chunk size must be positive');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Run a query once per slice so an IN (...) list stays under D1's bound-parameter limit. */
export async function queryInChunks<T, R>(
  items: readonly T[],
  run: (chunk: T[]) => Promise<readonly R[]>,
  size = D1_MAX_BOUND_PARAMS,
): Promise<R[]> {
  const out: R[] = [];
  for (const chunk of chunks(items, size)) {
    out.push(...(await run(chunk)));
  }
  return out;
}

/**
 * Two IN lists in one statement. Each side is sliced so the placeholders together
 * stay at or under {@link D1_MAX_BOUND_PARAMS}.
 */
export async function queryInChunks2<A, B, R>(
  left: readonly A[],
  right: readonly B[],
  run: (leftChunk: A[], rightChunk: B[]) => Promise<readonly R[]>,
): Promise<R[]> {
  const size = Math.floor(D1_MAX_BOUND_PARAMS / 2);
  const out: R[] = [];
  for (const leftChunk of chunks(left, size)) {
    for (const rightChunk of chunks(right, size)) {
      out.push(...(await run(leftChunk, rightChunk)));
    }
  }
  return out;
}
