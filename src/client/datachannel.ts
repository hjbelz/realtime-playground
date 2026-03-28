type EventHandler = (e: { type: string; [k: string]: unknown }) => void

let dc: RTCDataChannel | null = null
const handlers: EventHandler[] = []

export function initDataChannel(channel: RTCDataChannel): void {
  dc = channel

  dc.onopen = () => {
    console.log('[datachannel] open')
  }

  dc.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data as string) as { type: string; [k: string]: unknown }
      for (const handler of handlers) {
        handler(parsed)
      }
    } catch (err) {
      console.error('[datachannel] failed to parse message', err)
    }
  }

  dc.onclose = () => {
    console.log('[datachannel] closed')
  }

  dc.onerror = (err) => {
    console.error('[datachannel] error', err)
  }
}

export function sendEvent(event: { type: string; [k: string]: unknown }): void {
  if (!dc || dc.readyState !== 'open') {
    console.warn('[datachannel] cannot send, channel not open')
    return
  }
  dc.send(JSON.stringify(event))
}

export function onDataChannelMessage(handler: EventHandler): void {
  handlers.push(handler)
}

export function cleanupDataChannel(): void {
  if (dc) {
    dc.onopen = null
    dc.onmessage = null
    dc.onclose = null
    dc.onerror = null
    dc.close()
    dc = null
  }
}
