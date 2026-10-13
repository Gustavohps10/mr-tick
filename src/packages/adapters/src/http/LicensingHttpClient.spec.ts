import { LicensingActivationRequestDTO } from '@mr-tick/application'
import axios, { AxiosError, AxiosHeaders } from 'axios'
import crypto from 'crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LicensingHttpClient } from './LicensingHttpClient'

const claims = {
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
const payloadBase64Url = Buffer.from(JSON.stringify(claims)).toString(
  'base64url',
)
const signatureBase64Url = crypto.randomBytes(64).toString('base64url')
const authorization = {
  payload: claims,
  payloadBase64Url,
  signatureBase64Url,
  token: `${payloadBase64Url}.${signatureBase64Url}`,
}
const input: LicensingActivationRequestDTO = {
  activationKey: 'mrtick_live_caseSensitive',
  installationId: 'installation-one',
  deviceLabel: 'Desktop',
}

function response(data: object, status = 200) {
  return {
    status,
    statusText: 'OK',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  }
}

describe('LicensingHttpClient contrato real do Worker', () => {
  afterEach(() => vi.restoreAllMocks())
  it('ativa em /licensing com chave case-sensitive e extrai authorization.token', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue(
        response({ authorization, replacedInstallationId: null }),
      )
    const client = new LicensingHttpClient({
      baseUrl: 'https://api.mistertick.test/',
    })
    const result = await client.activate(input)
    expect(result.isSuccess()).toBe(true)
    expect(post).toHaveBeenCalledWith(
      'https://api.mistertick.test/licensing/activate',
      input,
      expect.any(Object),
    )
    expect(result.success.signedAuthorization).toBe(authorization.token)
  })
  it('refresh usa resposta direta e desativação false é sucesso idempotente', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValueOnce(response(authorization))
      .mockResolvedValueOnce(response({ deactivated: false }))
    const client = new LicensingHttpClient({
      baseUrl: 'https://api.mistertick.test',
    })
    const body = {
      activationKey: input.activationKey,
      installationId: input.installationId,
    }
    expect((await client.refresh(body)).success.signedAuthorization).toBe(
      authorization.token,
    )
    expect((await client.deactivate(body)).isSuccess()).toBe(true)
    expect(post).toHaveBeenNthCalledWith(
      1,
      'https://api.mistertick.test/licensing/refresh',
      body,
      expect.any(Object),
    )
    expect(post).toHaveBeenNthCalledWith(
      2,
      'https://api.mistertick.test/licensing/deactivate',
      body,
      expect.any(Object),
    )
  })
  it('preserva code e status do servidor; resposta inválida 200 não vira erro transient 5xx', async () => {
    vi.spyOn(axios, 'post')
      .mockResolvedValueOnce(response({ code: 'LICENSE_REVOKED' }, 403))
      .mockResolvedValueOnce(response({ token: 'malformed' }))
    const client = new LicensingHttpClient({
      baseUrl: 'https://api.mistertick.test',
    })
    const revoked = await client.refresh(input)
    expect(revoked.failure.statusCode).toBe(403)
    expect(revoked.failure.messageKey).toBe('LICENSE_REVOKED')
    const invalid = await client.refresh(input)
    expect(invalid.failure.statusCode).toBe(422)
  })
  it('marca falha de transporte separadamente e preserva mensagem original', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(
      new AxiosError('Connection unavailable', AxiosError.ERR_NETWORK),
    )
    const client = new LicensingHttpClient({
      baseUrl: 'https://api.mistertick.test',
    })
    const failed = await client.refresh(input)
    expect(failed.failure.statusCode).toBe(0)
    expect(failed.failure.messageKey).toBe('Connection unavailable')
  })
  it('download usa rota/bodies reais e verifica bytes contra o hash do Worker', async () => {
    const bytes = Uint8Array.from([80, 75, 3, 4])
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      ...response(bytes),
      headers: { 'x-addon-sha256': sha256 },
    })
    const client = new LicensingHttpClient({
      baseUrl: 'https://api.mistertick.test',
    })
    const downloaded = await client.downloadPlusAddonPackage({
      ...input,
      addonId: 'org/jira',
      version: '1.0.0',
    })
    expect(downloaded.success.bytes).toEqual(bytes)
    expect(downloaded.success.sha256).toBe(sha256)
    expect(post).toHaveBeenCalledWith(
      'https://api.mistertick.test/catalog/addons/org%2Fjira/versions/1.0.0/download',
      {
        activationKey: input.activationKey,
        installationId: input.installationId,
      },
      expect.any(Object),
    )
  })
})
