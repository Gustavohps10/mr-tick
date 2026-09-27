import type { AddonSettingsTab } from '@mr-tick/application'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetConnectionSchema = vi.fn()

vi.mock('@/hooks/use-host-bridge', () => ({
  useHostBridge: () => ({
    addons: {
      getConnectionSchema: mockGetConnectionSchema,
      executeAction: vi.fn(),
      getDirectoryPath: vi.fn(),
    },
    events: { on: () => () => {}, emit: vi.fn() },
  }),
}))

import {
  DataSourceInstanceFormData,
  NewDataSourceInstanceForm,
} from '@/components/new-datasource-instance-form'

const mockSampleSchema: AddonSettingsTab[] = [
  {
    id: 'credentials',
    label: 'Credenciais de Acesso',
    groups: [
      {
        id: 'auth_group',
        label: 'Autenticação do Servidor',
        fields: [
          {
            id: 'serverUrl',
            type: 'text',
            label: 'URL do Servidor',
            placeholder: 'https://exemplo.local',
            defaultValue: 'https://padrao.local',
          },
          {
            id: 'apiKey',
            type: 'password',
            label: 'Chave de API',
            placeholder: 'sua-chave',
            defaultValue: 'secret-token-123',
          },
        ],
      },
    ],
  },
  {
    id: 'configuration',
    label: 'Parâmetros Avançados',
    groups: [
      {
        id: 'params_group',
        label: 'Opções de Sincronização',
        fields: [
          {
            id: 'syncInterval',
            type: 'number',
            label: 'Intervalo de Sync (Minutos)',
            defaultValue: 10,
          },
          {
            id: 'enableAutoPush',
            type: 'boolean',
            label: 'Habilitar Push Automático',
            defaultValue: true,
          },
          {
            id: 'taskFilter',
            type: 'select',
            label: 'Filtro de Tarefas',
            defaultValue: 'assigned_to_me',
            options: [
              { label: 'Atribuídas a mim', value: 'assigned_to_me' },
              { label: 'Todas as tarefas', value: 'all_tasks' },
            ],
          },
        ],
      },
    ],
  },
]

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
}

describe('Unit - NewDataSourceInstanceForm e AddonFieldRenderer (SDK Schema Dinâmico)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deve carregar o schema dinâmico e renderizar os grupos e labels definidos pelo addon', async () => {
    mockGetConnectionSchema.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: mockSampleSchema,
    })

    const handleSubmit = vi.fn()

    renderWithClient(
      <NewDataSourceInstanceForm
        pluginId="custom-datasource-addon"
        connectionInstanceId="conn-instance-test-1"
        onSubmit={handleSubmit}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Autenticação do Servidor')).toBeTruthy()
      expect(screen.getByText('Opções de Sincronização')).toBeTruthy()
    })

    expect(screen.getByText('URL do Servidor')).toBeTruthy()
    expect(screen.getByText('Chave de API')).toBeTruthy()
    expect(screen.getByText('Intervalo de Sync (Minutos)')).toBeTruthy()
    expect(screen.getByText('Habilitar Push Automático')).toBeTruthy()
    expect(screen.getByText('Filtro de Tarefas')).toBeTruthy()
  })

  it('deve inicializar automaticamente os campos com os defaultValues do schema', async () => {
    mockGetConnectionSchema.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: mockSampleSchema,
    })

    const handleSubmit = vi.fn()

    renderWithClient(
      <NewDataSourceInstanceForm
        pluginId="custom-datasource-addon"
        connectionInstanceId="conn-instance-test-2"
        onSubmit={handleSubmit}
      />,
    )

    await waitFor(() => {
      const serverUrlInput = screen.getByTestId('addon-field-input-serverUrl')
      if (serverUrlInput instanceof HTMLInputElement) {
        expect(serverUrlInput.value).toBe('https://padrao.local')
      }
    })

    const apiKeyInput = screen.getByTestId('addon-field-input-apiKey')
    if (apiKeyInput instanceof HTMLInputElement) {
      expect(apiKeyInput.value).toBe('secret-token-123')
      expect(apiKeyInput.type).toBe('password')
    }

    const syncIntervalInput = screen.getByTestId(
      'addon-field-input-syncInterval',
    )
    if (syncIntervalInput instanceof HTMLInputElement) {
      expect(Number(syncIntervalInput.value)).toBe(10)
      expect(syncIntervalInput.type).toBe('number')
    }

    const autoPushSwitch = screen.getByTestId(
      'addon-field-input-enableAutoPush',
    )
    expect(autoPushSwitch).toBeTruthy()
  })

  it('deve submeter o formulário separando estritamente credenciais e configurações no payload', async () => {
    mockGetConnectionSchema.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: mockSampleSchema,
    })

    let capturedData: DataSourceInstanceFormData | null = null
    const handleSubmit = vi.fn((data: DataSourceInstanceFormData) => {
      capturedData = data
    })

    renderWithClient(
      <NewDataSourceInstanceForm
        pluginId="custom-datasource-addon"
        connectionInstanceId="conn-instance-test-3"
        onSubmit={handleSubmit}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('addon-field-input-serverUrl')).toBeTruthy()
    })

    // Altera valores no formulário
    const serverUrlInput = screen.getByTestId('addon-field-input-serverUrl')
    fireEvent.change(serverUrlInput, {
      target: { value: 'https://producao.empresa.com' },
    })

    const syncIntervalInput = screen.getByTestId(
      'addon-field-input-syncInterval',
    )
    fireEvent.change(syncIntervalInput, {
      target: { value: '25' },
    })

    // Submete clicando no botão Conectar
    const connectButton = screen.getByTestId('datasource-instance-connect-btn')
    fireEvent.click(connectButton)

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledTimes(1)
    })

    if (!capturedData) {
      throw new Error('Formulário não gerou payload de submissão.')
    }

    const payload: DataSourceInstanceFormData = capturedData

    expect(payload.pluginId).toBe('custom-datasource-addon')
    expect(payload.connectionInstanceId).toBe('conn-instance-test-3')

    // Credenciais isoladas sob credentials
    expect(payload.credentials.serverUrl).toBe('https://producao.empresa.com')
    expect(payload.credentials.apiKey).toBe('secret-token-123')

    // Configurações isoladas sob configuration
    expect(payload.configuration.syncInterval).toBe(25)
    expect(payload.configuration.enableAutoPush).toBe(true)
    expect(payload.configuration.taskFilter).toBe('assigned_to_me')
  })

  it('deve respeitar isSubmitting desabilitando o botão de submissão', async () => {
    mockGetConnectionSchema.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: mockSampleSchema,
    })

    const handleSubmit = vi.fn()

    renderWithClient(
      <NewDataSourceInstanceForm
        pluginId="custom-datasource-addon"
        connectionInstanceId="conn-instance-test-4"
        isSubmitting={true}
        onSubmit={handleSubmit}
      />,
    )

    await waitFor(() => {
      const connectButton = screen.getByTestId(
        'datasource-instance-connect-btn',
      )
      if (connectButton instanceof HTMLButtonElement) {
        expect(connectButton.disabled).toBe(true)
      }
    })
  })

  it('deve suportar schema plano (tab.fields direto sem grupos) e enviar defaults puros', async () => {
    const flatSchema: AddonSettingsTab[] = [
      {
        id: 'credentials',
        label: 'Acesso',
        fields: [
          {
            id: 'host',
            type: 'text',
            label: 'Host',
            defaultValue: '127.0.0.1',
          },
          {
            id: 'port',
            type: 'number',
            label: 'Porta',
            defaultValue: 8080,
          },
        ],
      },
    ]

    mockGetConnectionSchema.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: flatSchema,
    })

    let capturedData: DataSourceInstanceFormData | null = null
    const handleSubmit = vi.fn((data: DataSourceInstanceFormData) => {
      capturedData = data
    })

    renderWithClient(
      <NewDataSourceInstanceForm
        pluginId="flat-schema-addon"
        connectionInstanceId="conn-flat-1"
        onSubmit={handleSubmit}
      />,
    )

    await waitFor(() => {
      const hostInput = screen.getByTestId('addon-field-input-host')
      const portInput = screen.getByTestId('addon-field-input-port')
      if (hostInput instanceof HTMLInputElement) {
        expect(hostInput.value).toBe('127.0.0.1')
      }
      if (portInput instanceof HTMLInputElement) {
        expect(Number(portInput.value)).toBe(8080)
      }
    })

    // Submete diretamente sem alterar nada
    const connectButton = screen.getByTestId('datasource-instance-connect-btn')
    fireEvent.click(connectButton)

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledTimes(1)
    })

    if (!capturedData) {
      throw new Error('Formulário não gerou payload para schema plano.')
    }

    const payload: DataSourceInstanceFormData = capturedData
    expect(payload.credentials.host).toBe('127.0.0.1')
    expect(payload.credentials.port).toBe(8080)
  })

  it('deve alternar estado do switch boolean e refletir no payload final', async () => {
    mockGetConnectionSchema.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: mockSampleSchema,
    })

    let capturedData: DataSourceInstanceFormData | null = null
    const handleSubmit = vi.fn((data: DataSourceInstanceFormData) => {
      capturedData = data
    })

    renderWithClient(
      <NewDataSourceInstanceForm
        pluginId="custom-datasource-addon"
        connectionInstanceId="conn-switch-test"
        onSubmit={handleSubmit}
      />,
    )

    await waitFor(() => {
      expect(
        screen.getByTestId('addon-field-input-enableAutoPush'),
      ).toBeTruthy()
    })

    const autoPushSwitch = screen.getByTestId(
      'addon-field-input-enableAutoPush',
    )
    // Clica para desmarcar o switch (era true pelo defaultValue)
    fireEvent.click(autoPushSwitch)

    const connectButton = screen.getByTestId('datasource-instance-connect-btn')
    fireEvent.click(connectButton)

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledTimes(1)
    })

    if (!capturedData) {
      throw new Error('Formulário não gerou payload após toggle de switch.')
    }

    const payload: DataSourceInstanceFormData = capturedData
    expect(payload.configuration.enableAutoPush).toBe(false)
  })

  it('deve renderizar campos do tipo textarea e json definidos no schema', async () => {
    const schemaWithTextareaAndJson: AddonSettingsTab[] = [
      {
        id: 'configuration',
        label: 'Configurações e Mapeamentos',
        fields: [
          {
            id: 'notes',
            type: 'textarea',
            label: 'Anotações da Instância',
            defaultValue: 'Observação padrão',
          },
          {
            id: 'customFieldMapping',
            type: 'json',
            label: 'Mapeamento de Custom Fields',
            defaultValue: '{"sprint": "cf_1"}',
          },
        ],
      },
    ]

    mockGetConnectionSchema.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: schemaWithTextareaAndJson,
    })

    const handleSubmit = vi.fn()

    renderWithClient(
      <NewDataSourceInstanceForm
        pluginId="json-mapping-addon"
        connectionInstanceId="conn-json-1"
        onSubmit={handleSubmit}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('addon-field-input-notes')).toBeTruthy()
      expect(
        screen.getByTestId('addon-field-input-customFieldMapping'),
      ).toBeTruthy()
    })

    const notesInput = screen.getByTestId('addon-field-input-notes')
    const jsonInput = screen.getByTestId('addon-field-input-customFieldMapping')
    if (notesInput instanceof HTMLTextAreaElement) {
      expect(notesInput.value).toBe('Observação padrão')
    }
    if (jsonInput instanceof HTMLTextAreaElement) {
      expect(jsonInput.value).toBe('{"sprint": "cf_1"}')
    }
  })

  it('deve omitir campos do tipo mapping para manter o modal de conexao focado em credenciais', async () => {
    const schemaWithMapping: AddonSettingsTab[] = [
      {
        id: 'configuration',
        label: 'Configurações',
        fields: [
          {
            id: 'serverUrl',
            type: 'text',
            label: 'URL do Servidor',
          },
          {
            id: 'statusMapping',
            type: 'mapping',
            label: 'Mapeamento de Status e Cores',
            description:
              'Personalize os ícones e cores para cada status remoto.',
          },
        ],
      },
    ]

    mockGetConnectionSchema.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: schemaWithMapping,
    })

    const handleSubmit = vi.fn()

    renderWithClient(
      <NewDataSourceInstanceForm
        pluginId="mapping-addon"
        connectionInstanceId="conn-mapping-1"
        onSubmit={handleSubmit}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('URL do Servidor')).toBeTruthy()
    })

    // Campo de mapping nunca deve estar presente no formulário de conexão
    expect(
      screen.queryByTestId('configure-mapping-statusMapping-btn'),
    ).toBeNull()
    expect(screen.queryByText('Mapeamento de Status e Cores')).toBeNull()
  })
})
