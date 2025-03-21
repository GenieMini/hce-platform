//
// Copyright © 2024 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import { cli, defineAgent, type JobContext, WorkerOptions, WorkerPermissions } from '@livekit/agents'
import { fileURLToPath } from 'node:url'
import { RemoteParticipant, RemoteTrack, RemoteTrackPublication, RoomEvent, TrackKind } from '@livekit/rtc-node'

import { STT } from './stt.js'
import { Metadata, TranscriptionStatus } from './type.js'

function parseMetadata (metadata: string): Metadata {
  try {
    return JSON.parse(metadata) as Metadata
  } catch (e) {
    console.error('Error parsing metadata', e)
  }

  return {}
}

function applyMetadata (data: string | undefined, stt: STT): void {
  if (data == null || data === '') return
  const metadata = parseMetadata(data)

  if (metadata.language != null) {
    stt.updateLanguage(metadata.language)
  }

  if (metadata.transcription === TranscriptionStatus.InProgress) {
    stt.start()
  } else if (
    metadata.transcription === TranscriptionStatus.Completed ||
    metadata.transcription === TranscriptionStatus.Idle
  ) {
    stt.stop()
  }
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect()
    await ctx.waitForParticipant()

    const roomName = ctx.room.name

    if (roomName === undefined) {
      console.error('Room name is undefined')
      ctx.shutdown()
      return
    }

    const stt = new STT(roomName)

    applyMetadata(ctx.room.metadata, stt)

    ctx.room.on(RoomEvent.RoomMetadataChanged, (data) => {
      applyMetadata(data, stt)
    })

    ctx.room.on(
      RoomEvent.TrackSubscribed,
      (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (publication.kind === TrackKind.KIND_AUDIO) {
          stt.subscribe(track, publication, participant)
        }
      }
    )

    ctx.room.on(
      RoomEvent.TrackUnsubscribed,
      (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (publication.kind === TrackKind.KIND_AUDIO) {
          stt.unsubscribe(track, publication, participant)
        }
      }
    )

    ctx.room.on(RoomEvent.TrackMuted, (publication) => {
      if (publication.kind === TrackKind.KIND_AUDIO) {
        stt.mute(publication.sid)
      }
    })

    ctx.room.on(RoomEvent.TrackUnmuted, (publication) => {
      if (publication.kind === TrackKind.KIND_AUDIO) {
        stt.unmute(publication.sid)
      }
    })

    ctx.addShutdownCallback(async () => {
      stt.close()
    })
  }
})

export function runAgent (): void {
  cli.runApp(
    new WorkerOptions({
      agent: fileURLToPath(import.meta.url),
      permissions: new WorkerPermissions(true, true, true, true, [], true)
    })
  )
}
