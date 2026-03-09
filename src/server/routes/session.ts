import type { FastifyInstance } from 'fastify'

const sessionConfig = JSON.stringify({
  type: "realtime",
  model: "gpt-realtime",
  audio: { output: { voice: "marin" } },
});


export async function sessionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addContentTypeParser('application/sdp', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body)
  })

  fastify.post('/session', async (request, reply) => {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return reply.status(500).send({ error: 'OPENAI_API_KEY not set' })
    }

    const sdpOffer = request.body as string

    const fd = new FormData();
    fd.set("sdp", sdpOffer);
    fd.set("session", sessionConfig);

    try {
      const response = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: fd,
      })

      if (!response.ok) {
        const text = await response.text()
        fastify.log.error({ status: response.status, body: text }, 'OpenAI session error')
        return reply.status(502).send({ error: 'Failed to create OpenAI session' })
      }

      const sdpAnswer = await response.text()
      return reply.send(sdpAnswer)

    } catch (error) {
      fastify.log.error(error, 'Error creating OpenAI session')
      return reply.status(500).send({ error: 'Internal server error: Error creating OpenAI session' })
    }
  })
}
