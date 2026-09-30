import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import {
  DataSourceConnectionsContext,
  DataSourceConnectionsContextType,
} from '@/contexts/DataSourceConnectionsContext'
import {
  WorkspaceContext,
  WorkspaceContextType,
} from '@/contexts/WorkspaceContext'
import { useTimerSettings } from '@/hooks/use-timer-settings'

const mockSetIgnoreMouseEvents = vi.fn()
const mockGetTimerbarMenus = vi
  .fn()
  .mockResolvedValue({ isSuccess: true, data: [] })
const mockGetSettings = vi.fn().mockResolvedValue({ startMinimized: false })
const mockGetDisplays = vi.fn().mockResolvedValue([])
const mockMoveToDisplay = vi.fn()
const mockEmit = vi.fn()
const mockOn = vi.fn().mockReturnValue(() => {})

const mockHostBridge = {
  system: {
    setIgnoreMouseEvents: mockSetIgnoreMouseEvents,
    getSettings: mockGetSettings,
    getDisplays: mockGetDisplays,
    moveToDisplay: mockMoveToDisplay,
    startKeyboardInterception: vi.fn(),
    stopKeyboardInterception: vi.fn(),
  },
  addons: {
    getTimerbarMenus: mockGetTimerbarMenus,
  },
  events: {
    on: mockOn,
    emit: mockEmit,
  },
  timer: {
    start: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    resume: vi.fn(),
  },
}

vi.mock('@/hooks/use-host-bridge', () => ({
  useHostBridge: () => mockHostBridge,
}))

// Import components after mock
import { TimerSettings } from '@/components/time-bar/details/timer-settings'
import { UltimateTimeTracker } from '@/components/time-bar/ultimate-entry-bar'
import { TimeEntryProvider } from '@/stores/timeEntryStore'

const mockConnectionsValue: DataSourceConnectionsContextType = {
  isLoading: false,
  workspaceId: undefined,
  connections: [],
  workspaceConnections: [],
  installedPlugins: [],
  link: async () => undefined,
  unlink: async () => undefined,
  connect: async () => undefined,
  disconnect: async () => undefined,
  getConnection: () => undefined,
  isConnected: () => false,
}

const mockWorkspaceValue: WorkspaceContextType = {
  workspace: {
    id: 'ws-1',
    name: 'Default',
    status: 'configured',
    dataSourceConnections: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  workspaces: [],
  isLoading: false,
  isLoadingWorkspaces: false,
  create: async () => undefined,
  updateIdentity: async () => undefined,
  remove: async () => undefined,
  isCreating: false,
  isUpdatingIdentity: false,
  isRemoving: false,
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <WorkspaceContext.Provider value={mockWorkspaceValue}>
          <DataSourceConnectionsContext.Provider value={mockConnectionsValue}>
            <TooltipProvider>
              <TimeEntryProvider>{ui}</TimeEntryProvider>
            </TooltipProvider>
          </DataSourceConnectionsContext.Provider>
        </WorkspaceContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false
  window.HTMLElement.prototype.setPointerCapture = () => {}
  window.HTMLElement.prototype.releasePointerCapture = () => {}
  window.HTMLElement.prototype.scrollIntoView = () => {}

  window.matchMedia =
    window.matchMedia ||
    (() => ({
      matches: false,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }))

  document.elementFromPoint = () => null

  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

describe('Timer Bar Interactions & Orientation (100% Component Coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    useTimerSettings.setState({
      widgetPosition: 'bottom',
      mainWindowWidgetPosition: 'bottom',
      timerDirection: 'up',
      logOption: 'ask',
      antiBurnout: true,
      discordRpc: false,
      activeWindowTracking: false,
      hiddenBlocks: [],
      enabledAddonIds: [],
    })
  })

  afterEach(() => {
    window.location.hash = ''
  })

  // -------------------------------------------------------------------------
  // SUITE 1: TimerSettings Orientation UI vs Docking Compass
  // -------------------------------------------------------------------------
  describe('Suite 1: TimerSettings Orientation vs Docking Compass', () => {
    it('renders "Orientação da Barra" in Widget Mode and does NOT render "Ancoragem"', async () => {
      window.location.hash = '#/widgets/ultimate-timer'

      renderWithProviders(<TimerSettings />)

      // Open Popover
      const triggerBtn = screen.getByRole('button', { name: /configurações/i })
      fireEvent.click(triggerBtn)

      // Orientation section must be rendered
      expect(screen.getByTestId('widget-orientation-section')).toBeTruthy()
      expect(screen.getByText('Orientação da Barra')).toBeTruthy()
      expect(screen.getByTestId('orientation-horizontal-btn')).toBeTruthy()
      expect(screen.getByTestId('orientation-vertical-btn')).toBeTruthy()

      // Docking compass must NOT be rendered in widget mode
      expect(screen.queryByText('Ancoragem')).toBeNull()
    })

    it('switches between Horizontal and Vertical orientation in Widget Mode', async () => {
      window.location.hash = '#/widgets/ultimate-timer'

      renderWithProviders(<TimerSettings />)

      const triggerBtn = screen.getByRole('button', { name: /configurações/i })
      fireEvent.click(triggerBtn)

      const verticalBtn = screen.getByTestId('orientation-vertical-btn')
      const horizontalBtn = screen.getByTestId('orientation-horizontal-btn')

      // Click Vertical -> updates store to 'left'
      fireEvent.click(verticalBtn)
      expect(useTimerSettings.getState().widgetPosition).toBe('left')

      // Click Horizontal -> updates store to 'bottom'
      fireEvent.click(horizontalBtn)
      expect(useTimerSettings.getState().widgetPosition).toBe('bottom')
    })

    it('renders "Ancoragem" with compass in Workspace Mode and does NOT render "Orientação da Barra"', async () => {
      window.location.hash = '#/workspaces/ws-1/time-entries'

      renderWithProviders(<TimerSettings />)

      const triggerBtn = screen.getByRole('button', { name: /configurações/i })
      fireEvent.click(triggerBtn)

      // Docking compass section must be rendered
      expect(screen.getByText('Ancoragem')).toBeTruthy()
      expect(screen.queryByTestId('widget-orientation-section')).toBeNull()
      expect(screen.queryByText('Orientação da Barra')).toBeNull()
    })

    it('does NOT reposition widget display when mounted inside Workspace Mode', async () => {
      window.location.hash = '#/workspaces/ws-1/time-entries'
      mockGetDisplays.mockResolvedValueOnce([
        { id: 1, isPrimary: true, name: 'Display 1' },
        { id: 2, isPrimary: false, name: 'Display 2' },
      ])

      renderWithProviders(<TimerSettings />)

      // In workspace mode, TimerSettings must not invoke moveToDisplay
      expect(mockMoveToDisplay).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // SUITE 2: UltimateEntryBar Mouse Pass-Through (Ghost Click-Blocker Prevention)
  // -------------------------------------------------------------------------
  describe('Suite 2: Mouse Pass-Through in Widget Window', () => {
    it('initializes with setIgnoreMouseEvents(ignore: true, forward: true) on mount in widget mode', () => {
      window.location.hash = '#/widgets/ultimate-timer'

      renderWithProviders(
        <div data-widget-drag-boundary="true">
          <UltimateTimeTracker />
        </div>,
      )

      expect(mockSetIgnoreMouseEvents).toHaveBeenCalledWith({
        body: { ignore: true, forward: true },
      })
    })

    it('toggles ignore state on global pointermove between interactive and non-interactive areas', async () => {
      window.location.hash = '#/widgets/ultimate-timer'

      const { container } = renderWithProviders(
        <div
          data-widget-drag-boundary="true"
          style={{ width: 1000, height: 800 }}
        >
          <UltimateTimeTracker />
        </div>,
      )

      const card = container.querySelector('[data-widget-card]') as HTMLElement
      expect(card).toBeTruthy()

      // Pointer over card (interactive) -> set ignore: false
      fireEvent.pointerMove(card, {
        clientX: 100,
        clientY: 100,
      })

      expect(mockSetIgnoreMouseEvents).toHaveBeenCalledWith({
        body: { ignore: false, forward: true },
      })

      // Pointer over document.body (transparent non-interactive canvas) -> set ignore: true
      fireEvent.pointerMove(document.body, {
        clientX: 500,
        clientY: 500,
      })

      expect(mockSetIgnoreMouseEvents).toHaveBeenCalledWith({
        body: { ignore: true, forward: true },
      })
    })

    it('restores ignore: true on window pointerleave and blur', () => {
      window.location.hash = '#/widgets/ultimate-timer'

      const { container } = renderWithProviders(
        <div data-widget-drag-boundary="true">
          <UltimateTimeTracker />
        </div>,
      )

      const card = container.querySelector('[data-widget-card]') as HTMLElement
      // Hover card first
      fireEvent.pointerMove(card)
      expect(mockSetIgnoreMouseEvents).toHaveBeenLastCalledWith({
        body: { ignore: false, forward: true },
      })

      // Trigger window pointerleave
      fireEvent(window, new Event('pointerleave'))
      expect(mockSetIgnoreMouseEvents).toHaveBeenLastCalledWith({
        body: { ignore: true, forward: true },
      })

      // Hover card again
      fireEvent.pointerMove(card)
      expect(mockSetIgnoreMouseEvents).toHaveBeenLastCalledWith({
        body: { ignore: false, forward: true },
      })

      // Trigger window blur
      fireEvent(window, new Event('blur'))
      expect(mockSetIgnoreMouseEvents).toHaveBeenLastCalledWith({
        body: { ignore: true, forward: true },
      })
    })

    it('restores ignore: true when Radix portal popover/dialog is removed from body', async () => {
      window.location.hash = '#/widgets/ultimate-timer'

      renderWithProviders(
        <div data-widget-drag-boundary="true">
          <UltimateTimeTracker />
        </div>,
      )

      // Simulate a portal overlay attached to document.body
      const portalEl = document.createElement('div')
      portalEl.setAttribute('data-radix-popper-content-wrapper', 'true')
      portalEl.textContent = 'Popover Overlay'
      document.body.appendChild(portalEl)

      // Hover on portal element -> interactive
      fireEvent.pointerMove(portalEl)
      expect(mockSetIgnoreMouseEvents).toHaveBeenLastCalledWith({
        body: { ignore: false, forward: true },
      })

      // Now remove the portal from body (simulating popover unmount/close)
      document.body.removeChild(portalEl)

      // MutationObserver triggers and should reset ignore: true
      await waitFor(() => {
        expect(mockSetIgnoreMouseEvents).toHaveBeenLastCalledWith({
          body: { ignore: true, forward: true },
        })
      })
    })
  })

  // -------------------------------------------------------------------------
  // SUITE 3: Free 2D Dragging Freedom
  // -------------------------------------------------------------------------
  describe('Suite 3: Free 2D Dragging (Bidirectional Motion)', () => {
    it('applies 2D movement with both dx and dy displacement without locking axes', () => {
      window.location.hash = '#/widgets/ultimate-timer'

      const { container } = renderWithProviders(
        <div
          data-widget-drag-boundary="true"
          style={{ width: 1200, height: 800, position: 'relative' }}
        >
          <UltimateTimeTracker />
        </div>,
      )

      const card = container.querySelector('[data-widget-card]') as HTMLElement
      const dragHandle = container.querySelector(
        '[data-widget-handle]',
      ) as HTMLElement
      expect(card).toBeTruthy()
      expect(dragHandle).toBeTruthy()

      // Mock bounding rects
      card.getBoundingClientRect = () => ({
        left: 200,
        top: 200,
        right: 400,
        bottom: 250,
        width: 200,
        height: 50,
        x: 200,
        y: 200,
        toJSON: () => {},
      })

      const boundary = container.querySelector(
        '[data-widget-drag-boundary]',
      ) as HTMLElement
      boundary.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 1200,
        bottom: 800,
        width: 1200,
        height: 800,
        x: 0,
        y: 0,
        toJSON: () => {},
      })

      // Pointer down on handle at (250, 220)
      fireEvent(
        dragHandle,
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          button: 0,
          clientX: 250,
          clientY: 220,
        }),
      )

      // Pointer move by +100px X and +60px Y -> (350, 280)
      fireEvent(
        window,
        new PointerEvent('pointermove', {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          clientX: 350,
          clientY: 280,
        }),
      )

      // Pointer up -> finalize drag
      fireEvent(
        window,
        new PointerEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          clientX: 350,
          clientY: 280,
        }),
      )

      // Transform must reflect both X and Y components (+100px, +60px)
      expect(card.style.transform).toBe('translate3d(100px, 60px, 0)')

      // Verify localStorage persistence under mr-tick:widget:free-offset
      const saved = window.localStorage.getItem('mr-tick:widget:free-offset')
      expect(saved).toBeTruthy()
      const parsed = JSON.parse(saved as string)
      expect(parsed.bottom).toEqual({ x: 100, y: 60 })
    })

    it('allows 2D dragging when widget is in vertical orientation', () => {
      window.location.hash = '#/widgets/ultimate-timer'
      useTimerSettings.setState({ widgetPosition: 'left' })

      const { container } = renderWithProviders(
        <div
          data-widget-drag-boundary="true"
          style={{ width: 1200, height: 800, position: 'relative' }}
        >
          <UltimateTimeTracker />
        </div>,
      )

      const card = container.querySelector('[data-widget-card]') as HTMLElement
      const dragHandle = container.querySelector(
        '[data-widget-handle]',
      ) as HTMLElement
      expect(card).toBeTruthy()
      expect(dragHandle).toBeTruthy()

      card.getBoundingClientRect = () => ({
        left: 50,
        top: 100,
        right: 110,
        bottom: 500,
        width: 60,
        height: 400,
        x: 50,
        y: 100,
        toJSON: () => {},
      })

      const boundary = container.querySelector(
        '[data-widget-drag-boundary]',
      ) as HTMLElement
      boundary.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 1200,
        bottom: 800,
        width: 1200,
        height: 800,
        x: 0,
        y: 0,
        toJSON: () => {},
      })

      // Pointer down
      fireEvent(
        dragHandle,
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId: 2,
          button: 0,
          clientX: 80,
          clientY: 150,
        }),
      )

      // Drag +40px X and +90px Y -> (120, 240)
      fireEvent(
        window,
        new PointerEvent('pointermove', {
          bubbles: true,
          cancelable: true,
          pointerId: 2,
          clientX: 120,
          clientY: 240,
        }),
      )

      // Pointer up
      fireEvent(
        window,
        new PointerEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          pointerId: 2,
          clientX: 120,
          clientY: 240,
        }),
      )

      // In vertical orientation, 2D dragging preserves both X and Y!
      expect(card.style.transform).toBe('translate3d(40px, 90px, 0)')

      const saved = window.localStorage.getItem('mr-tick:widget:free-offset')
      expect(saved).toBeTruthy()
      const parsed = JSON.parse(saved as string)
      expect(parsed.left).toEqual({ x: 40, y: 90 })
    })

    it('sets ignore: true on pointerup if dropped outside interactive card', () => {
      window.location.hash = '#/widgets/ultimate-timer'

      const { container } = renderWithProviders(
        <div data-widget-drag-boundary="true">
          <UltimateTimeTracker />
        </div>,
      )

      const dragHandle = container.querySelector(
        '[data-widget-handle]',
      ) as HTMLElement

      // Pointer down
      fireEvent(
        dragHandle,
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 3,
          clientX: 100,
          clientY: 100,
        }),
      )

      // Mock elementFromPoint to return document.body (outside card)
      const origElementFromPoint = document.elementFromPoint
      document.elementFromPoint = () => document.body

      // Pointer up outside card
      fireEvent(
        window,
        new PointerEvent('pointerup', {
          bubbles: true,
          pointerId: 3,
          clientX: 800,
          clientY: 800,
        }),
      )

      document.elementFromPoint = origElementFromPoint

      // Must assert ignore: true so the transparent area does not block clicks
      expect(mockSetIgnoreMouseEvents).toHaveBeenLastCalledWith({
        body: { ignore: true, forward: true },
      })
    })

    it('locks non-active axis during drag inside Workspace Mode (preventing floating / bamba solta)', () => {
      window.location.hash = '#/workspaces/ws-1/time-entries'
      useTimerSettings.setState({ mainWindowWidgetPosition: 'left' })

      const { container } = renderWithProviders(
        <div
          data-widget-drag-boundary="true"
          style={{ width: 1200, height: 800, position: 'relative' }}
        >
          <UltimateTimeTracker />
        </div>,
      )

      const card = container.querySelector('[data-widget-card]') as HTMLElement
      const dragHandle = container.querySelector(
        '[data-widget-handle]',
      ) as HTMLElement
      expect(card).toBeTruthy()
      expect(dragHandle).toBeTruthy()

      card.getBoundingClientRect = () => ({
        left: 50,
        top: 100,
        right: 110,
        bottom: 500,
        width: 60,
        height: 400,
        x: 50,
        y: 100,
        toJSON: () => {},
      })

      const boundary = container.querySelector(
        '[data-widget-drag-boundary]',
      ) as HTMLElement
      boundary.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 1200,
        bottom: 800,
        width: 1200,
        height: 800,
        x: 0,
        y: 0,
        toJSON: () => {},
      })

      // Pointer down
      fireEvent(
        dragHandle,
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 4,
          button: 0,
          clientX: 80,
          clientY: 150,
        }),
      )

      // Drag +80px X and +50px Y -> (160, 200)
      fireEvent(
        window,
        new PointerEvent('pointermove', {
          bubbles: true,
          pointerId: 4,
          clientX: 160,
          clientY: 200,
        }),
      )

      // Pointer up
      fireEvent(
        window,
        new PointerEvent('pointerup', {
          bubbles: true,
          pointerId: 4,
          clientX: 160,
          clientY: 200,
        }),
      )

      // In workspace vertical mode, X MUST BE 0! Only Y moves (+50px)
      expect(card.style.transform).toBe('translate3d(0px, 50px, 0)')

      // Must be saved in workspace dock storage, leaving widget storage untouched
      const workspaceSaved = window.localStorage.getItem(
        'mr-tick:workspace:dock-offset',
      )
      expect(workspaceSaved).toBeTruthy()
      const parsedWorkspace = JSON.parse(workspaceSaved as string)
      expect(parsedWorkspace.left).toEqual({ x: 0, y: 50 })

      // Widget storage must be clean
      const widgetSaved = window.localStorage.getItem(
        'mr-tick:widget:free-offset',
      )
      expect(widgetSaved).toBeNull()
    })
  })

  describe('Suite 4: Mini Mode, Vertical Editing & Expander Visuals', () => {
    it('allows toggling miniMode in preferences and applies compact sizing in widget mode', async () => {
      window.location.hash = '#/workspaces/ws-1/widgets/timer'
      useTimerSettings.setState({ miniMode: false, widgetPosition: 'left' })

      const { container } = renderWithProviders(<UltimateTimeTracker />)
      const settingsBtn = screen.getByRole('button', { name: 'Configurações' })

      await act(async () => {
        fireEvent.click(settingsBtn)
      })

      const miniModeSwitch = screen.getByTestId('minimode-switch')
      expect(miniModeSwitch).toBeTruthy()

      await act(async () => {
        fireEvent.click(miniModeSwitch)
      })

      expect(useTimerSettings.getState().miniMode).toBe(true)

      const card = container.querySelector('[data-widget-card="true"]')
      expect(card?.className).toContain('w-12')
    })

    it('allows typing into timer input in vertical orientation when idle', async () => {
      window.location.hash = '#/workspaces/ws-1/widgets/timer'
      useTimerSettings.setState({ widgetPosition: 'left' })

      renderWithProviders(<UltimateTimeTracker />)

      const timerInput = screen.getByLabelText(/Timer value/i)
      expect(timerInput).toBeTruthy()

      fireEvent.focus(timerInput)
      fireEvent.change(timerInput, { target: { value: '1h' } })
      fireEvent.blur(timerInput)

      expect(screen.getByDisplayValue('01')).toBeTruthy()
      expect(screen.getAllByDisplayValue('00')).toHaveLength(2)
    })

    it('ensures expander button is flush with borders with no border, margin, or padding classes', async () => {
      window.location.hash = '#/workspaces/ws-1/widgets/timer'
      useTimerSettings.setState({
        widgetPosition: 'bottom',
        hiddenBlocks: ['tools'],
      })

      const { container } = renderWithProviders(<UltimateTimeTracker />)
      const expander = container.querySelector('[title="Expandir itens"]')
      expect(expander).toBeTruthy()
      expect(expander?.className).toContain('self-stretch')
      expect(expander?.className).toContain('p-0')
      expect(expander?.className).toContain('m-0')
      expect(expander?.className).not.toContain('border-')
      expect(expander?.className).not.toContain('mt-')
      expect(expander?.className).not.toContain('ml-')
      expect(expander?.className).not.toContain('pt-')

      // Sibling to CardContent directly inside Card
      expect(expander?.parentElement?.getAttribute('data-slot')).toBe('card')

      // Click to toggle
      fireEvent.click(expander!)
      expect(container.querySelector('[title="Recolher itens"]')).toBeTruthy()
    })

    it('renders expander as a full-width flush footer in vertical mode', async () => {
      window.location.hash = '#/workspaces/ws-1/widgets/timer'
      useTimerSettings.setState({
        widgetPosition: 'left',
        hiddenBlocks: ['tools'],
      })

      const { container } = renderWithProviders(<UltimateTimeTracker />)
      const expander = container.querySelector('[title="Expandir itens"]')
      expect(expander).toBeTruthy()
      expect(expander?.className).toContain('w-full')
      expect(expander?.className).toContain('p-0')
      expect(expander?.className).toContain('m-0')
      expect(expander?.parentElement?.getAttribute('data-slot')).toBe('card')

      // Click to toggle
      fireEvent.click(expander!)
      expect(container.querySelector('[title="Recolher itens"]')).toBeTruthy()
    })

    it('does not render expander when hiddenBlocks is empty', async () => {
      window.location.hash = '#/workspaces/ws-1/widgets/timer'
      useTimerSettings.setState({
        widgetPosition: 'bottom',
        hiddenBlocks: [],
      })

      const { container } = renderWithProviders(<UltimateTimeTracker />)
      const expander = container.querySelector('[title="Expandir itens"]')
      expect(expander).toBeNull()
    })

    it('renders overview button in bar and opens popover with 3-mode switcher', async () => {
      window.location.hash = '#/workspaces/ws-1/widgets/timer'
      useTimerSettings.setState({
        widgetPosition: 'bottom',
        hiddenBlocks: [],
        miniMode: false,
      })

      const { container } = renderWithProviders(<UltimateTimeTracker />)
      const overviewButton = container.querySelector(
        '[data-testid="timerbar-overview-button"]',
      )
      expect(overviewButton).toBeTruthy()
      expect(overviewButton?.className).toContain('h-7 w-7')

      // Click to open popover
      await act(async () => {
        fireEvent.click(overviewButton!)
      })

      await waitFor(() => {
        expect(screen.getByText('Apontamentos de Horas')).toBeTruthy()
      })
      expect(screen.getByTestId('overview-tab-list')).toBeTruthy()
      expect(screen.getByTestId('overview-tab-weekly')).toBeTruthy()
      expect(screen.getByTestId('overview-tab-monthly')).toBeTruthy()

      // Switch to Weekly view
      await act(async () => {
        fireEvent.click(screen.getByTestId('overview-tab-weekly'))
      })
      expect(screen.getByTestId('overview-tab-weekly').className).toContain(
        'bg-primary',
      )

      // Switch to Monthly view
      await act(async () => {
        fireEvent.click(screen.getByTestId('overview-tab-monthly'))
      })
      expect(screen.getByTestId('overview-tab-monthly').className).toContain(
        'bg-primary',
      )
    })

    it('renders compact overview button in mini mode', async () => {
      window.location.hash = '#/workspaces/ws-1/widgets/timer'
      useTimerSettings.setState({
        widgetPosition: 'left',
        hiddenBlocks: [],
        miniMode: true,
      })

      const { container } = renderWithProviders(<UltimateTimeTracker />)
      const overviewButton = container.querySelector(
        '[data-testid="timerbar-overview-button"]',
      )
      expect(overviewButton).toBeTruthy()
      expect(overviewButton?.className).toContain('h-6 w-6')
    })
  })
})
