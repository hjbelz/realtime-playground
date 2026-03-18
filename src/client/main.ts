import { startSession, stopSession } from './webrtc'
import { onDataChannelMessage, sendEvent } from './datachannel'

const startBtn = document.getElementById('start') as HTMLButtonElement
const stopBtn = document.getElementById('stop') as HTMLButtonElement
const statusDiv = document.getElementById('status') as HTMLDivElement
const eventsDiv = document.getElementById('events') as HTMLDivElement
const outputTranscriptionDiv = document.getElementById('output-transcription') as HTMLDivElement
const transcriptionDiv = document.getElementById('transcription') as HTMLDivElement
const classificationsDiv = document.getElementById('classifications') as HTMLDivElement

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
        input: [{ type: 'item_reference', id: event.item_id as string }],
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



onDataChannelMessage(handleEventLogging)
onDataChannelMessage(handleOutputTranscriptionEvents)
onDataChannelMessage(handleInputTranscriptionEvents)
onDataChannelMessage(handleIntentClassification)

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true
  stopBtn.disabled = false
  setStatus('Connecting...')
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
