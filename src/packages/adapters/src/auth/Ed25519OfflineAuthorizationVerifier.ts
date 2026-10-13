import { IOfflineAuthorizationVerifier } from '@mr-tick/application'
import {
  OfflineAuthorizationClaims,
  offlineAuthorizationClaimsSchema,
} from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'
import crypto from 'crypto'

export interface OfflineAuthorizationPublicKey {
  readonly keyId: string
  readonly publicKeyJwk: {
    readonly kty: 'OKP'
    readonly crv: 'Ed25519'
    readonly x: string
  }
}

export interface OfflineAuthorizationVerificationConfiguration {
  readonly publicKeys: readonly OfflineAuthorizationPublicKey[]
}

export class Ed25519OfflineAuthorizationVerifier implements IOfflineAuthorizationVerifier {
  constructor(
    private readonly offlineAuthorizationVerificationConfiguration: OfflineAuthorizationVerificationConfiguration,
  ) {}

  async verify(
    token: string,
  ): Promise<Either<AppError, OfflineAuthorizationClaims>> {
    if (token.length > 16384)
      return Either.failure(
        AppError.Unauthorized('ASSINATURA_LICENCA_FORMATO_INVALIDO'),
      )
    const segments = token.trim().split('.')
    const [payloadSegment, signatureSegment] = segments
    if (
      segments.length !== 2 ||
      !payloadSegment ||
      !signatureSegment ||
      !/^[A-Za-z0-9_-]+$/.test(payloadSegment) ||
      !/^[A-Za-z0-9_-]+$/.test(signatureSegment)
    )
      return Either.failure(
        AppError.Unauthorized('ASSINATURA_LICENCA_FORMATO_INVALIDO'),
      )
    try {
      const payloadBytes = Buffer.from(payloadSegment, 'base64url')
      const signatureBytes = Buffer.from(signatureSegment, 'base64url')
      if (
        payloadBytes.toString('base64url') !== payloadSegment ||
        signatureBytes.toString('base64url') !== signatureSegment ||
        signatureBytes.byteLength !== 64
      )
        return Either.failure(
          AppError.Unauthorized('ASSINATURA_LICENCA_FORMATO_INVALIDO'),
        )
      const parsed = offlineAuthorizationClaimsSchema.safeParse(
        JSON.parse(payloadBytes.toString('utf8')),
      )
      if (!parsed.success)
        return Either.failure(AppError.Unauthorized('CLAIMS_LICENCA_INVALIDOS'))
      const trustedKey =
        this.offlineAuthorizationVerificationConfiguration.publicKeys.find(
          (key) => key.keyId === parsed.data.keyId,
        )
      if (!trustedKey)
        return Either.failure(
          AppError.Unauthorized('CHAVE_ASSINATURA_LICENCA_DESCONHECIDA'),
        )
      const publicKey = crypto.createPublicKey({
        key: trustedKey.publicKeyJwk,
        format: 'jwk',
      })
      if (
        !crypto.verify(
          null,
          Buffer.from(payloadSegment, 'utf8'),
          publicKey,
          signatureBytes,
        )
      )
        return Either.failure(
          AppError.Unauthorized('ASSINATURA_LICENCA_INVALIDA'),
        )
      return Either.success(parsed.data)
    } catch {
      return Either.failure(
        AppError.Unauthorized('FALHA_VERIFICACAO_OFFLINE_LICENCA'),
      )
    }
  }
}
