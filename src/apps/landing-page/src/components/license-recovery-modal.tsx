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
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  RotateCcw,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as React from 'react'

import {
  type RecoveredLicenseItem,
  recoverLicensesApi,
  rotateLicenseKeyApi,
  sendEmailVerificationCode,
  verifyEmailVerificationCode,
} from '@/lib/billing'

export interface LicenseRecoveryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LicenseRecoveryModal({
  open,
  onOpenChange,
}: LicenseRecoveryModalProps) {
  const t = useTranslations('pricing.recoverModal')
  const [step, setStep] = React.useState<'email' | 'code' | 'results'>('email')
  const [email, setEmail] = React.useState('')
  const [code, setCode] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [licenses, setLicenses] = React.useState<RecoveredLicenseItem[]>([])
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null)
  const [verificationToken, setVerificationToken] = React.useState<
    string | null
  >(null)
  const [rotatingLicenseId, setRotatingLicenseId] = React.useState<
    string | null
  >(null)
  const [confirmRotateLicenseId, setConfirmRotateLicenseId] = React.useState<
    string | null
  >(null)
  const [rotationSuccess, setRotationSuccess] = React.useState<string | null>(
    null,
  )

  React.useEffect(() => {
    if (!open) {
      setStep('email')
      setEmail('')
      setCode('')
      setError(null)
      setLoading(false)
      setLicenses([])
      setCopiedKey(null)
      setVerificationToken(null)
      setRotatingLicenseId(null)
      setConfirmRotateLicenseId(null)
      setRotationSuccess(null)
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
      setError(t('emailPlaceholder'))
      return
    }

    setLoading(true)
    const result = await sendEmailVerificationCode(trimmedEmail)
    setLoading(false)

    if (!result.ok) {
      setError(result.error || 'Ocorreu um erro ao enviar o código')
      return
    }

    setStep('code')
  }

  const handleVerifyAndRecover = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setError(null)
    const trimmedCode = code.trim()
    if (trimmedCode.length !== 6) {
      return
    }

    setLoading(true)
    const trimmedEmail = email.trim().toLowerCase()
    const verifyResult = await verifyEmailVerificationCode(
      trimmedEmail,
      trimmedCode,
    )

    if (!verifyResult.ok || !verifyResult.verificationToken) {
      setLoading(false)
      setError('Código inválido ou expirado.')
      return
    }

    const token = verifyResult.verificationToken
    setVerificationToken(token)

    const recoveryResult = await recoverLicensesApi(trimmedEmail, token)
    setLoading(false)

    if (!recoveryResult.ok || !recoveryResult.data) {
      setError('Não foi possível recuperar as licenças no momento.')
      return
    }

    setLicenses(recoveryResult.data.licenses)
    setStep('results')
  }

  const handleRotateKey = async (licenseId: string) => {
    if (!verificationToken) {
      setError('Sessão expirada. Por favor, valide seu e-mail novamente.')
      return
    }

    setError(null)
    setRotationSuccess(null)
    setRotatingLicenseId(licenseId)

    const trimmedEmail = email.trim().toLowerCase()
    const result = await rotateLicenseKeyApi(
      trimmedEmail,
      licenseId,
      verificationToken,
    )
    setRotatingLicenseId(null)
    setConfirmRotateLicenseId(null)

    if (!result.ok || !result.data) {
      setError(
        'Não foi possível rotacionar a chave de ativação. Tente novamente.',
      )
      return
    }

    const rotatedData = result.data
    setLicenses((prev) =>
      prev.map((lic) => {
        if (lic.id === licenseId) {
          return {
            ...lic,
            activationKey: rotatedData.newActivationKey,
          }
        }
        return lic
      }),
    )
    setRotationSuccess(t('rotateSuccess'))
  }

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key)
    setCopiedKey(key)
    setTimeout(() => {
      setCopiedKey(null)
    }, 2500)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="bg-primary/10 text-primary mx-auto mb-2 flex size-12 items-center justify-center rounded-full">
            <KeyRound className="size-6" />
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
                htmlFor="recovery-email-input"
                className="text-foreground text-xs font-semibold"
              >
                {t('emailLabel')}
              </label>
              <div className="relative">
                <Mail className="text-muted-foreground absolute top-2.5 left-3 size-4" />
                <Input
                  id="recovery-email-input"
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
          <form onSubmit={handleVerifyAndRecover} className="space-y-4 pt-2">
            <div className="border-border/60 bg-muted/30 text-muted-foreground rounded-md border p-2.5 text-center text-xs">
              {email.trim().toLowerCase()}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="recovery-code-input"
                className="text-foreground text-xs font-semibold"
              >
                {t('codeLabel')}
              </label>
              <Input
                id="recovery-code-input"
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
              {loading ? t('recovering') : t('verifyAndRecover')}
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
                ← Voltar
              </button>

              <button
                type="button"
                onClick={() => void handleSendCode()}
                disabled={loading}
                className="text-primary inline-flex items-center gap-1 underline-offset-4 transition-colors hover:underline"
              >
                <RefreshCw className="size-3" />
                Reenviar
              </button>
            </div>
          </form>
        )}

        {step === 'results' && (
          <div className="space-y-4 pt-2">
            {licenses.length === 0 ? (
              <div className="border-border/60 bg-muted/20 text-muted-foreground rounded-md border p-4 text-center text-xs leading-relaxed">
                {t('noLicensesFound')}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-center text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <p className="font-semibold">{t('successTitle')}</p>
                  <p className="mt-0.5 text-[11px] opacity-90">
                    {t('successSubtitle')}
                  </p>
                </div>

                {rotationSuccess && (
                  <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-4 shrink-0" />
                    <span>{rotationSuccess}</span>
                  </div>
                )}

                <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
                  {licenses.map((lic) => (
                    <div
                      key={lic.id}
                      className="border-border/80 bg-card space-y-2.5 rounded-lg border p-3.5 shadow-xs"
                    >
                      <div className="text-muted-foreground flex items-center justify-between text-[11px] font-medium">
                        <span className="text-foreground font-semibold tracking-wide uppercase">
                          {lic.tier}
                        </span>
                        <span>
                          {t('devicesCount', { max: lic.maxDevices })}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="border-border/60 bg-muted/50 text-foreground min-w-0 flex-1 truncate rounded border px-2.5 py-1 font-mono text-xs select-all">
                          {lic.activationKey}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyKey(lic.activationKey)}
                          className="h-7 shrink-0 px-2 text-xs"
                        >
                          {copiedKey === lic.activationKey ? (
                            <Check className="size-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                          <span className="ml-1">
                            {copiedKey === lic.activationKey
                              ? t('copied')
                              : t('copyKey')}
                          </span>
                        </Button>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <a
                          href={`mistertick://activate?key=${encodeURIComponent(lic.activationKey)}`}
                          className="text-primary inline-flex items-center gap-1 text-[11px] font-semibold hover:underline"
                        >
                          <ExternalLink className="size-3" />
                          {t('activateInApp')}
                        </a>

                        {confirmRotateLicenseId !== lic.id ? (
                          <button
                            type="button"
                            onClick={() => {
                              setError(null)
                              setRotationSuccess(null)
                              setConfirmRotateLicenseId(lic.id)
                            }}
                            className="text-destructive/80 hover:text-destructive inline-flex items-center gap-1 text-[11px] transition-colors hover:underline"
                          >
                            <RotateCcw className="size-3" />
                            {t('rotateKey')}
                          </button>
                        ) : (
                          <div className="border-destructive/40 bg-destructive/5 mt-2 w-full space-y-2 rounded-md border p-2.5 text-left text-xs">
                            <div className="text-destructive flex items-start gap-1.5 text-[11px] font-semibold">
                              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                              <span>{t('rotateConfirmTitle')}</span>
                            </div>
                            <p className="text-muted-foreground text-[11px] leading-relaxed">
                              {t('rotateConfirmDesc')}
                            </p>
                            <div className="flex items-center justify-end gap-2 pt-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setConfirmRotateLicenseId(null)}
                                className="h-6 px-2 text-[11px]"
                              >
                                Cancelar
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                disabled={rotatingLicenseId === lic.id}
                                onClick={() => void handleRotateKey(lic.id)}
                                className="h-6 px-2 text-[11px]"
                              >
                                {rotatingLicenseId === lic.id ? (
                                  <Loader2 className="mr-1 size-3 animate-spin" />
                                ) : (
                                  <RotateCcw className="mr-1 size-3" />
                                )}
                                {rotatingLicenseId === lic.id
                                  ? t('rotating')
                                  : 'Confirmar Rotação'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full text-xs font-semibold"
            >
              {t('close')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
