import WebSocket from 'ws'

const activeSidebands = new Map<string, WebSocket>()

export function openSideband(callId: string, apiKey: string, log: (msg: string, data?: unknown) => void): void {
  const ws = new WebSocket(
    `wss://api.openai.com/v1/realtime?call_id=${callId}`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  )

  activeSidebands.set(callId, ws)

  ws.on('open', () => log('sideband open', { callId }))
  ws.on('message', (data) => {
    const event = JSON.parse(data.toString())
    log('sideband event', { callId, event })
  })
  ws.on('error', (err) => log('sideband error', { callId, err }))
  ws.on('close', () => {
    log('sideband closed', { callId })
    activeSidebands.delete(callId)
  })
}

export function getSideband(callId: string): WebSocket | undefined {
  return activeSidebands.get(callId)
}
