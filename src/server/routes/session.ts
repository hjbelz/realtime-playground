import type { FastifyInstance } from 'fastify'

export async function sessionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/session', async (request, reply) => {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return reply.status(500).send({ error: 'OPENAI_API_KEY not set' })
    }

    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'alloy',
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      fastify.log.error({ status: response.status, body: text }, 'OpenAI session error')
      return reply.status(502).send({ error: 'Failed to create OpenAI session' })
    }

    const data = await response.json()
    return reply.send(data)
  })
}
