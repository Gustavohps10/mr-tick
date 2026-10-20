import {
  ActivitiesLayout,
  AddonsLayout,
  AppLayout,
  HomeLayout,
  TimeEntriesLayout,
  WidgetLayout,
  WorkspaceLayout,
} from '@mr-tick/ui/layouts'
import {
  Activities,
  Backlog,
  Error,
  Metrics,
  Notes,
  NotFound,
  TimeEntries,
  TimeEntriesCalendar,
  TimeEntriesTimesheet,
  TimerWidget,
  WorkspaceSettings,
} from '@mr-tick/ui/pages'
import { createHashRouter, Navigate } from 'react-router-dom'

export const router = createHashRouter([
  // 1. ROTAS ISOLADAS DE WIDGETS (Fora do AppLayout)
  {
    path: 'widgets',
    element: <WidgetLayout />,
    errorElement: <Error />,
    children: [
      {
        errorElement: <Error />,
        children: [
          { path: 'timer', element: <TimerWidget /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
  {
    path: 'workspaces/:workspaceId/widgets',
    element: <WidgetLayout />,
    errorElement: <Error />,
    children: [
      {
        errorElement: <Error />,
        children: [
          { path: 'timer', element: <TimerWidget /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },

  // 2. APLICAÇÃO PRINCIPAL (Com AppRail, Sidebars e Layout Padrão)
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <Error />,
    children: [
      {
        errorElement: <Error />,
        children: [
          {
            path: '/',
            element: <HomeLayout />,
            children: [
              {
                errorElement: <Error />,
                children: [
                  { index: true, element: <div>Home</div> },
                  { path: 'about', element: <div>About</div> },
                  { path: 'contact', element: <div>Contact</div> },
                  { path: '*', element: <NotFound /> },
                ],
              },
            ],
          },
          {
            path: 'workspaces/:workspaceId',
            element: <WorkspaceLayout />,
            children: [
              {
                errorElement: <Error />,
                children: [
                  {
                    index: true,
                    element: <Navigate to="time-entries" replace />,
                  },
                  { path: 'notes', element: <Notes /> },
                  {
                    path: 'time-entries',
                    element: <TimeEntriesLayout />,
                    children: [
                      {
                        errorElement: <Error />,
                        children: [
                          { index: true, element: <TimeEntries /> },
                          {
                            path: 'calendar',
                            element: <TimeEntriesCalendar />,
                          },
                          {
                            path: 'timesheet',
                            element: <TimeEntriesTimesheet />,
                          },
                          { path: '*', element: <NotFound /> },
                        ],
                      },
                    ],
                  },
                  { path: 'my-metric', element: <Metrics /> },
                  {
                    path: 'activities',
                    element: <ActivitiesLayout />,
                    children: [
                      {
                        errorElement: <Error />,
                        children: [
                          { index: true, element: <Activities /> },
                          { path: 'backlog', element: <Backlog /> },
                          { path: '*', element: <NotFound /> },
                        ],
                      },
                    ],
                  },
                  { path: 'settings', element: <WorkspaceSettings /> },
                  { path: 'addons', element: <AddonsLayout /> },
                  { path: '*', element: <NotFound /> },
                ],
              },
            ],
          },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
])
