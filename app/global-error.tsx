'use client'

/**
 * Last-resort fallback when the root layout itself fails. It replaces the whole
 * document, so it brings its own <html>/<body> and inline styles (global CSS isn't loaded here).
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0, padding: 16, textAlign: 'center' }}>
        <title>Roamly — something went wrong</title>
        <div>
          <h1 style={{ fontSize: 20 }}>Roamly hit an unexpected error</h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>Reload to continue. If it keeps happening, start a new trip.</p>
          <button onClick={() => retry()} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, border: 0, background: '#0F766E', color: 'white', fontSize: 14 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
