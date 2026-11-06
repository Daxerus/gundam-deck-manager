import { describe, expect, it } from 'vitest';
import { chunks, D1_MAX_BOUND_PARAMS, queryInChunks, queryInChunks2 } from './d1';

describe('D1 bound-parameter chunking', () => {
  it('splits lists that would exceed the per-statement limit', () => {
    const ids = Array.from({ length: 101 }, (_, i) => i + 1);
    const parts = chunks(ids);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toHaveLength(D1_MAX_BOUND_PARAMS);
    expect(parts[1]).toHaveLength(101 - D1_MAX_BOUND_PARAMS);
    expect(parts.flat()).toEqual(ids);
  });

  it('does not call the query when the list is empty', async () => {
    const calls: number[] = [];
    const rows = await queryInChunks([], async (chunk) => {
      calls.push(chunk.length);
      return chunk;
    });
    expect(rows).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('keeps both IN lists under the bound-parameter budget', async () => {
    const left = Array.from({ length: 101 }, (_, i) => i);
    const right = Array.from({ length: 60 }, (_, i) => `p${i}`);
    const sizes: number[] = [];
    const rows = await queryInChunks2(left, right, async (a, b) => {
      sizes.push(a.length + b.length);
      return a.map((n) => `${n}:${b[0]}`);
    });
    expect(sizes.length).toBeGreaterThan(1);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(D1_MAX_BOUND_PARAMS);
    expect(rows.length).toBe(left.length * Math.ceil(right.length / Math.floor(D1_MAX_BOUND_PARAMS / 2)));
  });
});
