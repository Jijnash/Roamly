/**
 * Every outbound link is built here from a fixed template. The AI never supplies
 * a URL: it only gives names, which are encoded as query parameters. As a second
 * guard, the final URL's host must be on the allowlist.
 */

const ALLOWED_HOSTS = new Set(['www.google.com'])

function allowed(url: URL): string | null {
  return url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname) ? url.toString() : null
}

/** Google Maps search for a place, e.g. "Fort Aguada, Goa". */
export function googleMapsSearchUrl(place: string, area?: string): string | null {
  const query = [place, area].map((s) => s?.trim()).filter(Boolean).join(', ')
  if (!query) return null
  const url = new URL('https://www.google.com/maps/search/')
  url.searchParams.set('api', '1')
  url.searchParams.set('query', query)
  return allowed(url)
}
