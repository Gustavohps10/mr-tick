import { randomUUID } from 'node:crypto'

import { ITaskPullUseCase, TaskDTO } from '@mr-tick/application'
import { createResponseViewModel } from '@mr-tick/shared/helpers'
import { IRequest } from '@mr-tick/shared/transport'
import {
  PaginatedViewModel,
  TaskViewModel,
  ViewModel,
} from '@mr-tick/shared/view-models'
import { IpcMainInvokeEvent } from 'electron'

import { HandlerBase } from '@/main/handlers/HandlerBase'
import { MetadataHandler } from '@/main/handlers/MetadataHandler'
import { TaskLookupService } from '@/main/services/tasks/TaskLookupService'

export interface ListTasksRequest {
  workspaceId: string
  connectionInstanceId: string
  search?: string
  consumerId?: string
  ids?: string[]
  page?: number
  pageSize?: number
}

export interface PullTasksRequest {
  workspaceId: string
  connectionInstanceId: string
  checkpoint: { updatedAt: Date; id: string }
  batch: number
}

export class TasksHandler implements HandlerBase<MetadataHandler> {
  constructor(
    private readonly taskLookupService: TaskLookupService,
    private readonly taskPullService: ITaskPullUseCase,
  ) {}

  public async cancelSearch(
    event: IpcMainInvokeEvent,
    {
      body,
    }: IRequest<{
      workspaceId: string
      connectionInstanceId: string
      consumerId: string
    }>,
  ): Promise<void> {
    this.taskLookupService.cancel(
      body.workspaceId,
      body.connectionInstanceId,
      `${event.sender.id}:${body.consumerId}`,
    )
  }

  public async listTasks(
    event: IpcMainInvokeEvent,
    { body }: IRequest<ListTasksRequest>,
  ): Promise<PaginatedViewModel<TaskViewModel[]>> {
    let consumerId = `${event.sender.id}:request:${randomUUID()}`
    if (body.consumerId !== undefined)
      consumerId = `${event.sender.id}:${body.consumerId}`
    const result = await this.taskLookupService.execute({
      workspaceId: body.workspaceId,
      connectionInstanceId: body.connectionInstanceId,
      search: body.search,
      consumerId,
      ids: body.ids,
      page: body.page,
      pageSize: body.pageSize,
    })

    const mappedResult = result.map((paged) => ({
      data: paged.items.map((task) => ({
        ...task,
      })),
      totalItems: paged.total,
      totalPages: Math.ceil(paged.total / (paged.pageSize || 1)),
      currentPage: paged.page || 1,
    }))

    return createResponseViewModel(mappedResult)
  }

  public async pull(
    event: IpcMainInvokeEvent,
    { body }: IRequest<PullTasksRequest>,
  ): Promise<ViewModel<TaskDTO[]>> {
    const result = await this.taskPullService.execute({
      workspaceId: body.workspaceId,
      connectionInstanceId: body.connectionInstanceId,
      checkpoint: body.checkpoint,
      batch: body.batch,
    })

    return createResponseViewModel(result)
  }
}
