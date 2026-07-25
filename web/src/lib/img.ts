// Card art on gundam-gcg.com is served with a Cross-Origin-Resource-Policy that
// blocks direct hotlinking from another origin (ERR_BLOCKED_BY_RESPONSE.NotSameSite).
// Route images through the weserv proxy, which adds permissive CORS/CORP headers.
export function proxied(url: string | null | undefined, width = 400): string | null {
  if (!url) return null;
  const noProto = url.replace(/^https?:\/\//, '');
  return `https://images.weserv.nl/?url=${encodeURIComponent(noProto)}&w=${width}&output=webp`;
}
