import net from 'node:net'

import { describe, expect, it } from 'vitest'

import { DiscordMockRpcServer } from '../e2e/fixtures/discord-mock-rpc-server'

describe('DiscordMockRpcServer (Harness Transport Seam)', () => {
  it('estabelece conexão, realiza handshake (opcode 0) e responde READY com framing LE correto', async () => {
    const pipeName =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\test-discord-mock-${Date.now()}`
        : `/tmp/test-discord-mock-${Date.now()}.sock`

    const server = new DiscordMockRpcServer(pipeName)
    await server.start()

    try {
      const client = net.connect(pipeName)

      const readyPromise = new Promise<{
        opcode: number
        payload: {
          cmd?: string
          evt?: string
          data?: { user?: { username?: string } }
        }
      }>((resolve) => {
        let rx = Buffer.alloc(0)
        client.on('data', (chunk) => {
          rx = Buffer.concat([rx, chunk])
          if (rx.length >= 8) {
            const opcode = rx.readInt32LE(0)
            const length = rx.readInt32LE(4)
            if (rx.length >= 8 + length) {
              const payload = JSON.parse(
                rx.subarray(8, 8 + length).toString('utf8'),
              )
              resolve({ opcode, payload })
            }
          }
        })
      })

      // Envia Handshake Opcode 0
      const handshakePayload = JSON.stringify({ v: 1, client_id: 'test-app' })
      const jsonBuf = Buffer.from(handshakePayload, 'utf8')
      const header = Buffer.alloc(8)
      header.writeInt32LE(0, 0)
      header.writeInt32LE(jsonBuf.length, 4)
      client.write(Buffer.concat([header, jsonBuf]))

      const { opcode, payload } = await readyPromise

      expect(opcode).toBe(1)
      expect(payload.cmd).toBe('DISPATCH')
      expect(payload.evt).toBe('READY')
      expect(payload.data?.user?.username).toBe('discord.tester')
      expect(server.stats.handshakesCount).toBe(1)

      client.destroy()
    } finally {
      await server.stop()
    }
  })
})
