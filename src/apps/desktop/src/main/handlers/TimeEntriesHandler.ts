import {
  IListTimeEntriesUseCase,
  ITimeEntriesPullUseCase,
  ITimeEntriesPushUseCase,
  PushTimeEntriesInput,
} from '@mr-tick/application'
import { createResponseViewModel } from '@mr-tick/shared/helpers'
import { IRequest } from '@mr-tick/shared/transport'
import {
  PaginatedViewModel,
  SyncDocumentViewModel,
  TimeEntryViewModel,
  ViewModel,
} from '@mr-tick/shared/view-models'
import { IpcMainInvokeEvent } from 'electron'

import { HandlerBase } from '@/main/handlers/HandlerBase'

export interface ListTimeEntriesRequest {
  workspaceId: string
  connectionInstanceId: string
  startDate: Date
  endDate: Date
}

export interface PullTimeEntriesRequest {
  workspaceId: string
  connectionInstanceId: string
  checkpoint: { updatedAt: Date; id: string }
  batch: number
}

export class TimeEntriesHandler implements HandlerBase<TimeEntriesHandler> {
  constructor(
    private readonly listTimeEntriesService: IListTimeEntriesUseCase,
    private readonly timeEntriesPullService: ITimeEntriesPullUseCase,
    private readonly timeEntriesPushService: ITimeEntriesPushUseCase,
  ) {}

  public async listTimeEntries(
    event: IpcMainInvokeEvent,
    { body }: IRequest<ListTimeEntriesRequest>,
  ): Promise<PaginatedViewModel<TimeEntryViewModel[]>> {
    const result = await this.listTimeEntriesService.execute({
      workspaceId: body.workspaceId,
      connectionInstanceId: body.connectionInstanceId,
      startDate: body.startDate,
      endDate: body.endDate,
    })

    const mappedResult = result.map((paged) => ({
      data: paged.items.map((dto) => ({
        id: dto.id,
        task: dto.task,
        user: dto.user,
        activity: dto.activity,
        startDate: dto.startDate,
        endDate: dto.endDate,
        timeSpent: dto.timeSpent,
        comments: dto.comments,
        createdAt: dto.createdAt,
        updatedAt: dto.updatedAt,
      })),
      totalItems: paged.total,
      totalPages: Math.ceil(paged.total / paged.pageSize),
      currentPage: paged.page,
    }))

    return createResponseViewModel(mappedResult)
  }
  public async pull(
    event: IpcMainInvokeEvent,
    { body }: IRequest<PullTimeEntriesRequest>,
  ): Promise<ViewModel<TimeEntryViewModel[]>> {
    const result = await this.timeEntriesPullService.execute({
      workspaceId: body.workspaceId,
      connectionInstanceId: body.connectionInstanceId,
      checkpoint: body.checkpoint,
      batch: body.batch,
    })

    const mappedResult = result.map((items) =>
      items.map((dto) => ({
        id: dto.id,
        task: dto.task,
        user: dto.user,
        activity: dto.activity,
        startDate: dto.startDate,
        endDate: dto.endDate,
        timeSpent: dto.timeSpent,
        comments: dto.comments,
        createdAt: dto.createdAt,
        updatedAt: dto.updatedAt,
      })),
    )

    return createResponseViewModel(mappedResult)
  }

  public async push(
    event: IpcMainInvokeEvent,
    { body }: IRequest<PushTimeEntriesInput>,
  ): Promise<ViewModel<SyncDocumentViewModel<TimeEntryViewModel>[]>> {
    const result = await this.timeEntriesPushService.execute(body)

    return createResponseViewModel(result)
  }
}
