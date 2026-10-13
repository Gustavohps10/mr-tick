import { OfflineAuthorizationClaims } from '@mr-tick/domain'
import crypto from 'crypto'
import { describe, expect, it } from 'vitest'

import { Ed25519OfflineAuthorizationVerifier } from './Ed25519OfflineAuthorizationVerifier'

const publicKeyJwk: { kty: 'OKP'; crv: 'Ed25519'; x: string } = {
  kty: 'OKP',
  crv: 'Ed25519',
  x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
}
const privateKeyJwk = {
  ...publicKeyJwk,
  d: 'nWGxne_9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A',
}
const verifier = new Ed25519OfflineAuthorizationVerifier({
  publicKeys: [{ keyId: 'lic-test', publicKeyJwk }],
})
const claims: OfflineAuthorizationClaims = {
  formatVersion: 1,
  keyId: 'lic-test',
  licenseId: 'lic-one',
  installationId: 'installation-one',
  plan: 'plus',
  status: 'active',
  issuedAt: 1790000000000,
  paidThrough: 1792000000000,
  offlineThrough: 1790604800000,
}

async function signLikeApi(payload: object): Promise<string> {
  const key = await crypto.webcrypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    { name: 'Ed25519' },
    false,
    ['sign'],
  )
  const payloadSegment = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  )
  const signature = await crypto.webcrypto.subtle.sign(
    { name: 'Ed25519' },
    key,
    new TextEncoder().encode(payloadSegment),
  )
  return `${payloadSegment}.${Buffer.from(signature).toString('base64url')}`
}

describe('Ed25519OfflineAuthorizationVerifier contrato do Worker', () => {
  it('aceita token de dois segmentos assinado via WebCrypto igual ao signer da API', async () => {
    const token = await signLikeApi(claims)
    expect((await verifier.verify(token)).success).toEqual(claims)
  })
  it('rejeita adulteração do payload e assinatura válida de outra chave', async () => {
    const token = await signLikeApi(claims)
    const [payload, signature] = token.split('.')
    const changedPayload = Buffer.from(
      JSON.stringify({ ...claims, licenseId: 'copied-license' }),
    ).toString('base64url')
    expect(
      (await verifier.verify(`${changedPayload}.${signature}`)).isFailure(),
    ).toBe(true)
    const differentKey = crypto.generateKeyPairSync('ed25519')
    const forged = crypto
      .sign(null, Buffer.from(String(payload)), differentKey.privateKey)
      .toString('base64url')
    expect((await verifier.verify(`${payload}.${forged}`)).isFailure()).toBe(
      true,
    )
  })
  it('rejeita prefixo legado mrt1, keyId desconhecido e payload sem contrato', async () => {
    const token = await signLikeApi(claims)
    expect((await verifier.verify(`mrt1.${token}`)).isFailure()).toBe(true)
    expect(
      (
        await verifier.verify(
          await signLikeApi({ ...claims, keyId: 'untrusted-key' }),
        )
      ).isFailure(),
    ).toBe(true)
    expect(
      (
        await verifier.verify(await signLikeApi({ ...claims, plan: 'free' }))
      ).isFailure(),
    ).toBe(true)
    expect((await verifier.verify('invalid-token')).isFailure()).toBe(true)
  })
})
