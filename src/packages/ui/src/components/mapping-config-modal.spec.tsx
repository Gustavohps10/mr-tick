import type { MappingFieldDefinition } from '@mr-tick/application'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MappingConfigModal,
  parseMappingValue,
} from '@/components/mapping-config-modal'

const mockGetMappingFields = vi.fn()

vi.mock('@/hooks/use-host-bridge', () => ({
  useHostBridge: () => ({
    addons: {
      getMappingFields: mockGetMappingFields,
    },
  }),
}))

const sampleFields: MappingFieldDefinition[] = [
  {
    id: 'backlog',
    name: 'Backlog',
    category: 'status',
    defaultIcon: 'Inbox',
    defaultColor: '#64748b',
    description: 'Tarefas no backlog.',
  },
  {
    id: 'in_progress',
    name: 'Em Andamento',
    category: 'status',
    defaultIcon: 'PlayCircle',
    defaultColor: '#3b82f6',
    description: 'Tarefas ativas.',
  },
  {
    id: 'done',
    name: 'Concluído',
    category: 'status',
    defaultIcon: 'CheckCircle2',
    defaultColor: '#22c55e',
    description: 'Tarefas finalizadas.',
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

describe('MappingConfigModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deve renderizar os campos solicitados pelo addon com ícones e cores padrão', async () => {
    mockGetMappingFields.mockResolvedValueOnce({
      isSuccess: true,
      statusCode: 200,
      data: sampleFields,
    })

    const handleSave = vi.fn()
    const handleOpenChange = vi.fn()

    renderWithClient(
      <MappingConfigModal
        open={true}
        onOpenChange={handleOpenChange}
        addonId="datasource-fake"
        onSave={handleSave}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('mapping-field-item-backlog')).toBeTruthy()
      expect(screen.getByTestId('mapping-field-item-in_progress')).toBeTruthy()
      expect(screen.getByTestId('mapping-field-item-done')).toBeTruthy()
    })

    expect(screen.getByText('Backlog')).toBeTruthy()
    expect(screen.getByText('Em Andamento')).toBeTruthy()
    expect(screen.getByText('Concluído')).toBeTruthy()
  })

  it('deve permitir alterar a cor de um campo pela paleta visual', async () => {
    const handleSave = vi.fn()
    const handleOpenChange = vi.fn()

    renderWithClient(
      <MappingConfigModal
        open={true}
        onOpenChange={handleOpenChange}
        addonId="datasource-fake"
        fields={sampleFields}
        onSave={handleSave}
      />,
    )

    // Clica na cor Vermelho (#ef4444) para o campo backlog
    const redColorBtn = screen.getByTestId('color-btn-backlog-#ef4444')
    fireEvent.click(redColorBtn)

    // Clica em Salvar Mapeamento
    const saveBtn = screen.getByTestId('modal-save-mapping-btn')
    fireEvent.click(saveBtn)

    expect(handleSave).toHaveBeenCalledTimes(1)
    const saved = handleSave.mock.calls[0][0]
    expect(saved.backlog.color).toBe('#ef4444')
    expect(saved.backlog.icon).toBe('Inbox')
  })

  it('deve permitir selecionar um ícone visualmente via popover', async () => {
    const handleSave = vi.fn()
    const handleOpenChange = vi.fn()

    renderWithClient(
      <MappingConfigModal
        open={true}
        onOpenChange={handleOpenChange}
        addonId="datasource-fake"
        fields={sampleFields}
        onSave={handleSave}
      />,
    )

    // Abre o popover de ícones para o campo backlog
    const iconPickerBtn = screen.getByTestId('mapping-icon-picker-backlog')
    fireEvent.click(iconPickerBtn)

    await waitFor(() => {
      expect(screen.getByTestId('icon-option-backlog-Flame')).toBeTruthy()
    })

    // Seleciona o ícone Flame
    fireEvent.click(screen.getByTestId('icon-option-backlog-Flame'))

    // Salva
    fireEvent.click(screen.getByTestId('modal-save-mapping-btn'))

    expect(handleSave).toHaveBeenCalledTimes(1)
    const saved = handleSave.mock.calls[0][0]
    expect(saved.backlog.icon).toBe('Flame')
  })

  it('deve abrir modal de exportar preset e copiar JSON formatado', async () => {
    const handleSave = vi.fn()
    const handleOpenChange = vi.fn()

    renderWithClient(
      <MappingConfigModal
        open={true}
        onOpenChange={handleOpenChange}
        addonId="datasource-fake"
        fields={sampleFields}
        onSave={handleSave}
      />,
    )

    // Clica em Exportar Preset
    const exportBtn = screen.getByTestId('modal-export-preset-btn')
    fireEvent.click(exportBtn)

    await waitFor(() => {
      expect(screen.getByTestId('modal-export-preset-dialog')).toBeTruthy()
    })

    const textarea = screen.getByTestId('modal-export-preset-textarea')
    if (textarea instanceof HTMLTextAreaElement) {
      expect(textarea.value).toContain('"in_progress"')
      expect(textarea.value).toContain('"PlayCircle"')
      expect(textarea.value).toContain('"#3b82f6"')
    }
  })

  it('deve importar preset JSON e atualizar todos os mapeamentos', async () => {
    const handleSave = vi.fn()
    const handleOpenChange = vi.fn()

    renderWithClient(
      <MappingConfigModal
        open={true}
        onOpenChange={handleOpenChange}
        addonId="datasource-fake"
        fields={sampleFields}
        onSave={handleSave}
      />,
    )

    // Clica em Importar Preset
    const importBtn = screen.getByTestId('modal-import-preset-btn')
    fireEvent.click(importBtn)

    await waitFor(() => {
      expect(screen.getByTestId('modal-import-preset-dialog')).toBeTruthy()
    })

    const importJson = JSON.stringify({
      mapping: {
        backlog: { icon: 'Clock', color: '#ec4899' },
        done: { icon: 'Zap', color: '#06b6d4' },
      },
    })

    const textarea = screen.getByTestId('modal-import-preset-textarea')
    fireEvent.change(textarea, { target: { value: importJson } })

    const applyBtn = screen.getByTestId('modal-apply-preset-btn')
    fireEvent.click(applyBtn)

    // Salva o modal principal para conferir o resultado importado
    fireEvent.click(screen.getByTestId('modal-save-mapping-btn'))

    expect(handleSave).toHaveBeenCalledTimes(1)
    const saved = handleSave.mock.calls[0][0]
    expect(saved.backlog.icon).toBe('Clock')
    expect(saved.backlog.color).toBe('#ec4899')
    expect(saved.done.icon).toBe('Zap')
    expect(saved.done.color).toBe('#06b6d4')
  })

  it('deve exibir erro ao tentar importar preset com JSON inválido', async () => {
    const handleSave = vi.fn()
    const handleOpenChange = vi.fn()

    renderWithClient(
      <MappingConfigModal
        open={true}
        onOpenChange={handleOpenChange}
        addonId="datasource-fake"
        fields={sampleFields}
        onSave={handleSave}
      />,
    )

    fireEvent.click(screen.getByTestId('modal-import-preset-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('modal-import-preset-dialog')).toBeTruthy()
    })

    const textarea = screen.getByTestId('modal-import-preset-textarea')
    fireEvent.change(textarea, { target: { value: '{ invalid: json' } })

    fireEvent.click(screen.getByTestId('modal-apply-preset-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('modal-import-preset-error')).toBeTruthy()
    })
  })

  it('parseMappingValue deve tratar entradas nulas, objetos e strings JSON', () => {
    expect(parseMappingValue(null)).toEqual({})
    expect(parseMappingValue(undefined)).toEqual({})
    expect(parseMappingValue('')).toEqual({})

    const validObj = {
      test: { icon: 'Zap', color: '#ef4444' },
    }
    expect(parseMappingValue(validObj)).toEqual(validObj)

    const validJson = JSON.stringify({
      mapping: {
        test: { icon: 'Zap', color: '#ef4444' },
      },
    })
    expect(parseMappingValue(validJson)).toEqual(validObj)
  })
})
