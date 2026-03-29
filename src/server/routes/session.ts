import type { FastifyInstance } from 'fastify'
import { openSideband } from '../sideband.js'

// If both API keys are set, OpenAI will take precedence.
const IS_OPEN_AI = !!process.env.OPENAI_API_KEY

// Support both OpenAI and Azure OpenAI based on which environment variables are set. 
const API_KEY = IS_OPEN_AI ? process.env.OPENAI_API_KEY : process.env.AZURE_OPENAI_KEY

// For OpenAI, endpoint and model name are fixed. For Azure OpenAI, both must be provided via environment variables.
const API_ENDPOINT_URL = IS_OPEN_AI ? 'https://api.openai.com/v1/realtime/calls' : process.env.AZURE_OPENAI_ENDPOINT;
const MODEL_DEPLOYMENT_NAME = IS_OPEN_AI ? "gpt-realtime" : process.env.AZURE_OPENAI_DEPLOYMENT_NAME;

function buildSessionConfig(instructions?: string): string {
  return JSON.stringify({
    type: "realtime",
    model: MODEL_DEPLOYMENT_NAME,
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
 
    if (!API_KEY) {
      return reply.status(500).send({ error: 'Neither OPENAI_API_KEY nor AZURE_OPENAI_KEY is set.' })
    }
    if (!API_ENDPOINT_URL) {
      return reply.status(500).send({ error: 'AZURE_OPENAI_ENDPOINT is not set.' })
    }
    if (!IS_OPEN_AI && !MODEL_DEPLOYMENT_NAME) {
      return reply.status(500).send({ error: 'AZURE_OPENAI_DEPLOYMENT_NAME is not set.' })
    }

    const sdpOffer = request.body as string
    const instructions = (request.query as Record<string, string>).instructions || undefined

    const fd = new FormData();
    fd.set("sdp", sdpOffer);
    fd.set("session", buildSessionConfig(instructions));

    try {
      const response = await fetch(API_ENDPOINT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${API_KEY}`,
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
        openSideband(callId, API_KEY, (msg, data) => fastify.log.info({ msg, ...data as object }))
      } else {
        fastify.log.warn('No call ID found in OpenAI response headers')
      }

      const sdpAnswer = await response.text()
      fastify.log.info('Received SDP answer from OpenAI:' + JSON.stringify(sdpAnswer))
      return reply.send(sdpAnswer)

    } catch (error) {
      fastify.log.error(error, 'Error creating OpenAI session')
      return reply.status(500).send({ error: 'Internal server error: Error creating OpenAI session' })
    }
  })
}
