import http from 'http';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '15mb' }));

// Simple in-memory rate limiter for API protection
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_MINUTE = 45;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (record.count >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }
  record.count += 1;
  return true;
}

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const DNYL_SYSTEM_INSTRUCTION = `You are DNYL, an ultra-intelligent, composed, and articulate multilingual AI assistant inspired by Iron Man's JARVIS.
CRITICAL IDENTITY RULES:
1. Your name is strictly and exclusively "DNYL". Never add another word to your name.
2. Communicate naturally, intelligently, and accurately. Never pretend to be a rigid command bot.
3. Understand context and follow-up questions across the conversation history.
4. Universal Multilingual & Code-Switching Mastery:
   - You fluently understand and respond in English, Urdu (اردو), Roman Urdu, Arabic (العربية), Hindi (हिन्दी), Punjabi (پنجابی / ਪੰਜਾਬੀ), Sindhi (سنڌي), Pashto (پښتو), Persian (فارسی), French, German, Spanish, Chinese, Japanese, Korean, Russian, Turkish, and other supported human languages.
   - Automatically detect the language (and script) used by the user.
   - If the user writes or speaks in Roman Urdu (Urdu written in Latin script, e.g., "Aap kaise hain? Mujhe quantum computing samjha dein"), respond naturally in Roman Urdu unless they ask for Urdu Nastaliq script or another language.
   - If the user writes in Urdu script (اردو), Arabic (العربية), Persian (فارسی), Sindhi (سنڌي), or Pashto (پښتو), respond in that exact script and set direction to "rtl".
   - If the user specifies a preferred response language override (not "auto"), respond in that requested language while still understanding whatever language they used.
   - Understand mixed-language code-switching (e.g., Urdu + English, Hindi + English) effortlessly.
5. Honesty & Precision:
   - Provide accurate explanations in mathematics, science, programming, education, translation, writing, and everyday tasks.
   - Ask for clarification if a request is genuinely ambiguous.
   - Admit uncertainty honestly rather than inventing facts.
   - Never claim to speak or support a language if the underlying system cannot process it.`;

// Health & capabilities check
app.get('/api/dnyl/status', (_req, res) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY);
  res.json({
    assistant: 'DNYL',
    online: hasKey,
    models: {
      conversation: 'gemini-3.8-flash',
      live: 'gemini-3.8-live',
      tts: 'gemini-3.8-flash-lite-tts',
      transcribe: 'gemini-3.5-transcribe',
    },
    serverTime: new Date().toISOString(),
  });
});

// Main Multilingual Conversational Endpoint
app.post('/api/dnyl/chat', async (req, res) => {
  try {
    const clientIp = req.ip || 'local';
    if (!checkRateLimit(clientIp)) {
      res.status(429).json({
        error: 'Rate limit exceeded. Please wait a moment before sending another request to DNYL.',
      });
      return;
    }

    const {
      message,
      history = [],
      preferredLanguage = 'auto',
      responseStyle = 'balanced',
      localTimeContext = '',
    } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'A non-empty message is required.' });
      return;
    }

    const ai = getGenAIClient();

    const styleInstruction =
      responseStyle === 'concise'
        ? 'Keep your response concise, direct, and crisp (1-3 sentences unless more detail is strictly needed).'
        : responseStyle === 'detailed'
          ? 'Provide a comprehensive, well-structured, and deeply explained response.'
          : 'Adapt your response length naturally to the complexity of the user request.';

    const languageDirective =
      preferredLanguage && preferredLanguage !== 'auto'
        ? `USER PREFERRED RESPONSE LANGUAGE OVERRIDE: Always respond in "${preferredLanguage}" unless the user explicitly asks to translate into a different language in this message.`
        : `AUTOMATIC LANGUAGE MATCHING: Respond in the exact same language (and script, e.g. Roman Urdu vs Urdu script) that the user used in their latest message, unless they explicitly ask you to reply in or translate to another language.`;

    const formattedHistory = Array.isArray(history)
      ? history.slice(-16).map((msg: { role: string; text: string }) => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(msg.text || '') }],
        }))
      : [];

    const contents = [
      ...formattedHistory,
      {
        role: 'user',
        parts: [
          {
            text: `[Context: Current User Time: ${localTimeContext || new Date().toISOString()}]\n[${languageDirective}]\n[${styleInstruction}]\n\nUser Message: ${message.trim()}`,
          },
        ],
      },
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        systemInstruction: DNYL_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: {
              type: Type.STRING,
              description:
                'The complete, helpful response from DNYL in the appropriate language and script. Supports Markdown formatting.',
            },
            spokenSummary: {
              type: Type.STRING,
              description:
                'A clean, natural spoken version of the response in the same language, free of raw markdown symbols, code fences, or URLs, suitable for reading aloud smoothly (up to 4 sentences).',
            },
            detectedLanguageCode: {
              type: Type.STRING,
              description:
                'BCP-47 language tag of the reply (e.g., en-US, ur-PK, ur-Latn, ar-SA, hi-IN, pa-PK, sd-PK, ps-AF, fa-IR, fr-FR, de-DE, es-ES, zh-CN, ja-JP, ko-KR, ru-RU, tr-TR).',
            },
            detectedLanguageName: {
              type: Type.STRING,
              description:
                'Human-readable name of the language used in the reply (e.g., English, Urdu, Roman Urdu, Arabic, Persian, Hindi, Pashto, Sindhi, Punjabi, French, Spanish, etc.).',
            },
            direction: {
              type: Type.STRING,
              description:
                'Text script direction: "rtl" for right-to-left scripts (Urdu Nastaliq, Arabic, Persian, Sindhi, Pashto, Shahmukhi Punjabi) or "ltr" for left-to-right scripts (English, Roman Urdu, Hindi Devanagari, French, etc.).',
            },
            intentCategory: {
              type: Type.STRING,
              description:
                'One of: "conversation", "translation", "calculation", "knowledge", "programming", "website_navigation", "clarification".',
            },
            openWebsiteUrl: {
              type: Type.STRING,
              description:
                'If and only if the user explicitly asked to open or visit a website (e.g. YouTube, Wikipedia, GitHub, Google), provide the full safe https:// URL here. Otherwise leave as empty string "".',
            },
            openWebsiteTitle: {
              type: Type.STRING,
              description:
                'Short title of the website if openWebsiteUrl is provided, otherwise empty string "".',
            },
          },
          required: [
            'reply',
            'spokenSummary',
            'detectedLanguageCode',
            'detectedLanguageName',
            'direction',
            'intentCategory',
          ],
        },
      },
    });

    const rawText = response.text || '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = {
        reply: rawText,
        spokenSummary: rawText.slice(0, 400),
        detectedLanguageCode: 'en-US',
        detectedLanguageName: 'English',
        direction: 'ltr',
        intentCategory: 'conversation',
      };
    }

    res.json(parsed);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unexpected AI processing error';
    console.error('[DNYL Chat Error]:', errMsg);
    res.status(500).json({
      error: `DNYL encountered a communication error with the AI core: ${errMsg}`,
    });
  }
});

// Neural Text-to-Speech Endpoint using gemini-3.8-flash-lite-tts
app.post('/api/dnyl/tts', async (req, res) => {
  try {
    const clientIp = req.ip || 'local';
    if (!checkRateLimit(clientIp)) {
      res.status(429).json({ error: 'Speech rate limit reached. Please wait a moment.' });
      return;
    }

    const { text, voiceName = 'Zephyr', languageName = 'auto' } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'Text is required for speech synthesis.' });
      return;
    }

    const validVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
    const selectedVoice = validVoices.includes(voiceName) ? voiceName : 'Zephyr';

    const ai = getGenAIClient();
    const cleanText = text.trim().slice(0, 1200);

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: cleanText,
              speechMetadata: {
                style:
                  languageName && languageName !== 'auto'
                    ? `Composed, natural, articulate assistant speaking in ${languageName}`
                    : 'Composed, natural, articulate assistant',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: selectedVoice },
          },
        },
      },
    });

    const base64Audio =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      res.status(502).json({
        error: 'Neural TTS did not return an audio stream for this segment.',
      });
      return;
    }

    res.json({
      audioBase64: base64Audio,
      mimeType: 'audio/wav',
      voiceName: selectedVoice,
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'TTS generation failed';
    console.error('[DNYL TTS Error]:', errMsg);
    res.status(500).json({ error: `Neural speech synthesis error: ${errMsg}` });
  }
});

// Neural Audio Transcription Endpoint using gemini-3.5-transcribe
app.post('/api/dnyl/transcribe', async (req, res) => {
  try {
    const clientIp = req.ip || 'local';
    if (!checkRateLimit(clientIp)) {
      res.status(429).json({ error: 'Transcription rate limit exceeded.' });
      return;
    }

    const { audioBase64, mimeType = 'audio/webm', hintLanguage = 'auto' } = req.body;
    if (!audioBase64 || typeof audioBase64 !== 'string') {
      res.status(400).json({ error: 'Audio data is required for transcription.' });
      return;
    }

    const ai = getGenAIClient();
    const languagePrompt =
      hintLanguage && hintLanguage !== 'auto'
        ? `Transcribe this spoken audio accurately. Expected language hint: ${hintLanguage}. Return ONLY the exact transcribed text without commentary.`
        : `Transcribe this spoken audio accurately in the language spoken by the user (e.g., English, Urdu, Roman Urdu, Arabic, Hindi, Persian, French, Spanish, etc.). Return ONLY the exact transcribed text without any extra commentary or quotes.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: audioBase64,
            },
          },
          {
            text: languagePrompt,
          },
        ],
      },
    });

    const transcript = (response.text || '').trim();
    res.json({ transcript });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Audio transcription error';
    console.error('[DNYL Transcribe Error]:', errMsg);
    res.status(500).json({ error: `Speech transcription failed: ${errMsg}` });
  }
});

// Dedicated Multilingual Translation Endpoint
app.post('/api/dnyl/translate', async (req, res) => {
  try {
    const clientIp = req.ip || 'local';
    if (!checkRateLimit(clientIp)) {
      res.status(429).json({ error: 'Rate limit reached. Please wait a moment.' });
      return;
    }

    const { text, sourceLanguage = 'auto', targetLanguage = 'English', preserveTone = 'natural' } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'Source text is required for translation.' });
      return;
    }

    const ai = getGenAIClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Translate the following text from ${sourceLanguage === 'auto' ? 'its automatically detected language' : sourceLanguage} into ${targetLanguage}.
Tone/Style requirement: ${preserveTone}.
Preserve meaning, nuance, cultural context, and intent accurately.

Source Text:
"""
${text.trim()}
"""`,
      config: {
        systemInstruction: DNYL_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            translatedText: {
              type: Type.STRING,
              description: 'The accurate translation in the target language and appropriate script.',
            },
            romanizedPronunciation: {
              type: Type.STRING,
              description: 'Phonetic/Romanized pronunciation guide so the user can read it aloud easily.',
            },
            detectedSourceLanguage: {
              type: Type.STRING,
              description: 'The detected name of the source language.',
            },
            targetDirection: {
              type: Type.STRING,
              description: '"rtl" if the target language script is right-to-left (Urdu, Arabic, Persian, Pashto, Sindhi), otherwise "ltr".',
            },
            notes: {
              type: Type.STRING,
              description: 'Brief contextual or cultural nuance note (1 sentence).',
            },
          },
          required: [
            'translatedText',
            'romanizedPronunciation',
            'detectedSourceLanguage',
            'targetDirection',
            'notes',
          ],
        },
      },
    });

    const raw = response.text || '{}';
    res.json(JSON.parse(raw));
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Translation error';
    console.error('[DNYL Translate Error]:', errMsg);
    res.status(500).json({ error: `Translation service failed: ${errMsg}` });
  }
});

// ============================================================================
// REAL-TIME VOICE CONVERSATION WEBSOCKET BRIDGE (Gemini Live API: gemini-3.8-live)
// ============================================================================
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  try {
    const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (reqUrl.pathname === '/api/dnyl/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  } catch {
    socket.destroy();
  }
});

wss.on('connection', (clientWs: WebSocket, request: http.IncomingMessage) => {
  const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const requestedVoice = reqUrl.searchParams.get('voice') || 'Zephyr';
  const preferredLang = reqUrl.searchParams.get('lang') || 'auto';

  const validVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
  const voiceName = validVoices.includes(requestedVoice) ? requestedVoice : 'Zephyr';

  const sendSafeJson = (payload: Record<string, unknown>) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(payload));
    }
  };

  let ai: GoogleGenAI;
  try {
    ai = getGenAIClient();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'API key missing on server';
    sendSafeJson({ type: 'error', error: msg });
    clientWs.close();
    return;
  }

  const languageDirective =
    preferredLang && preferredLang !== 'auto'
      ? `Always speak and respond in ${preferredLang} unless the user explicitly asks you to switch languages.`
      : `Automatically detect the language spoken by the user (English, Urdu, Roman Urdu, Arabic, Hindi, Punjabi, Sindhi, Pashto, Persian, French, German, Spanish, Chinese, Japanese, Korean, Russian, Turkish, etc.) and respond naturally in that exact same language.`;

  const liveSystemInstruction = `${DNYL_SYSTEM_INSTRUCTION}\n\nREAL-TIME VOICE MODE INSTRUCTIONS:\n- You are currently in low-latency, real-time bidirectional voice conversation mode.\n- Keep spoken responses natural, conversational, and well-paced for live audio.\n- ${languageDirective}`;

  // Use sessionPromise pattern to avoid race conditions as required by Gemini Live API rules
  const sessionPromise = ai.live.connect({
    model: 'gemini-3.8-live',
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: liveSystemInstruction,
    },
    callbacks: {
      onopen: () => {
        sendSafeJson({
          type: 'connected',
          voiceName,
          preferredLang,
        });
      },
      onmessage: (message: LiveServerMessage) => {
        // 1. Model audio output chunks (24kHz 16-bit PCM)
        const parts = message.serverContent?.modelTurn?.parts;
        if (parts && Array.isArray(parts)) {
          for (const part of parts) {
            if (part.inlineData?.data) {
              sendSafeJson({
                type: 'audio',
                audio: part.inlineData.data,
              });
            }
          }
        }

        // 2. Live input audio transcription (what the user said)
        const inputTranscript = message.serverContent?.inputTranscription?.text;
        if (inputTranscript) {
          sendSafeJson({
            type: 'input_transcription',
            text: inputTranscript,
          });
        }

        // 3. Live output audio transcription (what DNYL is saying)
        const outputTranscript = message.serverContent?.outputTranscription?.text;
        if (outputTranscript) {
          sendSafeJson({
            type: 'output_transcription',
            text: outputTranscript,
          });
        }

        // 4. Interruption handling (user spoke while DNYL was speaking)
        if (message.serverContent?.interrupted) {
          sendSafeJson({ type: 'interrupted' });
        }

        // 5. Turn completion
        if (message.serverContent?.turnComplete) {
          sendSafeJson({ type: 'turn_complete' });
        }
      },
      onerror: (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Live session error occurred';
        console.error('[DNYL Live Error]:', msg);
        sendSafeJson({ type: 'error', error: msg });
      },
      onclose: () => {
        sendSafeJson({ type: 'closed' });
      },
    },
  });

  sessionPromise.catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Failed to connect to Gemini Live API';
    console.error('[DNYL Live Connect Failed]:', msg);
    sendSafeJson({ type: 'error', error: msg });
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
    }
  });

  clientWs.on('message', (rawData) => {
    try {
      const parsed = JSON.parse(rawData.toString());
      if (parsed.audio && typeof parsed.audio === 'string') {
        sessionPromise
          .then((session) => {
            session.sendRealtimeInput({
              audio: {
                data: parsed.audio,
                mimeType: 'audio/pcm;rate=16000',
              },
            });
          })
          .catch(() => {
            // session closed or failed
          });
      } else if (parsed.text && typeof parsed.text === 'string') {
        sessionPromise
          .then((session) => {
            session.sendRealtimeInput({
              text: parsed.text,
            });
          })
          .catch(() => {
            // session closed or failed
          });
      }
    } catch {
      // ignore malformed JSON frames
    }
  });

  clientWs.on('close', () => {
    sessionPromise
      .then((session) => {
        try {
          session.close();
        } catch {
          // ignore
        }
      })
      .catch(() => {
        // ignore
      });
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`DNYL Server + Live WebSocket active on http://0.0.0.0:${PORT}`);
  });
}

startServer();
