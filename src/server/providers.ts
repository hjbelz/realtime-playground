export interface RealtimeProvider {
  getEphemeralToken(sessionConfig: object): Promise<string>
  exchangeSdp(token: string, sdpOffer: string): Promise<{ sdpAnswer: string; callId: string | null }>
  sidebandUrl(callId: string): string
  sidebandHeaders(): Record<string, string>
}

class OpenAIProvider implements RealtimeProvider {
  #apiKey: string

  constructor(apiKey: string) {
    this.#apiKey = apiKey
  }

  async getEphemeralToken(sessionConfig: object): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.#apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ session: sessionConfig }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`OpenAI client_secrets failed (${res.status}): ${text}`)
    }
    const data = await res.json() as { client_secret: { value: string } }
    return data.client_secret.value
  }

  async exchangeSdp(token: string, sdpOffer: string): Promise<{ sdpAnswer: string; callId: string | null }> {
    const res = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/sdp',
      },
      body: sdpOffer,
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
  #apiKey: string
  #endpoint: string
  #host: string

  constructor(apiKey: string, endpoint: string) {
    this.#apiKey = apiKey
    this.#endpoint = endpoint
    this.#host = new URL(endpoint).host
  }

  async getEphemeralToken(sessionConfig: object): Promise<string> {
    const res = await fetch(`${this.#endpoint}/openai/v1/realtime/client_secrets`, {
      method: 'POST',
      headers: {
        'api-key': this.#apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ session: sessionConfig }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Azure client_secrets failed (${res.status}): ${text}`)
    }
    const data = await res.json() as { value: string }
    return data.value
  }

  async exchangeSdp(token: string, sdpOffer: string): Promise<{ sdpAnswer: string; callId: string | null }> {
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
