import type { FastifyInstance } from 'fastify'
import { openSideband } from '../sideband.js'

function buildSessionConfig(instructions?: string): string {
  return JSON.stringify({
    type: "realtime",
    model: "gpt-realtime",
    ...(instructions ? { instructions } : {}),
    audio: {
      output: {
        voice: "marin"
      },
      input: {
        transcription: {
          "model": "gpt-4o-transcribe",
          "prompt": "",
          "language": "en"
        },
        turn_detection: {
          "type": "semantic_vad",
        },
      }
    },
  });
}


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
    const instructions = (request.query as Record<string, string>).instructions || undefined

    const fd = new FormData();
    fd.set("sdp", sdpOffer);
    fd.set("session", buildSessionConfig(instructions));

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

      const callId = response.headers.get('Location')?.split('/').pop()
      if (callId) {
        openSideband(callId, apiKey, (msg, data) => fastify.log.info({ msg, ...data as object }))
      }

      const sdpAnswer = await response.text()
      return reply.send(sdpAnswer)

    } catch (error) {
      fastify.log.error(error, 'Error creating OpenAI session')
      return reply.status(500).send({ error: 'Internal server error: Error creating OpenAI session' })
    }
  })
}
