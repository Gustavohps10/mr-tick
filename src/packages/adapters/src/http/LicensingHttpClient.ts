import {
  ILicensingApiClient,
  LicensingActivationRequestDTO,
  LicensingApiEnvelopeDTO,
  LicensingDeactivateRequestDTO,
  LicensingPlusDownloadRequestDTO,
  LicensingPlusDownloadResultDTO,
  LicensingRefreshRequestDTO,
} from '@mr-tick/application'
import { offlineAuthorizationClaimsSchema } from '@mr-tick/domain'
import {
  AppError,
  Either,
  FieldErrors,
  isArray,
  isBoolean,
  isNonEmptyString,
  isRecord,
  isString,
} from '@mr-tick/shared/helpers'
import axios from 'axios'
import crypto from 'crypto'

export interface LicensingApiConfiguration {
  readonly baseUrl: string
}

function parseAuthorization(raw: object): LicensingApiEnvelopeDTO | null {
  if (
    !isRecord(raw) ||
    !isNonEmptyString(raw.token) ||
    !isNonEmptyString(raw.payloadBase64Url) ||
    !isNonEmptyString(raw.signatureBase64Url)
  )
    return null
  if (raw.token !== `${raw.payloadBase64Url}.${raw.signatureBase64Url}`)
    return null
  if (!offlineAuthorizationClaimsSchema.safeParse(raw.payload).success)
    return null
  return { signedAuthorization: raw.token }
}

function responseError(
  status: number,
  raw: object,
  fallback: string,
): AppError {
  if (!isRecord(raw)) return AppError.Http(status, fallback)
  let message = fallback
  if (isNonEmptyString(raw.message)) message = raw.message
  if (isNonEmptyString(raw.messageKey)) message = raw.messageKey
  if (isNonEmptyString(raw.code)) message = raw.code
  const details: FieldErrors = {}
  if (isRecord(raw.details)) {
    for (const [field, messages] of Object.entries(raw.details)) {
      if (!isArray(messages)) continue
      const parsed: string[] = []
      for (const entry of messages) if (isString(entry)) parsed.push(entry)
      if (parsed.length > 0) details[field] = parsed
    }
  }
  return AppError.Http(status, message, details)
}

export class LicensingHttpClient implements ILicensingApiClient {
  constructor(
    private readonly licensingApiConfiguration: LicensingApiConfiguration,
  ) {}

  private get baseUrl(): string {
    return this.licensingApiConfiguration.baseUrl.replace(/\/+$/, '')
  }

  async activate(
    input: LicensingActivationRequestDTO,
  ): Promise<Either<AppError, LicensingApiEnvelopeDTO>> {
    try {
      const response = await axios.post<object>(
        `${this.baseUrl}/licensing/activate`,
        input,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 20000,
          validateStatus: () => true,
        },
      )
      if (response.status < 200 || response.status >= 300)
        return Either.failure(
          responseError(
            response.status,
            response.data,
            'FALHA_ATIVACAO_LICENCA',
          ),
        )
      if (!isRecord(response.data) || !isRecord(response.data.authorization))
        return Either.failure(
          AppError.Http(422, 'RESPOSTA_ATIVACAO_LICENCA_INVALIDA'),
        )
      const envelope = parseAuthorization(response.data.authorization)
      if (!envelope)
        return Either.failure(
          AppError.Http(422, 'RESPOSTA_ATIVACAO_LICENCA_INVALIDA'),
        )
      return Either.success(envelope)
    } catch (error) {
      if (axios.isAxiosError(error) && error.response === undefined)
        return Either.failure(AppError.Http(0, error.message))
      return Either.failure(
        AppError.Http(422, 'FALHA_CLIENTE_ATIVACAO_LICENCA'),
      )
    }
  }

  async refresh(
    input: LicensingRefreshRequestDTO,
  ): Promise<Either<AppError, LicensingApiEnvelopeDTO>> {
    try {
      const response = await axios.post<object>(
        `${this.baseUrl}/licensing/refresh`,
        input,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 20000,
          validateStatus: () => true,
        },
      )
      if (response.status < 200 || response.status >= 300)
        return Either.failure(
          responseError(
            response.status,
            response.data,
            'FALHA_RENOVACAO_LICENCA',
          ),
        )
      const envelope = parseAuthorization(response.data)
      if (!envelope)
        return Either.failure(
          AppError.Http(422, 'RESPOSTA_RENOVACAO_LICENCA_INVALIDA'),
        )
      return Either.success(envelope)
    } catch (error) {
      if (axios.isAxiosError(error) && error.response === undefined)
        return Either.failure(AppError.Http(0, error.message))
      return Either.failure(
        AppError.Http(422, 'FALHA_CLIENTE_RENOVACAO_LICENCA'),
      )
    }
  }

  async deactivate(
    input: LicensingDeactivateRequestDTO,
  ): Promise<Either<AppError, void>> {
    try {
      const response = await axios.post<object>(
        `${this.baseUrl}/licensing/deactivate`,
        input,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 20000,
          validateStatus: () => true,
        },
      )
      if (response.status < 200 || response.status >= 300)
        return Either.failure(
          responseError(
            response.status,
            response.data,
            'FALHA_DESATIVACAO_LICENCA',
          ),
        )
      if (!isRecord(response.data) || !isBoolean(response.data.deactivated))
        return Either.failure(
          AppError.Http(422, 'RESPOSTA_DESATIVACAO_LICENCA_INVALIDA'),
        )
      return Either.success()
    } catch (error) {
      if (axios.isAxiosError(error) && error.response === undefined)
        return Either.failure(AppError.Http(0, error.message))
      return Either.failure(
        AppError.Http(422, 'FALHA_CLIENTE_DESATIVACAO_LICENCA'),
      )
    }
  }

  async downloadPlusAddonPackage(
    input: LicensingPlusDownloadRequestDTO,
  ): Promise<Either<AppError, LicensingPlusDownloadResultDTO>> {
    try {
      const url = `${this.baseUrl}/catalog/addons/${encodeURIComponent(input.addonId)}/versions/${encodeURIComponent(input.version)}/download`
      const response = await axios.post<ArrayBuffer>(
        url,
        {
          activationKey: input.activationKey,
          installationId: input.installationId,
        },
        {
          responseType: 'arraybuffer',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/octet-stream',
          },
          timeout: 20000,
          validateStatus: () => true,
        },
      )
      if (response.status < 200 || response.status >= 300) {
        let body: object = {}
        try {
          body = JSON.parse(Buffer.from(response.data).toString('utf8'))
        } catch {
          return Either.failure(
            AppError.Http(
              response.status,
              'FALHA_DOWNLOAD_PACOTE_PLUS_AUTORIZADO',
            ),
          )
        }
        return Either.failure(
          responseError(
            response.status,
            body,
            'FALHA_DOWNLOAD_PACOTE_PLUS_AUTORIZADO',
          ),
        )
      }
      if (!response.data || response.data.byteLength === 0)
        return Either.failure(AppError.NotFound('PACOTE_PLUS_VAZIO'))
      const header = response.headers['x-addon-sha256']
      if (!isNonEmptyString(header) || !/^[a-f0-9]{64}$/.test(header))
        return Either.failure(AppError.Http(422, 'PACOTE_PLUS_HASH_INVALIDO'))
      const bytes = new Uint8Array(response.data)
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== header)
        return Either.failure(AppError.Http(422, 'PACOTE_PLUS_HASH_DIVERGENTE'))
      return Either.success({ bytes, sha256: header })
    } catch (error) {
      if (axios.isAxiosError(error) && error.response === undefined)
        return Either.failure(AppError.Http(0, error.message))
      return Either.failure(
        AppError.Http(422, 'FALHA_CLIENTE_DOWNLOAD_PACOTE_PLUS'),
      )
    }
  }
}
