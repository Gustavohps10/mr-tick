import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { registerSearchTool, registerSourceTools } from 'fumadocs-core/mcp'
import { createFromSource } from 'fumadocs-core/search/server'

import { docsLlms, source } from '@/lib/source'

const handler = createMcpHandler(() => {
  const server = new McpServer({
    name: 'mr-tick-docs',
    version: '1.0.0',
  })

  registerSourceTools(server, source, docsLlms)
  registerSearchTool(server, createFromSource(source))

  return server
})

export function GET(request: Request) {
  return handler.fetch(request)
}

export function POST(request: Request) {
  return handler.fetch(request)
}

export function DELETE(request: Request) {
  return handler.fetch(request)
}
