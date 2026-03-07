import { startSession, stopSession } from './webrtc'
import { onDataChannelMessage } from './datachannel'

const startBtn = document.getElementById('start') as HTMLButtonElement
const stopBtn = document.getElementById('stop') as HTMLButtonElement
const statusDiv = document.getElementById('status') as HTMLDivElement
const eventsDiv = document.getElementById('events') as HTMLDivElement

function setStatus(text: string): void {
  statusDiv.textContent = text
}

function logEvent(event: { type: string; [k: string]: unknown }): void {
  const line = document.createElement('div')
  line.textContent = JSON.stringify(event)
  eventsDiv.appendChild(line)
  eventsDiv.scrollTop = eventsDiv.scrollHeight
}

onDataChannelMessage(logEvent)

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true
  stopBtn.disabled = false
  setStatus('Connecting...')
  try {
    await startSession()
    setStatus('Connected')
  } catch (err) {
    console.error(err)
    setStatus(`Error: ${(err as Error).message}`)
    startBtn.disabled = false
    stopBtn.disabled = true
  }
})

stopBtn.addEventListener('click', () => {
  stopSession()
  stopBtn.disabled = true
  startBtn.disabled = false
  setStatus('Idle')
})
