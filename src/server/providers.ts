export interface RealtimeProvider {
  readonly name: 'OpenAI' | 'Azure'
  exchangeSdp(sdpOffer: string, sessionConfig: object): Promise<{ sdpAnswer: string; callId: string | null }>
  sidebandUrl(callId: string): string
  sidebandHeaders(): Record<string, string>
  toString(): string
}

class OpenAIProvider implements RealtimeProvider {
  readonly name = 'OpenAI' as const
  #apiKey: string

  constructor(apiKey: string) {
    this.#apiKey = apiKey
  }

  toString(): string {
    return 'OpenAIProvider with key ending in ' + this.#apiKey.slice(-4)
  }

  async exchangeSdp(sdpOffer: string, sessionConfig: object): Promise<{ sdpAnswer: string; callId: string | null }> {
    const fd = new FormData()
    fd.set('sdp', sdpOffer)
    fd.set('session', JSON.stringify(sessionConfig))

    const res = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.#apiKey}`,
      },
      body: fd,
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`OpenAI SDP exchange failed (${res.status}): ${text}`)
    }
    const callId = res.headers.get('Location')?.split('/').pop() ?? null
    const sdpAnswer = await res.text()
    return { sdpAnswer, callId }
  }

  sidebandUrl(callId: string): string {
    return `wss://api.openai.com/v1/realtime?call_id=${callId}`
  }

  sidebandHeaders(): Record<string, string> {
    return { 'Authorization': `Bearer ${this.#apiKey}` }
  }
}

class AzureProvider implements RealtimeProvider {
  readonly name = 'Azure' as const
  #apiKey: string
  #endpoint: string
  #host: string

  constructor(apiKey: string, endpoint: string) {
    this.#apiKey = apiKey
    this.#endpoint = endpoint
    this.#host = new URL(endpoint).host
  }

  toString(): string {
    return 'AzureProvider with key ending in ' + this.#apiKey.slice(-4) + ' and endpoint ' + this.#endpoint
  }

  async exchangeSdp(sdpOffer: string, sessionConfig: object): Promise<{ sdpAnswer: string; callId: string | null }> {
    // Azure uses ephemeral tokens: get token first, then exchange SDP
    const tokenRes = await fetch(`${this.#endpoint}/openai/v1/realtime/client_secrets`, {
      method: 'POST',
      headers: {
        'api-key': this.#apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ session: sessionConfig }),
    })
    if (!tokenRes.ok) {
      const text = await tokenRes.text()
      throw new Error(`Azure client_secrets failed (${tokenRes.status}): ${text}`)
    }
    const tokenData = await tokenRes.json() as { value: string }
    const token = tokenData.value

    const res = await fetch(`${this.#endpoint}/openai/v1/realtime/calls`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/sdp',
      },
      body: sdpOffer,
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Azure SDP exchange failed (${res.status}): ${text}`)
    }
    const callId = res.headers.get('Location')?.split('/').pop() ?? null
    const sdpAnswer = await res.text()
    return { sdpAnswer, callId }
  }

  sidebandUrl(callId: string): string {
    return `wss://${this.#host}/openai/v1/realtime?call_id=${callId}`
  }

  sidebandHeaders(): Record<string, string> {
    return { 'api-key': this.#apiKey }
  }
}

export function createProvider(): RealtimeProvider {
  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey) {
    return new OpenAIProvider(openaiKey)
  }

  const azureKey = process.env.AZURE_OPENAI_KEY
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT
  if (azureKey && azureEndpoint) {
    return new AzureProvider(azureKey, azureEndpoint)
  }

  throw new Error('No provider configured. Set OPENAI_API_KEY or AZURE_OPENAI_KEY + AZURE_OPENAI_ENDPOINT.')
}
