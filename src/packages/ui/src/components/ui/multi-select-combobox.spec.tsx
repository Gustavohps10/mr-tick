import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  MultiSelectCombobox,
  type MultiSelectComboboxOption,
} from './multi-select-combobox'

describe('MultiSelectCombobox', () => {
  beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  const options: MultiSelectComboboxOption[] = [
    { value: 'dev-1', label: 'Carlos Silva' },
    { value: 'dev-2', label: 'Ana Souza' },
    { value: 'dev-3', label: 'Marcos Lima' },
  ]

  it('renders default placeholder when no values are selected', () => {
    render(
      <MultiSelectCombobox
        options={options}
        selectedValues={[]}
        onSelectedValuesChange={vi.fn()}
        placeholder="Todos os colaboradores"
      />,
    )

    expect(screen.getByText('Todos os colaboradores')).toBeInTheDocument()
  })

  it('renders badges for selected options and resolves labels correctly', () => {
    render(
      <MultiSelectCombobox
        options={options}
        selectedValues={['dev-1', 'dev-2']}
        onSelectedValuesChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Carlos Silva')).toBeInTheDocument()
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
    expect(
      screen.queryByText('Todos os registros (sem filtro)'),
    ).not.toBeInTheDocument()
  })

  it('renders overflow counter when selected count exceeds maxBadges', () => {
    render(
      <MultiSelectCombobox
        options={options}
        selectedValues={['dev-1', 'dev-2', 'dev-3']}
        onSelectedValuesChange={vi.fn()}
        maxBadges={2}
      />,
    )

    expect(screen.getByText('Carlos Silva')).toBeInTheDocument()
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
    expect(screen.getByText('+1 mais')).toBeInTheDocument()
  })

  it('calls onSelectedValuesChange when removing a single value via badge X', () => {
    const onSelectedValuesChange = vi.fn()

    render(
      <MultiSelectCombobox
        options={options}
        selectedValues={['dev-1', 'dev-2']}
        onSelectedValuesChange={onSelectedValuesChange}
      />,
    )

    const removeBtn = screen.getByLabelText('Remover Carlos Silva')
    fireEvent.click(removeBtn)

    expect(onSelectedValuesChange).toHaveBeenCalledWith(['dev-2'])
  })

  it('calls onSelectedValuesChange with empty array when clearing all', () => {
    const onSelectedValuesChange = vi.fn()

    render(
      <MultiSelectCombobox
        options={options}
        selectedValues={['dev-1', 'dev-2']}
        onSelectedValuesChange={onSelectedValuesChange}
      />,
    )

    const clearBtn = screen.getByLabelText('Limpar todas as seleções')
    fireEvent.click(clearBtn)

    expect(onSelectedValuesChange).toHaveBeenCalledWith([])
  })

  it('opens popover on click and toggles option selection', () => {
    const onSelectedValuesChange = vi.fn()

    render(
      <MultiSelectCombobox
        options={options}
        selectedValues={['dev-1']}
        onSelectedValuesChange={onSelectedValuesChange}
      />,
    )

    const trigger = screen.getByRole('combobox')
    fireEvent.click(trigger)

    expect(screen.getByText('1 selecionado')).toBeInTheDocument()
    expect(screen.getAllByText('Carlos Silva').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()

    const anaOption = screen.getByText('Ana Souza')
    fireEvent.click(anaOption)

    expect(onSelectedValuesChange).toHaveBeenCalledWith(['dev-1', 'dev-2'])
  })

  it('renders popover with modal capability and z-index 60 when opened', () => {
    render(
      <MultiSelectCombobox
        options={options}
        selectedValues={[]}
        onSelectedValuesChange={vi.fn()}
      />,
    )

    const trigger = screen.getByRole('combobox')
    fireEvent.click(trigger)

    const popoverContent = document.querySelector(
      '[data-slot="popover-content"]',
    )
    expect(popoverContent).not.toBeNull()
    expect(popoverContent?.className).toContain('z-[60]')
  })
})
