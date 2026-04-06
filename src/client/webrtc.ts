import { initDataChannel, cleanupDataChannel } from './datachannel'

let pc: RTCPeerConnection | null = null
let localStream: MediaStream | null = null

let localStreamCb:  ((s: MediaStream) => void) | null = null
let remoteStreamCb: ((s: MediaStream) => void) | null = null
export function onLocalStream (cb: (s: MediaStream) => void): void { localStreamCb  = cb }
export function onRemoteStream(cb: (s: MediaStream) => void): void { remoteStreamCb = cb }

export async function startSession(systemPrompt = '', provider = ''): Promise<void> {
  // 1. Get microphone access
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true })
  localStreamCb?.(localStream)

  // 2. Create peer connection
  pc = new RTCPeerConnection()

  // 3. Add audio tracks; wire remote audio playback
  for (const track of localStream.getTracks()) {
    pc.addTrack(track, localStream)
  }

  pc.ontrack = (event) => {
    const audio = document.createElement('audio')
    audio.autoplay = true
    audio.style.display = 'none'
    audio.srcObject = event.streams[0]
    document.body.appendChild(audio)
    remoteStreamCb?.(event.streams[0])
  }

  // 4. Create data channel
  const dataChannel = pc.createDataChannel('oai-events')
  initDataChannel(dataChannel)

  // 5. Create and set local SDP offer
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)

  // 6. POST SDP offer to server (server proxies to provider)
  const params = new URLSearchParams()
  if (systemPrompt) params.set('instructions', systemPrompt)
  if (provider) params.set('provider', provider)
  const qs = params.toString()
  const url = qs ? `/api/session?${qs}` : '/api/session'
  const sdpRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp' },
    body: offer.sdp,
  })

  if (!sdpRes.ok) {
    throw new Error(`SDP exchange failed: ${sdpRes.status}`)
  }

  // 7. Set remote SDP answer
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
    pc.ontrack = null
    pc.close()
    pc = null
  }

  // Release and remove any injected audio elements
  for (const el of Array.from(document.querySelectorAll('audio'))) {
    el.srcObject = null
    el.remove()
  }
}
