import * as dotenv from "dotenv"
dotenv.config({ path: '../.env' });

import fs from 'fs'
import { writeFile } from "node:fs/promises"
import { SpeechClient } from '@google-cloud/speech'
import textToSpeech from "@google-cloud/text-to-speech"
import EventEmitter from 'events'
import OpenAI from "openai"
import record from "node-record-lpcm16"
import { Writable } from 'stream'
import chalk from 'chalk';

const openai = new OpenAI()
const speechClient = new SpeechClient()
const ttsClient = new textToSpeech.TextToSpeechClient()
const config = {
  encoding: 'LINEAR16', // FLAC not working -why?
  sampleRateHertz: 16000,
  languageCode: 'en-US',
  profanity_filter: true,
  enable_automatic_punctuation: true,
  enable_spoken_punctuation: true,
  use_enhanced: true,
  model: "latest_long",
}
const request = {
  config,
  interimResults: true,
}
let recognizeStream = null
let newStream = true
let audioInput = []
let bridgingOffset = 0
const transcriptionEmitter = new EventEmitter()
let systemPrompt = "";

fs.readFile("../systemPrompt.txt", "utf8", (err, data) => {
  if (err) {
    console.error("Error reading system prompt file:", err);
    return;
  }
  systemPrompt = data;
  console.log("System prompt loaded.");
});

function startStream() {
  recognizeStream = speechClient
    .streamingRecognize(request)
    .on('error', (err) => {
      console.error('API request error:', err)
    })
    .on('data', speechCallback)

  setTimeout(restartStream, 10000)
};

let finalRequestEndTime = 0
const speechCallback = (stream) => {
  let resultEndTime = stream.results[0].resultEndTime.seconds * 1000 +
    Math.round(stream.results[0].resultEndTime.nanos / 1000000)

  let correctedTime = resultEndTime - bridgingOffset + 10000

  let stdoutText = ''
  if (stream.results[0] && stream.results[0].alternatives[0]) {
    stdoutText = `${correctedTime}: ${stream.results[0].alternatives[0].transcript}`
  }

  if (stream.results[0].isFinal) {
    process.stdout.write(chalk.green(`${stdoutText}\n`))
    transcriptionEmitter.emit('transcription', stream.results[0].alternatives[0].transcript)
  } else {
    process.stdout.write(chalk.red(stdoutText))
  }
};

function restartStream() {
  if (recognizeStream) {
    recognizeStream.end()
    recognizeStream.removeListener('data', speechCallback)
    recognizeStream = null
  }

  audioInput = []
  bridgingOffset = 0

  startStream()
};

const audioInputStreamTransform = new Writable({
  write(chunk, encoding, next) {
    if (newStream && audioInput.length !== 0) {
      let chunkTime = 10000 / audioInput.length
      if (chunkTime !== 0) {
        if (bridgingOffset < 0) bridgingOffset = 0
        let chunksFromMS = Math.floor((finalRequestEndTime - bridgingOffset) / chunkTime)
        bridgingOffset = Math.floor((audioInput.length - chunksFromMS) * chunkTime)

        for (let i = chunksFromMS; i < audioInput.length; i++) {
          recognizeStream.write(audioInput[i])
        }
      }
      newStream = false
    }

    audioInput.push(chunk)
    if (recognizeStream) {
      recognizeStream.write(chunk)
    }

    next()
  },

  final() {
    if (recognizeStream) {
      recognizeStream.end()
    }
  },
});

let conversationHistory = []
// transcriptionEmitter.on('transcription', async (transcription) => {
//   console.log(`Transcription: ${transcription}`)
//   try {
//     const prompt = fs.readFileSync('systemPrompt.txt', 'utf8')
//     const asst = await openai.chat.completions.create({
//       model: 'gpt-4',
//       messages: [
//         { role: 'system', content: prompt },
//         { role: 'user', content: transcription },
//       ],
//     })

//     const botResponse = asst.choices[0].message.content
//     console.log('Bot response:', botResponse)
//     botResponseEmitter.emit('botresponse', botResponse)
//   } catch (err) {
//     console.error('Error with OpenAI API:', err)
//   }
// })

transcriptionEmitter.on("transcription", async (transcription) => {
  console.log(`Transcription: ${transcription}`);
  try {
    if (systemPrompt === "") {
      console.log("System prompt not loaded yet.");
      return;
    }

    conversationHistory = [
      ...conversationHistory,
      { role: "user", content: transcription },
    ];

    const asst = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt }, 
        ...conversationHistory, 
      ],
    });

    const botResponse = asst.choices[0].message.content;

    conversationHistory = [
      ...conversationHistory,
      { role: "assistant", content: botResponse },
    ];

    console.log("Bot response:", botResponse);
    botResponseEmitter.emit("botresponse", botResponse);
  } catch (err) {
    console.error("Error with OpenAI API:", err);
  }
});

const botResponseEmitter = new EventEmitter()
botResponseEmitter.on("botresponse", async (botresponse) => {
  try {
    const ttsRequest = {
      input: { text: botresponse },
      voice: { languageCode: "en-US", ssmlGender: "NEUTRAL" },
      audioConfig: { audioEncoding: "MP3" },
    }

    const [response] = await ttsClient.synthesizeSpeech(ttsRequest)

    const outputFilename = "bot_response.mp3"
    await writeFile(outputFilename, response.audioContent, "binary")
    console.log(`Audio content written to file: ${outputFilename}`)
  } catch (err) {
    console.error("Error with Google Text-to-Speech API:", err)
  }
});

record
  .record({
    sampleRateHertz: 16000,
    threshold: 0,
    silence: 1000,
    keepSilence: true,
  })
  .stream()
  .on('error', (err) => {
    console.error('Audio recording error:', err)
  })
  .pipe(audioInputStreamTransform);

console.log('Listening, press Ctrl+C to stop.')
startStream();