import type { FastifyInstance } from 'fastify'
import { openSideband } from '../sideband.js'
import { createProviders, type ProviderName } from '../providers.js'

const providers = createProviders()

function modelNameFor(provider: ProviderName): string {
  return provider === 'Azure'
    ? (process.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? 'gpt-realtime')
    : 'gpt-realtime'
}

function buildSessionConfig(modelName: string, instructions?: string): object {
  return {
    type: 'realtime',
    model: modelName,
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

  fastify.get('/provider', async (_request, reply) => {
    return reply.send({ available: Array.from(providers.keys()) })
  })

  fastify.post('/session', async (request, reply) => {
    const sdpOffer = request.body as string
    const query = request.query as Record<string, string>
    const instructions = query.instructions || undefined
    const providerName = (query.provider as ProviderName) || providers.keys().next().value!
    const provider = providers.get(providerName)

    if (!provider) {
      return reply.status(400).send({ error: `Provider '${providerName}' is not available` })
    }

    const sessionConfig = buildSessionConfig(modelNameFor(providerName), instructions)

    try {
      fastify.log.info('Attempting to exchange SDP with provider: ' + provider.toString())
      const { sdpAnswer, callId } = await provider.exchangeSdp(sdpOffer, sessionConfig)
      fastify.log.info({ callId }, 'SDP exchange complete')

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
