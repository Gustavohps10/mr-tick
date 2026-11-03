import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TaskLookupResults } from './task-lookup-results'

describe('shared task lookup presentation', () => {
  const task = {
    id: 'work::item-42',
    title:
      'Uma tarefa com título completo para distinguir resultados semelhantes',
  }
  const present = (item: typeof task) => ({ id: item.id, title: item.title })

  it('selects the original typed task and keeps pin actions separate from selection', () => {
    const select = vi.fn()
    const pin = vi.fn()
    render(
      <TaskLookupResults
        tasks={[task]}
        getKey={(item) => item.id}
        present={present}
        onSelect={select}
        selectedKey={task.id}
        renderAction={() => (
          <button type="button" onClick={pin}>
            Fixar
          </button>
        )}
      />,
    )
    const result = screen.getByRole('option', { name: new RegExp(task.title) })
    expect(result).toHaveAttribute('aria-selected', 'true')
    expect(result).toHaveAttribute('title', task.title)
    fireEvent.click(screen.getByRole('button', { name: 'Fixar' }))
    expect(pin).toHaveBeenCalledOnce()
    expect(select).not.toHaveBeenCalled()
    fireEvent.click(result)
    expect(select).toHaveBeenCalledWith(task)
  })

  it('shows loading before empty state and preserves transport errors', () => {
    const { rerender } = render(
      <TaskLookupResults
        tasks={[]}
        getKey={(item: typeof task) => item.id}
        present={present}
        onSelect={vi.fn()}
        loading
      />,
    )
    expect(
      screen.getByRole('status', { name: 'Carregando tarefas' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Nenhuma tarefa encontrada.'),
    ).not.toBeInTheDocument()
    rerender(
      <TaskLookupResults
        tasks={[]}
        getKey={(item: typeof task) => item.id}
        present={present}
        onSelect={vi.fn()}
        error="SOURCE_UNAVAILABLE"
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('SOURCE_UNAVAILABLE')
  })
})
