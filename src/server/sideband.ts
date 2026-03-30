import WebSocket from 'ws'

const activeSidebands = new Map<string, WebSocket>()

export function openSideband(wsUrl: string, headers: Record<string, string>, log: (msg: string, data?: unknown) => void): void {
  const ws = new WebSocket(wsUrl, { headers })

  const id = wsUrl
  activeSidebands.set(id, ws)

  ws.on('open', () => log('sideband open', { url: wsUrl }))
  ws.on('message', (data) => {
    const event = JSON.parse(data.toString())
    log('sideband event', { event })
  })
  ws.on('error', (err) => log('sideband error', { url: wsUrl, err }))
  ws.on('close', () => {
    log('sideband closed', { url: wsUrl })
    activeSidebands.delete(id)
  })
}

export function getSideband(id: string): WebSocket | undefined {
  return activeSidebands.get(id)
}
