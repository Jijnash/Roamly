// Applies the saved light/dark theme before the page paints (loaded from <head> in app/layout.tsx).
// Must stay a tiny blocking script; the key must match THEME_KEY in hooks/useTheme.ts.
try {
  var saved = localStorage.getItem('roamly:theme')
  var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.classList.toggle('dark', dark)
} catch (e) {
  // storage blocked: fall back to the light theme
}
