import {
  IWorkspacesRepository,
  PagedResultDTO,
  PaginationOptionsDTO,
} from '@mr-tick/application'
import { DataSourceConnection, Workspace } from '@mr-tick/domain'
import { promises as fs } from 'fs'
import path from 'path'

type PlainWorkspace = {
  id: string
  name: string
  avatarUrl?: string
  status: 'draft' | 'configured'
  description?: string
  dataSourceConnections: {
    id: string
    dataSourceId: string
    status: 'connected' | 'disabled' | 'disconnected'
    member?: {
      id: string
      name: string
      login: string
      avatarUrl?: string
    }
    config?: Record<string, string | number | boolean>
  }[]
  createdAt: string
  updatedAt: string
}

export class JSONWorkspacesRepository implements IWorkspacesRepository {
  private readonly filePath: string

  constructor(storagePath: string) {
    this.filePath = path.join(storagePath, 'workspaces.json')
  }

  private async readWorkspaces(): Promise<Workspace[]> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8')
      const plain: PlainWorkspace[] = JSON.parse(data)

      return plain.map((p) =>
        Workspace.hydrate({
          id: p.id,
          avatarUrl: p.avatarUrl,
          status: p.status,
          description: p.description,
          name: p.name,
          dataSourceConnections: p.dataSourceConnections ?? [],
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt),
        }),
      )
    } catch (err) {
      const isNotFound =
        err instanceof Error &&
        'code' in err &&
        (err as { code: string }).code === 'ENOENT'
      if (!isNotFound) {
        console.log(err)
      }
      return []
    }
  }

  private async writeWorkspaces(workspaces: Workspace[]): Promise<void> {
    const plain: PlainWorkspace[] = workspaces.map((ws) => ({
      id: ws.id,
      name: ws.name,
      avatarUrl: ws.avatarUrl,
      status: ws.status,
      description: ws.description,
      dataSourceConnections: ws.dataSourceConnections.map(
        (c: DataSourceConnection) => ({
          id: c.id,
          status: c.status,
          dataSourceId: c.dataSourceId,
          config: c.config,
          member: c.member,
        }),
      ),
      createdAt: ws.createdAt.toISOString(),
      updatedAt: ws.updatedAt.toISOString(),
    }))

    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    await fs.writeFile(this.filePath, JSON.stringify(plain, null, 2))
  }

  public async findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<PagedResultDTO<Workspace>> {
    const items = await this.readWorkspaces()
    const page = pagination?.page ?? 1
    const pageSize = pagination?.pageSize ?? 10
    const start = (page - 1) * pageSize
    const pagedItems = items.slice(start, start + pageSize)

    return { items: pagedItems, total: items.length, page, pageSize }
  }

  public async findById(id: string): Promise<Workspace | undefined> {
    const items = await this.readWorkspaces()
    return items.find((ws) => ws.id === id)
  }

  public async create(entity: Workspace): Promise<void> {
    const items = await this.readWorkspaces()
    items.push(entity)
    await this.writeWorkspaces(items)
  }

  public async update(entity: Workspace): Promise<void> {
    const items = await this.readWorkspaces()
    const index = items.findIndex((ws) => ws.id === entity.id)
    if (index !== -1) {
      items[index] = entity
      await this.writeWorkspaces(items)
    }
  }

  public async delete(id: string): Promise<void> {
    const items = await this.readWorkspaces()
    const filtered = items.filter((ws) => ws.id !== id)
    if (filtered.length !== items.length) {
      await this.writeWorkspaces(filtered)
    }
  }
}
