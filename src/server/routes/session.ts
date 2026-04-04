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
          // model: 'whisper-1',
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
      // Step 1: Exchange SDP (provider handles auth internally)
      fastify.log.info('Attempting to exchange SDP with provider: ' + provider.toString())
      const { sdpAnswer, callId } = await provider.exchangeSdp(sdpOffer, sessionConfig)
      fastify.log.info({ callId }, 'SDP exchange complete')

      // Step 2: Open sideband for server-side monitoring
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
