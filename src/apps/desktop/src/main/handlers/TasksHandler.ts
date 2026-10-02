import {
  IListTasksUseCase,
  ITaskPullUseCase,
  TaskDTO,
} from '@mr-tick/application'
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

export interface ListTasksRequest {
  workspaceId: string
  connectionInstanceId: string
  search?: string
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
    private readonly listTasksService: IListTasksUseCase,
    private readonly taskPullService: ITaskPullUseCase,
  ) {}

  public async listTasks(
    event: IpcMainInvokeEvent,
    { body }: IRequest<ListTasksRequest>,
  ): Promise<PaginatedViewModel<TaskViewModel[]>> {
    const result = await this.listTasksService.execute({
      workspaceId: body.workspaceId,
      connectionInstanceId: body.connectionInstanceId,
      search: body.search,
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
