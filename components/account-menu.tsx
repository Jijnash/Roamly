'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Cloud, CloudOff, LoaderCircle, LogOut, MailCheck, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { sendSignInLink, signOut, syncNow, useCloud } from '@/hooks/useCloud'
import { useOnline } from '@/hooks/useOnline'
import { tripStore } from '@/lib/storage/appStore'

/**
 * Header control for optional cloud sync. Renders nothing when Supabase isn't
 * configured, so the app looks and works the same with no keys.
 */
export function AccountMenu() {
  const cloud = useCloud()
  const [signingIn, setSigningIn] = useState(false)
  if (!cloud.configured || !cloud.ready) return null

  if (!cloud.email) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setSigningIn(true)}>
          <Cloud data-icon="inline-start" aria-hidden="true" /><span className="hidden sm:inline">Sign in to sync</span><span className="sm:hidden">Sync</span>
        </Button>
        {signingIn && <SignInDialog onClose={() => setSigningIn(false)} />}
      </>
    )
  }
  return <SignedInMenu email={cloud.email} />
}

function SignedInMenu({ email }: { email: string }) {
  const cloud = useCloud()
  const online = useOnline()
  const pending = tripStore().pendingCount()
  const last = cloud.lastSync
  const status = cloud.syncing
    ? 'Syncing…'
    : cloud.syncError ?? (pending > 0 ? `${pending} change${pending > 1 ? 's' : ''} waiting to sync` : last ? `Synced at ${new Date(last.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Signed in')

  return (
    <details className="relative">
      <summary aria-label={`Account: ${email}`} className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        {cloud.syncing ? <LoaderCircle size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : pending > 0 || cloud.syncError ? <CloudOff size={17} aria-hidden="true" /> : <Cloud size={17} className="text-primary" aria-hidden="true" />}
      </summary>
      <div className="absolute right-0 top-11 z-50 w-64 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg">
        <p className="truncate text-sm font-medium">{email}</p>
        <p role="status" className="mt-0.5 text-xs text-muted-foreground">{status}</p>
        <div className="mt-3 flex flex-col gap-1">
          <Button variant="ghost" size="sm" className="justify-start" disabled={cloud.syncing || !online} onClick={() => void syncNow()}><RefreshCw data-icon="inline-start" aria-hidden="true" />Sync now</Button>
          <Button variant="ghost" size="sm" className="justify-start" onClick={() => void signOut()}><LogOut data-icon="inline-start" aria-hidden="true" />Sign out</Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Signing out keeps your trips on this device.</p>
      </div>
    </details>
  )
}

function SignInDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const online = useOnline()
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState<{ status: 'idle' | 'sending' | 'sent' } | { status: 'error'; message: string }>({ status: 'idle' })

  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setPhase({ status: 'sending' })
    const error = await sendSignInLink(email.trim())
    setPhase(error ? { status: 'error', message: error } : { status: 'sent' })
  }

  return (
    <dialog ref={ref} aria-labelledby="signin-title" onCancel={(e) => { e.preventDefault(); onClose() }} className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id="signin-title" className="text-lg font-semibold">Sync your trips</h2>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}><X aria-hidden="true" /></Button>
        </div>
        {phase.status === 'sent' ? (
          <div role="status" className="mt-3 flex gap-3 text-sm">
            <MailCheck className="mt-0.5 shrink-0 text-primary" size={20} aria-hidden="true" />
            <p>Check <strong>{email}</strong> for a sign-in link. Open it in this browser and your trips will start syncing.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-2 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">We&apos;ll email you a sign-in link. No password. Your trips then sync across your devices.</p>
            <label className="text-sm font-medium">Email
              <input type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </label>
            {phase.status === 'error' && <p role="alert" className="text-sm text-destructive">{phase.message}</p>}
            {!online && <p className="text-xs text-muted-foreground">You&apos;re offline. Connect to get a sign-in link.</p>}
            <Button type="submit" disabled={phase.status === 'sending' || !online}>{phase.status === 'sending' ? 'Sending…' : 'Email me a link'}</Button>
          </form>
        )}
      </div>
    </dialog>
  )
}
