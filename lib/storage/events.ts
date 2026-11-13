/** "Saved trips changed" signal, e.g. after a cloud sync pulls new trips, so lists can reload. */
const listeners = new Set<() => void>()

export function onTripsChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitTripsChanged(): void {
  listeners.forEach((listener) => listener())
}
