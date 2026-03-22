import { startSession, stopSession, onLocalStream, onRemoteStream } from './webrtc'
import { onDataChannelMessage, sendEvent } from './datachannel'

const startBtn = document.getElementById('start') as HTMLButtonElement
const stopBtn = document.getElementById('stop') as HTMLButtonElement
const statusDiv = document.getElementById('status') as HTMLDivElement
const eventsDiv = document.getElementById('events') as HTMLDivElement
const eventFiltersDiv = document.getElementById('event-filters') as HTMLDivElement
const outputTranscriptionDiv = document.getElementById('output-transcription') as HTMLDivElement
const transcriptionDiv = document.getElementById('transcription') as HTMLDivElement
const classificationsDiv = document.getElementById('classifications') as HTMLDivElement
const inputTotalEl = document.getElementById('input-total') as HTMLSpanElement
const inputTextEl = document.getElementById('input-text-tokens') as HTMLSpanElement
const inputAudioEl = document.getElementById('input-audio-tokens') as HTMLSpanElement
const outputTotalEl = document.getElementById('output-total') as HTMLSpanElement
const outputTextEl = document.getElementById('output-text-tokens') as HTMLSpanElement
const outputAudioEl = document.getElementById('output-audio-tokens') as HTMLSpanElement
const inputCostEl  = document.getElementById('input-cost')  as HTMLElement
const outputCostEl = document.getElementById('output-cost') as HTMLElement
const convMicBar    = document.getElementById('conv-mic-bar')    as HTMLDivElement
const convModelBar  = document.getElementById('conv-model-bar')  as HTMLDivElement
const convMicLabel  = document.getElementById('conv-mic-label')  as HTMLSpanElement
const convModelLabel= document.getElementById('conv-model-label')as HTMLSpanElement

const PRICE_TEXT_INPUT   = 4.00  / 1_000_000
const PRICE_AUDIO_INPUT  = 32.00 / 1_000_000
const PRICE_TEXT_OUTPUT  = 16.00 / 1_000_000
const PRICE_AUDIO_OUTPUT = 64.00 / 1_000_000

// ── Audio visualizer ──────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null
const rafHandles: number[] = []

function setupAnalyser(stream: MediaStream, barEl: HTMLDivElement): void {
  if (!audioCtx) audioCtx = new AudioContext()
  const source   = audioCtx.createMediaStreamSource(stream)
  const analyser = audioCtx.createAnalyser()
  analyser.fftSize = 256
  source.connect(analyser)
  const buf = new Uint8Array(analyser.fftSize)

  function tick(): void {
    analyser.getByteTimeDomainData(buf)
    let sum = 0
    for (const v of buf) sum += Math.abs(v - 128)
    const rms = sum / buf.length / 128
    barEl.style.width = `${Math.min(rms * 300, 100)}%`
    rafHandles.push(requestAnimationFrame(tick))
  }
  rafHandles.push(requestAnimationFrame(tick))
}

function stopVisualization(): void {
  for (const h of rafHandles) cancelAnimationFrame(h)
  rafHandles.length = 0
  if (audioCtx) { audioCtx.close(); audioCtx = null }
  convMicBar.style.width   = '0%'
  convModelBar.style.width = '0%'
}

// ── Conversation state ────────────────────────────────────────────────────────
let listeningActive = false
let speakingActive  = false

function setListening(active: boolean): void {
  listeningActive = active
  convMicLabel.classList.toggle('active', active)
  convMicBar.classList.toggle('active', active)
}

function setSpeaking(active: boolean): void {
  speakingActive = active
  convModelLabel.classList.toggle('active', active)
  convModelBar.classList.toggle('active', active)
}

type RealtimeEvent = { type: string; [k: string]: unknown }
const allEvents: RealtimeEvent[] = []
const eventsByGroup = new Map<string, number[]>()
const activeGroups = new Set<string>()

function getGroup(type: string): string {
  return type.split('.')[0]
}

function rebuildEventLog(): void {
  eventsDiv.innerHTML = ''
  const indices: number[] = []
  for (const group of activeGroups) {
    const groupIndices = eventsByGroup.get(group)
    if (groupIndices) indices.push(...groupIndices)
  }
  indices.sort((a, b) => a - b)
  for (const i of indices) {
    const line = document.createElement('div')
    line.textContent = JSON.stringify(allEvents[i])
    eventsDiv.appendChild(line)
  }
  eventsDiv.scrollTop = eventsDiv.scrollHeight
}

let totalInputTokens = 0
let totalInputTextTokens = 0
let totalInputAudioTokens = 0
let totalOutputTokens = 0
let totalOutputTextTokens = 0
let totalOutputAudioTokens = 0

function setStatus(text: string): void {
  statusDiv.textContent = text
}

/**
 * Event handler for logging all events to the UI.
 * 
 * @param event The event object to log.
 */
function handleEventLogging(event: RealtimeEvent): void {
  const idx = allEvents.length
  allEvents.push(event)

  const group = getGroup(event.type)
  let groupIndices = eventsByGroup.get(group)
  if (!groupIndices) {
    groupIndices = []
    eventsByGroup.set(group, groupIndices)
    activeGroups.add(group)

    const label = document.createElement('label')
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = true
    cb.dataset.group = group
    cb.addEventListener('change', () => {
      if (cb.checked) activeGroups.add(group)
      else activeGroups.delete(group)
      rebuildEventLog()
    })
    label.appendChild(cb)
    label.appendChild(document.createTextNode(group))
    eventFiltersDiv.appendChild(label)
  }
  groupIndices.push(idx)

  if (activeGroups.has(group)) {
    const line = document.createElement('div')
    line.textContent = JSON.stringify(event)
    eventsDiv.appendChild(line)
    eventsDiv.scrollTop = eventsDiv.scrollHeight
  }
}

function handleConversationVisualization(event: RealtimeEvent): void {
  if (event.type === 'input_audio_buffer.speech_started') {
    setListening(true)
  } else if (event.type === 'input_audio_buffer.speech_stopped' || event.type === 'input_audio_buffer.committed') {
    setListening(false)
  } else if (event.type.startsWith('output_audio_buffer.') && event.type.includes('start')) {
    setSpeaking(true)
  } else if (event.type.startsWith('output_audio_buffer.') && (event.type.includes('stop') || event.type.includes('clear') || event.type.includes('done'))) {
    setSpeaking(false)
  }
}

/**
 * Handles output transcription-related events to update the transcription display and trigger classification.
 * 
 * @param event The event object containing transcription updates and other related events.
 */
let currentOutputTranscriptionSpan: HTMLSpanElement | null = null
function handleOutputTranscriptionEvents(event: { type: string; [k: string]: unknown }): void {
  if (event.type === 'response.output_audio_transcript.delta') {
    if (!currentOutputTranscriptionSpan) {
      currentOutputTranscriptionSpan = document.createElement('span')
      outputTranscriptionDiv.appendChild(currentOutputTranscriptionSpan)
    }
    currentOutputTranscriptionSpan.textContent += (event.delta as string) ?? ''

  } else if (event.type === 'response.output_audio_transcript.done') {
    outputTranscriptionDiv.appendChild(document.createElement('hr'))
    currentOutputTranscriptionSpan = null
  }
}


/**
 * Handles transcription-related events to update the transcription display and trigger classification.
 * 
 * @param event The event object containing transcription updates and other related events.
 */
let currentInputTranscriptionUtteranceSpan: HTMLSpanElement | null = null
function handleInputTranscriptionEvents(event: { type: string; [k: string]: unknown }): void {
  if (event.type === 'conversation.item.input_audio_transcription.delta') {
    if (!currentInputTranscriptionUtteranceSpan) {
      currentInputTranscriptionUtteranceSpan = document.createElement('span')
      transcriptionDiv.appendChild(currentInputTranscriptionUtteranceSpan)
    }
    currentInputTranscriptionUtteranceSpan.textContent += (event.delta as string) ?? ''

  } else if (event.type === 'conversation.item.input_audio_transcription.completed') {
    transcriptionDiv.appendChild(document.createElement('hr'))
    currentInputTranscriptionUtteranceSpan = null

  } else if (event.type === 'conversation.item.input_audio_transcription.failed') {
    const errText = document.createTextNode('==UNABLE TO TRANSCRIBE==')
    transcriptionDiv.appendChild(errText)
    transcriptionDiv.appendChild(document.createElement('hr'))
    currentInputTranscriptionUtteranceSpan = null
  }
}

/**
 * Handles intent classification-related events to update the classification display.
 * 
 * @param event The event object containing classification updates and other related events.
 */
function handleIntentClassification(event: { type: string; [k: string]: unknown }): void {
  if (event.type === 'conversation.item.added' && (event.item as { role?: string })?.role === 'user') {
    sendEvent({
      type: 'response.create',
      response: {
        conversation: 'none',
        output_modalities: ['text'],
        metadata: { topic: 'classification' },
        instructions: "You are a linguist classifying the intent of messages. Carefully analyze the last user message and reply with exactly one word from: question, statement, command, greeting, other.",
        input: [{ type: 'item_reference', id: (event.item as { id: string }).id }],
      },
    })
  } else if (
    event.type === 'response.done' &&
    (event.response as { metadata?: { topic?: string } })?.metadata?.topic === 'classification'
  ) {
    const output = (event.response as { output: { content: { text: string }[] }[] }).output
    const text = output?.[0]?.content?.[0]?.text
    if (text) {
      const line = document.createElement('div')
      line.textContent = text
      classificationsDiv.appendChild(line)
      classificationsDiv.scrollTop = classificationsDiv.scrollHeight
    }
  }
}



function handleTokenUsage(event: { type: string; [k: string]: unknown }): void {
  if (event.type !== 'response.done') return
  const usage = (event.response as { usage?: {
    input_tokens?: number
    output_tokens?: number
    input_token_details?: { text_tokens?: number; audio_tokens?: number }
    output_token_details?: { text_tokens?: number; audio_tokens?: number }
  } })?.usage
  if (!usage) return

  totalInputTokens += usage.input_tokens ?? 0
  totalInputTextTokens += usage.input_token_details?.text_tokens ?? 0
  totalInputAudioTokens += usage.input_token_details?.audio_tokens ?? 0
  totalOutputTokens += usage.output_tokens ?? 0
  totalOutputTextTokens += usage.output_token_details?.text_tokens ?? 0
  totalOutputAudioTokens += usage.output_token_details?.audio_tokens ?? 0

  inputTotalEl.textContent = String(totalInputTokens)
  inputTextEl.textContent = String(totalInputTextTokens)
  inputAudioEl.textContent = String(totalInputAudioTokens)
  outputTotalEl.textContent = String(totalOutputTokens)
  outputTextEl.textContent = String(totalOutputTextTokens)
  outputAudioEl.textContent = String(totalOutputAudioTokens)

  const inputCost  = totalInputTextTokens  * PRICE_TEXT_INPUT   + totalInputAudioTokens  * PRICE_AUDIO_INPUT
  const outputCost = totalOutputTextTokens * PRICE_TEXT_OUTPUT  + totalOutputAudioTokens * PRICE_AUDIO_OUTPUT
  inputCostEl.textContent  = `$${inputCost.toFixed(6)}`
  outputCostEl.textContent = `$${outputCost.toFixed(6)}`
}

onLocalStream( stream => setupAnalyser(stream, convMicBar))
onRemoteStream(stream => setupAnalyser(stream, convModelBar))

onDataChannelMessage(handleEventLogging)
onDataChannelMessage(handleConversationVisualization)
onDataChannelMessage(handleOutputTranscriptionEvents)
onDataChannelMessage(handleInputTranscriptionEvents)
onDataChannelMessage(handleIntentClassification)
onDataChannelMessage(handleTokenUsage)

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true
  stopBtn.disabled = false
  setStatus('Connecting...')
  stopVisualization()
  setListening(false)
  setSpeaking(false)
  allEvents.length = 0
  eventsByGroup.clear()
  activeGroups.clear()
  eventFiltersDiv.innerHTML = ''
  eventsDiv.innerHTML = ''
  totalInputTokens = totalInputTextTokens = totalInputAudioTokens = 0
  totalOutputTokens = totalOutputTextTokens = totalOutputAudioTokens = 0
  inputTotalEl.textContent = inputTextEl.textContent = inputAudioEl.textContent = '0'
  outputTotalEl.textContent = outputTextEl.textContent = outputAudioEl.textContent = '0'
  inputCostEl.textContent = outputCostEl.textContent = '$0.000000'
  try {
    await startSession()
    setStatus('Connected')
  } catch (err) {
    console.error(err)
    setStatus(`Error: ${(err as Error).message}`)
    startBtn.disabled = false
    stopBtn.disabled = true
  }
})

document.querySelectorAll<HTMLButtonElement>('.copy-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const el = document.getElementById(btn.dataset.target!)!
    navigator.clipboard.writeText(el.innerText).then(() => {
      btn.classList.add('copied')
      btn.textContent = '✓'
      setTimeout(() => { btn.classList.remove('copied'); btn.textContent = '⧉' }, 1500)
    })
  })
})

stopBtn.addEventListener('click', () => {
  stopSession()
  stopVisualization()
  setListening(false)
  setSpeaking(false)
  stopBtn.disabled = true
  startBtn.disabled = false
  setStatus('Idle')
})
