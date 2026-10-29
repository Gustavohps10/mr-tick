import { EventEmitter } from 'node:events'
import * as net from 'node:net'

export interface DiscordRpcPayloadArgs {
  readonly guild_id?: string
}

export interface DiscordRpcPayload {
  readonly cmd?: string
  readonly evt?: string
  readonly nonce?: string
  readonly args?: DiscordRpcPayloadArgs
  readonly data?: Record<
    string,
    string | number | boolean | null | object | undefined
  >
}

export interface DiscordRpcMockFrame {
  readonly opcode: number
  readonly payload: DiscordRpcPayload
}

export interface DiscordRpcServerStats {
  handshakesCount: number
  authenticationsCount: number
  subscriptionsCount: number
  commandsCount: number
  eventsDispatchedCount: number
  receivedNonces: string[]
}

/**
 * Servidor RPC mock puro de named pipe / socket IPC para testes E2E do addon Discord.
 * Implementa o framing LE de 8 bytes [opcode (int32), length (int32)] e o protocolo de IPC do Discord Desktop.
 * Não substitui bridge, SDK nem runtime por mocks; apenas fornece o endpoint externo de loopback.
 */
export class DiscordMockRpcServer extends EventEmitter {
  private server: net.Server | null = null
  private activeSocket: net.Socket | null = null
  private readonly pipePath: string

  public readonly stats: DiscordRpcServerStats = {
    handshakesCount: 0,
    authenticationsCount: 0,
    subscriptionsCount: 0,
    commandsCount: 0,
    eventsDispatchedCount: 0,
    receivedNonces: [],
  }

  constructor(pipePath: string) {
    super()
    this.pipePath = pipePath
  }

  public getPipePath(): string {
    return this.pipePath
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        this.activeSocket = socket
        let rxBuffer = Buffer.alloc(0)

        socket.on('data', (chunk) => {
          rxBuffer = Buffer.concat([rxBuffer, chunk])

          while (rxBuffer.length >= 8) {
            const opcode = rxBuffer.readInt32LE(0)
            const length = rxBuffer.readInt32LE(4)

            if (rxBuffer.length < 8 + length) {
              break
            }

            const payloadBuf = rxBuffer.subarray(8, 8 + length)
            rxBuffer = Buffer.from(rxBuffer.subarray(8 + length))

            try {
              const payload: DiscordRpcPayload = JSON.parse(
                payloadBuf.toString('utf8'),
              )
              this.handleIncomingFrame(opcode, payload)
            } catch (err) {
              this.emit('error', new Error(`MALFORMED_RPC_FRAME: ${err}`))
            }
          }
        })

        socket.on('close', () => {
          if (this.activeSocket === socket) {
            this.activeSocket = null
          }
          this.emit('clientDisconnected')
        })

        socket.on('error', (err) => {
          this.emit('clientError', err)
        })
      })

      server.on('error', (err) => {
        reject(err)
      })

      server.listen(this.pipePath, () => {
        this.server = server
        resolve()
      })
    })
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.activeSocket) {
        this.activeSocket.destroy()
        this.activeSocket = null
      }
      if (!this.server) {
        resolve()
        return
      }
      this.server.close(() => {
        this.server = null
        resolve()
      })
    })
  }

  public sendFrame(opcode: number, payload: DiscordRpcPayload): void {
    if (!this.activeSocket || this.activeSocket.destroyed) {
      throw new Error(
        'CANNOT_SEND_FRAME: No active client socket connected to mock Discord RPC server',
      )
    }
    const jsonStr = JSON.stringify(payload)
    const jsonBuf = Buffer.from(jsonStr, 'utf8')
    const header = Buffer.alloc(8)
    header.writeInt32LE(opcode, 0)
    header.writeInt32LE(jsonBuf.length, 4)
    this.activeSocket.write(Buffer.concat([header, jsonBuf]))
  }

  public dispatchVoiceChannelSelect(data: {
    channelId: string | null
    guildId?: string
  }): void {
    this.stats.eventsDispatchedCount++
    this.sendFrame(1, {
      cmd: 'DISPATCH',
      evt: 'VOICE_CHANNEL_SELECT',
      data: {
        channel_id: data.channelId,
        guild_id: data.guildId,
      },
    })
  }

  public simulateDropAndReconnect(): void {
    if (this.activeSocket) {
      this.activeSocket.destroy()
      this.activeSocket = null
    }
  }

  private handleIncomingFrame(
    opcode: number,
    payload: DiscordRpcPayload,
  ): void {
    this.emit('frame', { opcode, payload })

    if (payload.nonce) {
      this.stats.receivedNonces.push(String(payload.nonce))
    }

    // 1. Handshake (Opcode 0)
    if (opcode === 0) {
      this.stats.handshakesCount++
      this.emit('handshake', payload)
      this.sendFrame(1, {
        cmd: 'DISPATCH',
        evt: 'READY',
        data: {
          v: 1,
          config: {
            api_endpoint: '//discord.com/api',
            environment: 'production',
          },
          user: {
            id: '999111222333444555',
            username: 'discord.tester',
            discriminator: '0',
            global_name: 'Discord Tester User',
            avatar: null,
          },
        },
      })
      return
    }

    // 2. Authentication (Opcode 1, cmd: AUTHENTICATE)
    if (payload.cmd === 'AUTHENTICATE') {
      this.stats.authenticationsCount++
      this.emit('authenticated', payload)
      this.sendFrame(1, {
        cmd: 'AUTHENTICATE',
        nonce: payload.nonce,
        data: {
          application: {
            id: '1372352088457220126',
            name: 'Mister Tick Observer',
          },
          scopes: ['rpc', 'rpc.voice.read'],
          expires: new Date(Date.now() + 86400000).toISOString(),
          user: {
            id: '999111222333444555',
            username: 'discord.tester',
            discriminator: '0',
            global_name: 'Discord Tester User',
            avatar: null,
          },
        },
      })
      return
    }

    // 3. Subscription (Opcode 1, cmd: SUBSCRIBE)
    if (payload.cmd === 'SUBSCRIBE') {
      this.stats.subscriptionsCount++
      this.emit('subscribed', payload)
      this.sendFrame(1, {
        cmd: 'SUBSCRIBE',
        evt: payload.evt,
        nonce: payload.nonce,
        data: { evt: payload.evt },
      })
      return
    }

    // 4. Command Requests
    this.stats.commandsCount++

    if (payload.cmd === 'GET_GUILDS') {
      this.sendFrame(1, {
        cmd: 'GET_GUILDS',
        nonce: payload.nonce,
        data: {
          guilds: [
            { id: 'guild-eng-100', name: 'Engenharia de Software' },
            { id: 'guild-ops-200', name: 'Operações e Infra' },
          ],
        },
      })
      return
    }

    if (payload.cmd === 'GET_CHANNELS') {
      const guildId = payload.args?.guild_id
      let channels = [
        { id: 'chan-warroom-201', name: 'War Room Incidents', type: 2 },
      ]
      if (guildId === 'guild-eng-100') {
        channels = [
          { id: 'chan-daily-101', name: 'Daily Standup', type: 2 },
          { id: 'chan-pair-102', name: 'Pair Programming', type: 2 },
        ]
      }

      this.sendFrame(1, {
        cmd: 'GET_CHANNELS',
        nonce: payload.nonce,
        data: { channels },
      })
      return
    }

    if (payload.cmd === 'GET_SELECTED_VOICE_CHANNEL') {
      this.sendFrame(1, {
        cmd: 'GET_SELECTED_VOICE_CHANNEL',
        nonce: payload.nonce,
        data: {
          id: 'chan-daily-101',
          guild_id: 'guild-eng-100',
          name: 'Daily Standup',
          type: 2,
        },
      })
      return
    }

    // Fallback genérico para comandos não tratados
    this.sendFrame(1, {
      cmd: payload.cmd,
      nonce: payload.nonce,
      data: {},
    })
  }
}
