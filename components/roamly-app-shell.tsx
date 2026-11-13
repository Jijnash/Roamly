'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Compass, FlaskConical, Map, Moon, Sun, WifiOff, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { OfflineBanner } from '@/components/roamly-ui'
import { useOnline } from '@/hooks/useOnline'
import { setDark, useDarkTheme } from '@/hooks/useTheme'
import { AccountMenu } from '@/components/account-menu'

const navigation: { label: string; href: string; icon: LucideIcon }[] = [
  { label: 'Plan', href: '/', icon: Compass },
  { label: 'Trips', href: '/trips', icon: Map },
  { label: 'Lab', href: '/lab', icon: FlaskConical },
]

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}

/** Page frame: header, sidebar (desktop), bottom nav (phone), offline banner. */
export function RoamlyAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const online = useOnline()
  const dark = useDarkTheme()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#main" className="sr-only z-50 rounded-lg bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Roamly home" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Compass aria-hidden="true" size={20} /></span>
            <span className="text-xl font-bold tracking-tight">roamly<span className="text-primary">.</span></span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            {!online && <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2.5 py-1 text-xs font-medium"><WifiOff size={13} aria-hidden="true" /> Offline</span>}
            <Button variant="outline" size="icon" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setDark(!dark)}>
              {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            </Button>
            <AccountMenu />
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1600px]">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-56 shrink-0 flex-col border-r bg-card/60 px-4 py-6 lg:flex" aria-label="Main navigation">
          <nav className="flex flex-col gap-1">
            {navigation.map(({ label, href, icon: Icon }) => {
              const active = isActive(pathname, href)
              return <Link key={label} href={href} aria-current={active ? 'page' : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><Icon size={18} aria-hidden="true" />{label}</Link>
            })}
          </nav>
        </aside>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 pb-24 outline-none lg:pb-8">
          {!online && <div className="mx-auto max-w-[1500px] px-4 pt-4 sm:px-6 lg:px-8"><OfflineBanner /></div>}
          {children}
        </main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t bg-background/95 px-1 pb-[max(env(safe-area-inset-bottom),6px)] pt-2 backdrop-blur-xl lg:hidden" aria-label="Main navigation">
        {navigation.map(({ label, href, icon: Icon }) => {
          const active = isActive(pathname, href)
          return <Link key={label} href={href} aria-current={active ? 'page' : undefined} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}><Icon size={19} aria-hidden="true" />{label}</Link>
        })}
      </nav>
    </div>
  )
}
