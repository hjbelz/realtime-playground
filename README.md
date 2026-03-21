
# OpenAI Realtime Voice Demo

A minimal web app for experimenting with the OpenAI Realtime API over WebRTC. The browser captures microphone audio, establishes a peer-to-peer WebRTC connection directly to OpenAI, and streams bidirectional voice in real time. A lightweight Node.js server acts solely as an SDP signalling proxy (keeping the API key out of the browser) and opens a server-side WebSocket sideband for observability.

## Architecture overview

```
Browser (WebRTC + DataChannel)
    |
    |  SDP offer/answer (HTTP)
    v
Node.js / Fastify server  ──WebSocket sideband──►  OpenAI Realtime API
    |                                                      ▲
    └──────────────────── WebRTC (audio + events) ─────────┘
```

The server never touches the audio stream. All voice traffic goes peer-to-peer between the browser and OpenAI after the initial SDP handshake.

## Tech stack

| Layer | Technology | Role |
|---|---|---|
| **Language** | TypeScript 5 | Shared language for both client and server |
| **Runtime** | Node.js 24 (ESM, `--experimental-strip-types`) | Runs the server without a build step in dev |
| **Server framework** | Fastify 5 | HTTP server; handles SDP proxy endpoint and static file serving |
| **Static serving** | `@fastify/static` | Serves the built Vite client bundle in production |
| **Client bundler** | Vite 7 | Dev server with HMR; bundles the TypeScript client for production |
| **Transport** | WebRTC (`RTCPeerConnection`) | Peer-to-peer audio + JSON event channel between browser and OpenAI |
| **Event channel** | `RTCDataChannel` (`oai-events`) | Bidirectional JSON events (transcription, responses, usage, etc.) |
| **Sideband** | WebSocket (`ws` 8) | Server-side mirror of the session events for logging/debugging |
| **AI API** | OpenAI Realtime API (`gpt-realtime`) | Streaming voice model; also used for input transcription via `gpt-4o-transcribe` |
| **Config** | `dotenv` | Loads `OPENAI_API_KEY` from `.env` |
| **Dev runner** | `concurrently` | Starts server and Vite dev server in parallel with a single `npm run dev` |

## Getting started

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.
2. `npm install`
3. `npm run dev` — starts the Fastify server on port 3000 and the Vite dev server.
4. Open the Vite URL in a browser, click **Start**, and allow microphone access.
