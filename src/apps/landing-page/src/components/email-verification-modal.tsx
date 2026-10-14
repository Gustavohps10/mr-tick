'use client'

import { Button } from '@mr-tick/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@mr-tick/ui/dialog'
import { Input } from '@mr-tick/ui/input'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as React from 'react'

import {
  sendEmailVerificationCode,
  verifyEmailVerificationCode,
} from '@/lib/billing'

export interface EmailVerificationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onVerified: (
    email: string,
    token: string,
  ) => Promise<{ ok: boolean; error?: string } | void>
}

export function EmailVerificationModal({
  open,
  onOpenChange,
  onVerified,
}: EmailVerificationModalProps) {
  const t = useTranslations('pricing.verifyModal')
  const [step, setStep] = React.useState<'email' | 'code'>('email')
  const [email, setEmail] = React.useState('')
  const [code, setCode] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setStep('email')
      setEmail('')
      setCode('')
      setError(null)
      setLoading(false)
    }
  }, [open])

  const validateEmailFormat = (val: string): boolean => {
    const trimmed = val.trim()
    if (!trimmed.includes('@') || !trimmed.includes('.')) return false
    return trimmed.length >= 5
  }

  const handleSendCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setError(null)
    const trimmedEmail = email.trim().toLowerCase()
    if (!validateEmailFormat(trimmedEmail)) {
      setError(t('invalidEmail'))
      return
    }

    setLoading(true)
    const result = await sendEmailVerificationCode(trimmedEmail)
    setLoading(false)

    if (!result.ok) {
      if (result.error === 'RATE_LIMIT_EXCEEDED') {
        setError(t('rateLimit'))
        return
      }
      setError(t('genericError'))
      return
    }

    setStep('code')
  }

  const handleVerifyCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setError(null)
    const trimmedCode = code.trim()
    if (trimmedCode.length !== 6) {
      setError(t('invalidCode'))
      return
    }

    setLoading(true)
    const trimmedEmail = email.trim().toLowerCase()
    const result = await verifyEmailVerificationCode(trimmedEmail, trimmedCode)

    if (!result.ok || !result.verificationToken) {
      setLoading(false)
      if (
        result.error === 'MAX_ATTEMPTS_EXCEEDED' ||
        result.error === 'RATE_LIMIT_EXCEEDED'
      ) {
        setError(t('rateLimit'))
        return
      }
      setError(t('invalidCode'))
      return
    }

    const outcome = await onVerified(trimmedEmail, result.verificationToken)
    setLoading(false)
    if (outcome && !outcome.ok) {
      if (outcome.error === 'ACTIVE_LICENSE_ALREADY_EXISTS') {
        setError(t('alreadySubscribedError'))
        return
      }
      setError(t('genericError'))
      return
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="bg-primary/10 text-primary mx-auto mb-2 flex size-12 items-center justify-center rounded-full">
            <ShieldCheck className="size-6" />
          </div>
          <DialogTitle className="text-center text-xl font-bold">
            {t('title')}
          </DialogTitle>
          <DialogDescription className="text-center text-xs leading-relaxed">
            {t('description')}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 rounded-md border p-3 text-xs">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === 'email' && (
          <form onSubmit={handleSendCode} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label
                htmlFor="checkout-email-input"
                className="text-foreground text-xs font-semibold"
              >
                {t('emailLabel')}
              </label>
              <div className="relative">
                <Mail className="text-muted-foreground absolute top-2.5 left-3 size-4" />
                <Input
                  id="checkout-email-input"
                  type="email"
                  autoFocus
                  required
                  placeholder={t('emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 text-sm"
                  disabled={loading}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full text-xs font-semibold"
            >
              {loading && <Loader2 className="mr-2 size-3.5 animate-spin" />}
              {loading ? t('sending') : t('sendCode')}
              {!loading && <ArrowRight className="ml-1.5 size-3.5" />}
            </Button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={handleVerifyCode} className="space-y-4 pt-2">
            <div className="border-border/60 bg-muted/30 text-muted-foreground rounded-md border p-2.5 text-center text-xs">
              {t('codeHelp', { email: email.trim().toLowerCase() })}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="checkout-code-input"
                className="text-foreground text-xs font-semibold"
              >
                {t('codeLabel')}
              </label>
              <Input
                id="checkout-code-input"
                type="text"
                autoFocus
                inputMode="numeric"
                maxLength={6}
                placeholder={t('codePlaceholder')}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="text-center font-mono text-lg tracking-widest"
                disabled={loading}
              />
            </div>

            <Button
              type="submit"
              disabled={loading || code.trim().length !== 6}
              className="w-full text-xs font-semibold"
            >
              {loading && <Loader2 className="mr-2 size-3.5 animate-spin" />}
              {loading ? t('verifying') : t('verifyAndProceed')}
              {!loading && <CheckCircle2 className="ml-1.5 size-3.5" />}
            </Button>

            <div className="flex items-center justify-between pt-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setStep('email')
                }}
                disabled={loading}
                className="text-muted-foreground hover:text-foreground underline-offset-4 transition-colors hover:underline"
              >
                ← {t('changeEmail')}
              </button>

              <button
                type="button"
                onClick={() => void handleSendCode()}
                disabled={loading}
                className="text-primary inline-flex items-center gap-1 underline-offset-4 transition-colors hover:underline"
              >
                <RefreshCw className="size-3" />
                {t('resendCode')}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
