'use client'

import { useSyncExternalStore } from 'react'

/**
 * Light/dark theme. The choice is saved in localStorage and applied as a `dark`
 * class on <html>. public/theme-boot.js (loaded in <head>) applies it before the
 * first paint, so there is no flash of the wrong theme. With no saved choice, the
 * operating system's preference is used.
 */

export const THEME_KEY = 'roamly:theme'
const listeners = new Set<() => void>()

function isDark(): boolean {
  return document.documentElement.classList.contains('dark')
}

export function setDark(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  try {
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
  } catch {
    // storage blocked (private mode): the theme still applies for this page view
  }
  listeners.forEach((notify) => notify())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDarkTheme(): boolean {
  return useSyncExternalStore(subscribe, isDark, () => false)
}

