import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AddonTimezoneControl } from './addon-timezone-control'

vi.mock('@/hooks/use-host-bridge', () => ({
  useHostBridge: () => ({ addons: {} }),
}))

describe('Generic addon timezone control', () => {
  it('keeps a required timezone when the user confirms the already selected option', async () => {
    const onChange = vi.fn()
    render(
      <AddonTimezoneControl
        field={{
          id: 'zone',
          type: 'timezone',
          label: 'Horário',
          required: true,
        }}
        addonId="rooms-observer"
        scope={{ kind: 'addon' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'zone' }] }}
        value="America/Sao_Paulo"
        onChange={onChange}
        draftValues={{}}
      />,
    )
    fireEvent.click(screen.getByTestId('addon-dynamic-select-zone'))
    fireEvent.change(screen.getByPlaceholderText('Pesquisar opções...'), {
      target: { value: 'Sao Paulo' },
    })
    fireEvent.click(
      await screen.findByTestId('addon-select-option-America/Sao_Paulo'),
    )
    expect(onChange).toHaveBeenCalledWith('America/Sao_Paulo')
  })

  it('searches readable timezones and saves their IANA identifier without auto-selection', async () => {
    const onChange = vi.fn()
    render(
      <AddonTimezoneControl
        field={{
          id: 'schedule-zone',
          type: 'timezone',
          label: 'Horário das regras',
        }}
        addonId="rooms-observer"
        scope={{ kind: 'workspace', workspaceId: 'ws-1' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'schedule-zone' }] }}
        value={undefined}
        onChange={onChange}
        draftValues={{}}
      />,
    )
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('addon-dynamic-select-schedule-zone'))
    await screen.findByTestId('addon-select-option-Africa/Abidjan')
    const search = screen.getByPlaceholderText('Pesquisar opções...')
    fireEvent.change(search, { target: { value: 'Sao Paulo' } })
    const option = await screen.findByTestId(
      'addon-select-option-America/Sao_Paulo',
    )
    await waitFor(() =>
      expect(
        screen.queryByTestId('addon-select-option-Africa/Abidjan'),
      ).not.toBeInTheDocument(),
    )
    expect(option).toHaveTextContent('Brasília')
    fireEvent.click(option)
    expect(onChange).toHaveBeenCalledWith('America/Sao_Paulo')
  })
})
