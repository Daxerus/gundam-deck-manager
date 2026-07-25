import type { Context } from 'hono';

/** Parse a JSON body, returning an empty object on any error. Typed as Partial<T>. */
export async function readJson<T>(c: Context): Promise<Partial<T>> {
  try {
    return (await c.req.json()) as Partial<T>;
  } catch {
    return {};
  }
}
