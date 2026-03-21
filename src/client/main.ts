import { startSession, stopSession } from './webrtc'
import { onDataChannelMessage, sendEvent } from './datachannel'

const startBtn = document.getElementById('start') as HTMLButtonElement
const stopBtn = document.getElementById('stop') as HTMLButtonElement
const statusDiv = document.getElementById('status') as HTMLDivElement
const eventsDiv = document.getElementById('events') as HTMLDivElement
const outputTranscriptionDiv = document.getElementById('output-transcription') as HTMLDivElement
const transcriptionDiv = document.getElementById('transcription') as HTMLDivElement
const classificationsDiv = document.getElementById('classifications') as HTMLDivElement
const inputTotalEl = document.getElementById('input-total') as HTMLSpanElement
const inputTextEl = document.getElementById('input-text-tokens') as HTMLSpanElement
const inputAudioEl = document.getElementById('input-audio-tokens') as HTMLSpanElement
const outputTotalEl = document.getElementById('output-total') as HTMLSpanElement
const outputTextEl = document.getElementById('output-text-tokens') as HTMLSpanElement
const outputAudioEl = document.getElementById('output-audio-tokens') as HTMLSpanElement

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
function handleEventLogging(event: { type: string; [k: string]: unknown }): void {
  const line = document.createElement('div')
  line.textContent = JSON.stringify(event)
  eventsDiv.appendChild(line)
  eventsDiv.scrollTop = eventsDiv.scrollHeight
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
}

onDataChannelMessage(handleEventLogging)
onDataChannelMessage(handleOutputTranscriptionEvents)
onDataChannelMessage(handleInputTranscriptionEvents)
onDataChannelMessage(handleIntentClassification)
onDataChannelMessage(handleTokenUsage)

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true
  stopBtn.disabled = false
  setStatus('Connecting...')
  totalInputTokens = totalInputTextTokens = totalInputAudioTokens = 0
  totalOutputTokens = totalOutputTextTokens = totalOutputAudioTokens = 0
  inputTotalEl.textContent = inputTextEl.textContent = inputAudioEl.textContent = '0'
  outputTotalEl.textContent = outputTextEl.textContent = outputAudioEl.textContent = '0'
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

stopBtn.addEventListener('click', () => {
  stopSession()
  stopBtn.disabled = true
  startBtn.disabled = false
  setStatus('Idle')
})
