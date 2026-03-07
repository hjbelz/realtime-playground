import 'dotenv/config'
import path from 'path'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { sessionRoutes } from './routes/session.js'

const fastify = Fastify({ logger: true })

fastify.register(fastifyStatic, {
  root: path.join(process.cwd(), 'dist/client'),
})

fastify.register(sessionRoutes, { prefix: '/api' })

const port = Number(process.env.PORT ?? 3000)

fastify.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
