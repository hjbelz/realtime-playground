import type { FastifyInstance } from 'fastify'
import { openSideband } from '../sideband.js'
import { createProvider } from '../providers.js'

const provider = createProvider()

const MODEL_NAME = process.env.OPENAI_API_KEY
  ? 'gpt-realtime'
  : process.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? 'gpt-realtime'

function buildSessionConfig(instructions?: string): object {
  return {
    type: 'realtime',
    model: MODEL_NAME,
    ...(instructions ? { instructions } : {}),
    audio: {
      output: {
        voice: 'marin',
      },
      input: {
        transcription: {
          model: 'gpt-4o-transcribe',
          prompt: '',
          language: 'en',
        },
        turn_detection: {
          type: 'semantic_vad',
        },
      },
    },
  }
}

export async function sessionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addContentTypeParser('application/sdp', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body)
  })

  fastify.post('/session', async (request, reply) => {
    const sdpOffer = request.body as string
    const instructions = (request.query as Record<string, string>).instructions || undefined
    const sessionConfig = buildSessionConfig(instructions)

    try {
      // Step 1: Get ephemeral token (embeds session config)
      const token = await provider.getEphemeralToken(sessionConfig)
      fastify.log.info('Obtained ephemeral token')

      // Step 2: Exchange SDP using the ephemeral token
      const { sdpAnswer, callId } = await provider.exchangeSdp(token, sdpOffer)
      fastify.log.info({ callId }, 'SDP exchange complete')

      // Step 3: Open sideband for server-side monitoring
      if (callId) {
        openSideband(
          provider.sidebandUrl(callId),
          provider.sidebandHeaders(),
          (msg, data) => fastify.log.info({ msg, ...data as object }),
        )
      } else {
        fastify.log.warn('No call ID in response — sideband not opened')
      }

      return reply.send(sdpAnswer)
    } catch (error) {
      fastify.log.error(error, 'Session creation failed')
      return reply.status(502).send({ error: 'Failed to create realtime session' })
    }
  })
}
