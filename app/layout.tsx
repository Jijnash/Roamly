import type { Metadata, Viewport } from 'next'
import { TripProvider } from '@/components/trip-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Roamly — India, at your own pace',
  description: 'Plan thoughtful, personal trips across India with Roamly, your AI travel planner.',
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The theme script adds the `dark` class before React hydrates, so React's markup and the
    // live class differ on purpose; suppressHydrationWarning stops that one expected warning.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Blocking on purpose: it must set the theme before the first paint (see public/theme-boot.js). */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-boot.js" />
      </head>
      <body className="antialiased">
        <TripProvider>{children}</TripProvider>
      </body>
    </html>
  )
}
