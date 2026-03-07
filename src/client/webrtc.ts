import { initDataChannel, cleanupDataChannel } from './datachannel'

let pc: RTCPeerConnection | null = null
let localStream: MediaStream | null = null

export async function startSession(): Promise<void> {
  // 1. Get ephemeral key from server
  const sessionRes = await fetch('/api/session')
  if (!sessionRes.ok) {
    throw new Error(`Session request failed: ${sessionRes.status}`)
  }
  const sessionData = await sessionRes.json() as { client_secret: { value: string } }
  const ephemeralKey = sessionData.client_secret.value

  // 2. Get microphone access
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true })

  // 3. Create peer connection
  pc = new RTCPeerConnection()

  // 4. Add audio tracks; wire remote audio playback
  for (const track of localStream.getTracks()) {
    pc.addTrack(track, localStream)
  }

  pc.ontrack = (event) => {
    const audio = document.createElement('audio')
    audio.autoplay = true
    audio.style.display = 'none'
    audio.srcObject = event.streams[0]
    document.body.appendChild(audio)
  }

  // 5. Create data channel
  const dataChannel = pc.createDataChannel('oai-events')
  initDataChannel(dataChannel)

  // 6. Create and set local SDP offer
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)

  // 7. POST SDP offer to OpenAI
  const sdpRes = await fetch(
    'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
    }
  )

  if (!sdpRes.ok) {
    throw new Error(`SDP exchange failed: ${sdpRes.status}`)
  }

  // 8. Set remote SDP answer
  const sdpAnswer = await sdpRes.text()
  await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer })
}

export function stopSession(): void {
  cleanupDataChannel()

  if (localStream) {
    for (const track of localStream.getTracks()) {
      track.stop()
    }
    localStream = null
  }

  if (pc) {
    pc.close()
    pc = null
  }

  // Remove any injected audio elements
  for (const el of Array.from(document.querySelectorAll('audio'))) {
    el.remove()
  }
}
