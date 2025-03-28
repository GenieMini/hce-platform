import core, {
  Ref,
  TxOperations,
  concatLink,
  Tx,
  TxProcessor,
  TxCUD,
  Doc,
  TxCreateDoc,
  TxUpdateDoc,
  MeasureContext,
  Markup
} from '@hcengineering/core'
import { Person } from '@hcengineering/contact'
import love, {
  getFreeRoomPlace,
  MeetingMinutes,
  ParticipantInfo,
  Room,
  RoomLanguage,
  TranscriptionStatus
} from '@hcengineering/love'
import { ConnectMeetingRequest } from '@hcengineering/ai-bot'
import chunter from '@hcengineering/chunter'
import { jsonToMarkup, MarkupNodeType } from '@hcengineering/text'

import config from '../config'

export class LoveController {
  private readonly roomSidById = new Map<Ref<Room>, string>()
  private readonly connectedRooms = new Set<Ref<Room>>()

  private participantsInfo: ParticipantInfo[] = []
  private rooms: Room[] = []
  private readonly meetingMinutes: MeetingMinutes[] = []

  constructor (
    private readonly workspace: string,
    private readonly ctx: MeasureContext,
    private readonly token: string,
    private readonly client: TxOperations,
    private readonly currentPerson: Person
  ) {
    void this.initData()
    setInterval(() => {
      void this.checkConnection()
    }, 5000)
  }

  txHandler (txes: Tx[]): void {
    const hierarchy = this.client.getHierarchy()
    for (const tx of txes) {
      if (!hierarchy.isDerived(tx._class, core.class.TxCUD)) continue
      const etx = TxProcessor.extractTx(tx) as TxCUD<Doc>

      if (etx._class === core.class.TxCreateDoc) {
        if (etx.objectClass === love.class.ParticipantInfo) {
          this.participantsInfo.push(TxProcessor.createDoc2Doc(etx as TxCreateDoc<ParticipantInfo>))
        } else if (etx.objectClass === love.class.Room) {
          this.rooms.push(TxProcessor.createDoc2Doc(etx as TxCreateDoc<Room>))
        }
      } else if (etx._class === core.class.TxRemoveDoc) {
        if (etx.objectClass === love.class.ParticipantInfo) {
          this.participantsInfo = this.participantsInfo.filter((p) => p._id !== etx.objectId)
        } else if (etx.objectClass === love.class.Room) {
          this.rooms = this.rooms.filter((r) => r._id !== etx.objectId)
        }
      } else if (etx._class === core.class.TxUpdateDoc) {
        if (etx.objectClass === love.class.ParticipantInfo) {
          this.participantsInfo = this.participantsInfo.map((p) => {
            if (p._id === etx.objectId) {
              return TxProcessor.updateDoc2Doc(p, etx as TxUpdateDoc<ParticipantInfo>)
            }
            return p
          })
        } else if (etx.objectClass === love.class.Room) {
          this.rooms = this.rooms.map((r) => {
            if (r._id === etx.objectId) {
              return TxProcessor.updateDoc2Doc(r, etx as TxUpdateDoc<Room>)
            }
            return r
          })
        }
      }
    }
  }

  async initData (): Promise<void> {
    this.participantsInfo = await this.client.findAll(love.class.ParticipantInfo, {})
    this.rooms = await this.client.findAll(love.class.Room, {})

    for (const p of this.participantsInfo) {
      if (p.person === this.currentPerson._id) {
        await this.client.remove(p)
      }
    }
  }

  async checkConnection (): Promise<void> {
    if (this.connectedRooms.size === 0) return

    for (const room of this.connectedRooms) {
      const roomParticipants = this.participantsInfo.filter(
        (p) => p.room === room && p.person !== this.currentPerson._id
      )
      if (roomParticipants.length === 0) {
        void this.disconnect(room)
      }
    }
  }

  async connect (request: ConnectMeetingRequest): Promise<void> {
    if (this.connectedRooms.has(request.roomId)) return

    this.roomSidById.set(request.roomId, request.roomSid)
    this.connectedRooms.add(request.roomId)

    const room = await this.getRoom(request.roomId)
    if (room === undefined) {
      this.roomSidById.delete(request.roomId)
      this.connectedRooms.delete(request.roomId)
      return
    }

    this.ctx.info('Connecting', { room: room.name, roomId: room._id })

    if (request.transcription) {
      const roomTokenName = getTokenRoomName(this.workspace, room.name, room._id)
      const isTranscriptionStarted = await startTranscription(this.token, roomTokenName, room.name, request.language)

      if (!isTranscriptionStarted) {
        this.roomSidById.delete(request.roomId)
        this.connectedRooms.delete(request.roomId)
        return
      }
    }

    await this.createAiParticipant(room)
  }

  async disconnect (roomId: Ref<Room>): Promise<void> {
    this.ctx.info('Disconnecting', { roomId })

    const participant = await this.getRoomParticipant(roomId, this.currentPerson._id)
    if (participant !== undefined) {
      await this.client.remove(participant)
    }

    const room = await this.getRoom(roomId)

    if (room !== undefined) {
      await stopTranscription(this.token, getTokenRoomName(this.workspace, room.name, room._id), room.name)
    }

    this.roomSidById.delete(roomId)
    this.connectedRooms.delete(roomId)
  }

  async processTranscript (text: string, person: Ref<Person>, roomId: Ref<Room>): Promise<void> {
    const room = await this.getRoom(roomId)
    const participant = await this.getRoomParticipant(roomId, person)

    if (room === undefined || participant === undefined) {
      return
    }

    const doc = await this.getMeetingMinutes(roomId, this.roomSidById.get(roomId) ?? '')
    const personAccount = this.client.getModel().getAccountByPersonId(participant.person)[0]
    if (doc === undefined) return

    await this.client.addCollection(
      chunter.class.ChatMessage,
      core.space.Workspace,
      doc._id,
      doc._class,
      'transcription',
      {
        message: this.transcriptToMarkup(text)
      },
      undefined,
      undefined,
      personAccount._id
    )
  }

  hasActiveConnections (): boolean {
    return this.connectedRooms.size > 0
  }

  async getRoom (ref: Ref<Room>): Promise<Room | undefined> {
    return this.rooms.find(({ _id }) => _id === ref) ?? (await this.client.findOne(love.class.Room, { _id: ref }))
  }

  async getRoomParticipant (room: Ref<Room>, person: Ref<Person>): Promise<ParticipantInfo | undefined> {
    return (
      this.participantsInfo.find((p) => p.room === room && p.person === person) ??
      (await this.client.findOne(love.class.ParticipantInfo, { room, person }))
    )
  }

  async getMeetingMinutes (room: Ref<Room>, sid: string): Promise<MeetingMinutes | undefined> {
    if (sid === '') return undefined

    const existing = this.meetingMinutes.find((m) => m.room === room && m.sid === sid)
    if (existing !== undefined) return existing

    const doc = await this.client.findOne(love.class.MeetingMinutes, {
      room,
      sid
    })

    if (doc === undefined) return

    this.meetingMinutes.push(doc)
    return doc
  }

  async createAiParticipant (room: Room): Promise<Ref<ParticipantInfo>> {
    const participants = await this.client.findAll(love.class.ParticipantInfo, { room: room._id })
    const currentInfo = participants.find((p) => p.person === this.currentPerson._id)

    if (currentInfo !== undefined) return currentInfo._id

    const place = getFreeRoomPlace(room, participants, this.currentPerson._id)
    const x: number = place.x
    const y: number = place.y

    return await this.client.createDoc(love.class.ParticipantInfo, core.space.Workspace, {
      x,
      y,
      room: room._id,
      person: this.currentPerson._id,
      name: this.currentPerson.name,
      sessionId: null
    })
  }

  transcriptToMarkup (transcript: string): Markup {
    return jsonToMarkup({
      type: MarkupNodeType.doc,
      content: [
        {
          type: MarkupNodeType.paragraph,
          content: [
            {
              type: MarkupNodeType.text,
              text: transcript
            }
          ]
        }
      ]
    })
  }
}

function getTokenRoomName (workspace: string, roomName: string, roomId: Ref<Room>): string {
  return `${workspace}_${roomName}_${roomId}`
}

async function startTranscription (
  token: string,
  roomTokenName: string,
  roomName: string,
  language: RoomLanguage
): Promise<boolean> {
  try {
    const endpoint = config.LoveEndpoint
    const res = await fetch(concatLink(endpoint, '/transcription'), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        roomName: roomTokenName,
        room: roomName,
        language,
        transcription: TranscriptionStatus.InProgress
      })
    })
    return res.ok
  } catch (err: any) {
    console.error('Failed to request start transcription', err)
    return false
  }
}

async function stopTranscription (token: string, roomTokenName: string, roomName: string): Promise<boolean> {
  try {
    const endpoint = config.LoveEndpoint
    const res = await fetch(concatLink(endpoint, '/transcription'), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ roomName: roomTokenName, room: roomName, transcription: TranscriptionStatus.Idle })
    })
    return res.ok
  } catch (err: any) {
    console.error('Failed to request stop transcription', err)
    return false
  }
}
