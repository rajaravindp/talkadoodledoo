// Reference doc page:
// https://cloud.google.com/speech-to-text/docs/transcribe-streaming-audio#speech-streaming-recognize-nodejs

// NOTES: 
// Need to use a bi-directional RPC
// Diarization can be supported - needs separate channel for each speaker -  not required for our usecase though
// For audio collection from mic - use LPCM (Linear Pulse Code Modulation) 16-bit signed audio format - cross platform compatible
// Mic check for bg noise detection must be setup.

// .streamingRecognize() - not returns promise, does not resolve/reject - returns duplex stream - cannot use async/await


import * as dotenv from "dotenv"
dotenv.config()
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY

import fs from 'fs'
import ws from "ws"
import { SpeechClient } from '@google-cloud/speech'
import EventEmitter from 'events'
import OpenAI from "openai";
import Speaker from 'speaker'; 
import { Writable } from 'stream';

const openai = new OpenAI();
const client = new SpeechClient()
const filename = "assets/a1.flac"
const sysPrompt = 'assets/systemPrompt.txt';

const config = {
  encoding: "FLAC",
  sampleRateHertz: 16000,
  languageCode: 'en-US',
  profanity_filter: true,
  enable_automatic_punctuation: true,
  enable_spoken_punctuation: true,
  use_enhanced: true,
  model: "latest_long",
};

const request = {
  config,
  interimResults: true,
};

const transcriptionEmitter = new EventEmitter()
const recognizeStream = client
  .streamingRecognize(request)
  .on('error', (err) => {
    console.error('Error during streaming:', err)
  })
  .on('data', (data) => {
    if (data.results[0] && data.results[0].isFinal) {
      const transcription = data.results[0].alternatives[0].transcript
      transcriptionEmitter.emit('transcription', transcription)
    }
  });

fs.createReadStream(filename).pipe(recognizeStream);

const botResponseEmitter = new EventEmitter()
transcriptionEmitter.on('transcription', async (transcription) => {
  // console.log(`Transcription = ${transcription}`);
  try {
    const prompt = fs.readFileSync(sysPrompt, 'utf8')
    const asst = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: "What is node.js?" },
      ],
    })
    const botresponse = asst.choices[0].message.content;
    console.log(botresponse);
    botResponseEmitter.emit('botresponse', botresponse);
  } catch (err) {
    console.error('Error with OpenAI API:', err);
  }
});

const voiceId = "pqHfZKP75CvOlQylNhV4"
const model = "eleven_flash_v2_5"
const uri = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?model_id=${model}`;
const wsClient = new ws(uri, {
  headers: {
    "xi-api-key": `${ELEVENLABS_API_KEY}`
  }
});
const speaker = new Speaker({
  channels: 1, 
  bitDepth: 16, 
  sampleRate: 22050, 
});

// botResponseEmitter.on('botresponse', (botresponse) => {
//   // console.log(`Bot Response = ${botresponse}`);
//   wsClient.on('open', async () => {
//     wsClient.send(
//       JSON.stringify({
//         text: " ",
//         voice_settings: {
//           stability: 0.5,
//           similarity_boost: 0.8,
//           use_speaker_boost: false,
//         },
//         generation_config: { chunk_length_schedule: [120, 160, 250, 290] },
//       })
//     )
//     wsClient.send(JSON.stringify({ text: botresponse }))
//     websocket.send(JSON.stringify({ text: "" }))
//   })
// });

botResponseEmitter.on('botresponse', (botresponse) => {
  wsClient.on('open', () => {
    wsClient.send(
      JSON.stringify({
        text: " ",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
          use_speaker_boost: false,
        },
        generation_config: { chunk_length_schedule: [120, 160, 250, 290] },
      })
    );

    wsClient.send(JSON.stringify({ text: botresponse }));
    wsClient.send(JSON.stringify({ text: "" })); // End signal
  });

});