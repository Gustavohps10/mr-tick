import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  getTaskConnectionOption,
  TaskConnectionSelect,
} from './task-connection-select'

describe('task connection names', () => {
  it('uses catalog labels when a connection has no identity and never displays its technical ID', () => {
    const connection = getTaskConnectionOption({
      id: 'technical-instance-123',
      addon: { name: 'Meu servidor de tarefas', logo: '' },
    })
    render(
      <TaskConnectionSelect
        connections={[connection]}
        value={connection.id}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'Conexão' })).toHaveTextContent(
      'Meu servidor de tarefas',
    )
    expect(screen.queryByText('technical-instance-123')).not.toBeInTheDocument()
  })

  it('distinguishes the identity from its integration without repeating the account name', () => {
    expect(
      getTaskConnectionOption({
        id: 'opaque-id',
        addon: { name: 'Integração de tarefas', logo: '' },
        identityName: 'Produção',
        memberName: 'Produção',
      }),
    ).toEqual({
      id: 'opaque-id',
      label: 'Produção',
      description: 'Integração de tarefas',
      logo: '',
    })
  })

  it('marks missing presentation data as unavailable instead of substituting an ID', () => {
    const connection = getTaskConnectionOption({ id: 'opaque-id' })
    expect(connection.label).toBe('Nome da conexão indisponível')
    expect(connection.disabled).toBe(true)
  })
})
