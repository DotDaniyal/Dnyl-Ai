import { NeuralVoiceName, STTProviderType, TTSProviderType } from '../types/dnyl';

// Web Speech API Type Declarations for TypeScript
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

export interface STTCallbacks {
  onInterimTranscript: (text: string) => void;
  onFinalTranscript: (text: string) => void;
  onStateChange: (isListening: boolean) => void;
  onError: (message: string, recoverable: boolean) => void;
  onSpeechDetected?: () => void;
}

/**
 * Abstraction interface for Speech-To-Text providers.
 * Allows seamless switching between Browser Continuous SpeechRecognition and Server Neural Transcription.
 */
export interface ISpeechToTextProvider {
  readonly providerName: STTProviderType;
  isSupported(): boolean;
  start(langBcp47: string, continuous: boolean): Promise<void>;
  stop(): void;
  pauseForAssistantSpeech(): void;
  resumeAfterAssistantSpeech(): void;
  destroy(): void;
}

/**
 * Provider 1: Browser Native SpeechRecognition with automatic continuous resumption
 * and anti-echo pause while DNYL is speaking.
 */
export class BrowserSpeechRecognitionProvider implements ISpeechToTextProvider {
  public readonly providerName: STTProviderType = 'browser_continuous';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognition: any = null;
  private callbacks: STTCallbacks;
  private shouldKeepListening = false;
  private isPausedForTTS = false;
  private isCurrentlyActive = false;
  private currentLang = 'en-US';
  private continuousMode = true;
  private restartTimer: number | null = null;

  constructor(callbacks: STTCallbacks) {
    this.callbacks = callbacks;
  }

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
  }

  public async start(langBcp47: string, continuous: boolean): Promise<void> {
    if (!this.isSupported()) {
      this.callbacks.onError(
        'Browser SpeechRecognition is not available in this browser. Switching to Neural Cloud Audio Transcription.',
        true
      );
      return;
    }

    this.currentLang = langBcp47 || 'en-US';
    this.continuousMode = continuous;
    this.shouldKeepListening = true;
    this.isPausedForTTS = false;

    this.initAndStartInstance();
  }

  private initAndStartInstance(): void {
    if (this.restartTimer) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (this.isCurrentlyActive) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    const SpeechRecognitionCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    try {
      if (this.recognition) {
        try {
          this.recognition.onend = null;
          this.recognition.onerror = null;
          this.recognition.onresult = null;
          this.recognition.abort();
        } catch {
          // ignore cleanup errors
        }
      }

      const rec = new SpeechRecognitionCtor();
      rec.lang = this.currentLang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        this.isCurrentlyActive = true;
        this.callbacks.onStateChange(true);
      };

      rec.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let finalChunk = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const transcript = res[0]?.transcript || '';
          if (res.isFinal) {
            finalChunk += transcript;
          } else {
            interim += transcript;
          }
        }

        if (interim.trim()) {
          this.callbacks.onSpeechDetected?.();
          this.callbacks.onInterimTranscript(interim);
        }

        if (finalChunk.trim()) {
          this.callbacks.onInterimTranscript('');
          this.callbacks.onFinalTranscript(finalChunk.trim());
          if (!this.continuousMode) {
            this.shouldKeepListening = false;
            this.stop();
          }
        }
      };

      rec.onerror = (event: SpeechRecognitionErrorEvent) => {
        const err = event.error;
        if (err === 'no-speech' || err === 'aborted') {
          // Normal silence or intentional abort; let onend handle auto-resume
          return;
        }
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          this.shouldKeepListening = false;
          this.isCurrentlyActive = false;
          this.callbacks.onStateChange(false);
          this.callbacks.onError(
            'Microphone access was denied by the browser or operating system. Please grant microphone permission to use voice mode.',
            false
          );
          return;
        }
        if (err === 'network') {
          this.callbacks.onError(
            'Browser speech service experienced a temporary network glitch. You can switch STT Provider to Neural Cloud in Settings.',
            true
          );
        }
      };

      rec.onend = () => {
        this.isCurrentlyActive = false;
        if (this.shouldKeepListening && !this.isPausedForTTS) {
          this.restartTimer = window.setTimeout(() => {
            if (this.shouldKeepListening && !this.isPausedForTTS) {
              this.initAndStartInstance();
            }
          }, 260);
        } else {
          this.callbacks.onStateChange(false);
        }
      };

      this.recognition = rec;
      rec.start();
    } catch (err: unknown) {
      this.isCurrentlyActive = false;
      this.callbacks.onStateChange(false);
      const msg = err instanceof Error ? err.message : 'Failed to start microphone recognition';
      this.callbacks.onError(msg, true);
    }
  }

  public pauseForAssistantSpeech(): void {
    this.isPausedForTTS = true;
    if (this.restartTimer) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.recognition && this.isCurrentlyActive) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
    }
  }

  public resumeAfterAssistantSpeech(): void {
    if (!this.shouldKeepListening) return;
    this.isPausedForTTS = false;
    if (!this.isCurrentlyActive) {
      this.restartTimer = window.setTimeout(() => {
        if (this.shouldKeepListening && !this.isPausedForTTS) {
          this.initAndStartInstance();
        }
      }, 250);
    }
  }

  public stop(): void {
    this.shouldKeepListening = false;
    this.isPausedForTTS = false;
    if (this.restartTimer) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.recognition) {
      try {
        this.recognition.onend = null;
        this.recognition.stop();
      } catch {
        // ignore
      }
    }
    this.isCurrentlyActive = false;
    this.callbacks.onStateChange(false);
  }

  public destroy(): void {
    this.stop();
    this.recognition = null;
  }
}

/**
 * Provider 2: Neural Cloud STT Provider using MediaRecorder + /api/dnyl/transcribe (gemini-3.5-transcribe).
 * Works across all modern browsers supporting MediaRecorder, including for languages where browser STT is missing.
 */
export class NeuralCloudSTTProvider implements ISpeechToTextProvider {
  public readonly providerName: STTProviderType = 'neural_cloud';
  private callbacks: STTCallbacks;
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private currentLang = 'auto';

  constructor(callbacks: STTCallbacks) {
    this.callbacks = callbacks;
  }

  public isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== 'undefined'
    );
  }

  public async start(langBcp47: string): Promise<void> {
    if (!this.isSupported()) {
      this.callbacks.onError('Microphone capture is not supported in this browser.', false);
      return;
    }
    try {
      this.currentLang = langBcp47 || 'auto';
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.chunks = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.chunks.push(e.data);
        }
      };

      this.mediaRecorder.onstart = () => {
        this.callbacks.onStateChange(true);
        this.callbacks.onInterimTranscript('Recording voice for Neural Cloud transcription (click mic when finished)...');
      };

      this.mediaRecorder.onstop = async () => {
        this.callbacks.onStateChange(false);
        const blob = new Blob(this.chunks, { type: 'audio/webm' });
        this.chunks = [];
        this.cleanupStream();

        if (blob.size < 800) {
          this.callbacks.onInterimTranscript('');
          return;
        }

        try {
          this.callbacks.onInterimTranscript('Transcribing multilingual audio with DNYL neural engine...');
          const base64Audio = await this.blobToBase64(blob);
          const response = await fetch('/api/dnyl/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64: base64Audio,
              mimeType: 'audio/webm',
              hintLanguage: this.currentLang,
            }),
          });
          const data = await response.json();
          this.callbacks.onInterimTranscript('');
          if (!response.ok) {
            throw new Error(data.error || 'Neural transcription failed');
          }
          if (data.transcript && data.transcript.trim()) {
            this.callbacks.onFinalTranscript(data.transcript.trim());
          }
        } catch (err: unknown) {
          this.callbacks.onInterimTranscript('');
          const msg = err instanceof Error ? err.message : 'Transcription failed';
          this.callbacks.onError(msg, true);
        }
      };

      this.mediaRecorder.start();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Microphone access denied or unavailable.';
      this.callbacks.onStateChange(false);
      this.callbacks.onError(`Microphone permission error: ${msg}`, false);
    }
  }

  public stop(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // ignore
      }
    } else {
      this.cleanupStream();
      this.callbacks.onStateChange(false);
    }
  }

  public pauseForAssistantSpeech(): void {
    // Neural cloud mode records on toggle
  }

  public resumeAfterAssistantSpeech(): void {
    // Neural cloud mode records on toggle
  }

  public destroy(): void {
    this.stop();
    this.cleanupStream();
  }

  private cleanupStream(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = String(reader.result || '');
        const base64 = res.includes(',') ? res.split(',')[1] : res;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

export interface TTSOptions {
  text: string;
  languageCode: string;
  languageName: string;
  provider: TTSProviderType;
  neuralVoice: NeuralVoiceName;
  browserVoiceURI?: string;
  rate: number;
  volume: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: string) => void;
}

/**
 * Abstraction manager for Text-To-Speech synthesis.
 * Supports Gemini Neural TTS (`gemini-3.8-flash-lite-tts` returning WAV) and Browser SpeechSynthesis,
 * with automatic fallback, playback rate, volume, stop/interrupt, and repeat last response.
 */
export class DNYLSpeechSynthesizer {
  private currentAudio: HTMLAudioElement | null = null;
  private isSpeakingFlag = false;
  private activeRequestId = 0;

  public isSpeaking(): boolean {
    return this.isSpeakingFlag;
  }

  public stop(): void {
    this.activeRequestId += 1;
    this.isSpeakingFlag = false;

    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.src = '';
      } catch {
        // ignore
      }
      this.currentAudio = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  }

  public async speak(options: TTSOptions): Promise<void> {
    this.stop();
    const requestId = ++this.activeRequestId;

    const cleanText = options.text
      .replace(/```[\s\S]*?```/g, 'Code block displayed on screen.')
      .replace(/[*#_`~>]/g, '')
      .trim();

    if (!cleanText) {
      options.onEnd?.();
      return;
    }

    if (options.provider === 'browser_only') {
      this.speakWithBrowser(cleanText, options, requestId);
      return;
    }

    // Try Neural TTS first (for 'neural_hybrid' or 'neural_only')
    try {
      this.isSpeakingFlag = true;
      options.onStart?.();

      const response = await fetch('/api/dnyl/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText,
          voiceName: options.neuralVoice,
          languageName: options.languageName,
        }),
      });

      if (requestId !== this.activeRequestId) {
        return; // Interrupted while fetching
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Neural TTS request failed');
      }

      const data = await response.json();
      if (!data.audioBase64) {
        throw new Error('Empty audio payload from Neural TTS');
      }

      if (requestId !== this.activeRequestId) {
        return;
      }

      // Unary default from gemini-3.8-flash-lite-tts is a complete WAV file (audio/wav, 24kHz mono 16-bit)
      const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
      audio.volume = Math.max(0, Math.min(1, options.volume));
      audio.playbackRate = Math.max(0.5, Math.min(2.0, options.rate));
      this.currentAudio = audio;

      audio.onended = () => {
        if (requestId === this.activeRequestId) {
          this.isSpeakingFlag = false;
          this.currentAudio = null;
          options.onEnd?.();
        }
      };

      audio.onerror = () => {
        if (requestId === this.activeRequestId) {
          this.currentAudio = null;
          if (options.provider === 'neural_hybrid') {
            this.speakWithBrowser(cleanText, options, requestId);
          } else {
            this.isSpeakingFlag = false;
            options.onError?.('Failed to play neural audio stream.');
            options.onEnd?.();
          }
        }
      };

      await audio.play();
    } catch (err: unknown) {
      if (requestId !== this.activeRequestId) return;

      if (options.provider === 'neural_hybrid') {
        // Seamless fallback to Browser SpeechSynthesis
        this.speakWithBrowser(cleanText, options, requestId);
      } else {
        this.isSpeakingFlag = false;
        const msg = err instanceof Error ? err.message : 'Speech synthesis failed';
        options.onError?.(msg);
        options.onEnd?.();
      }
    }
  }

  private speakWithBrowser(text: string, options: TTSOptions, requestId: number): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      this.isSpeakingFlag = false;
      options.onError?.('Speech synthesis is not supported by this browser.');
      options.onEnd?.();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = Math.max(0.5, Math.min(2.0, options.rate));
      utterance.volume = Math.max(0, Math.min(1, options.volume));

      const voices = window.speechSynthesis.getVoices();
      const targetLangPrefix = (options.languageCode || 'en-US').split('-')[0].toLowerCase();

      if (options.browserVoiceURI) {
        const customVoice = voices.find((v) => v.voiceURI === options.browserVoiceURI);
        if (customVoice) {
          utterance.voice = customVoice;
        }
      }

      if (!utterance.voice && voices.length > 0) {
        // Match exact BCP-47 or language prefix
        const exactMatch = voices.find(
          (v) => v.lang.toLowerCase() === (options.languageCode || 'en-US').toLowerCase()
        );
        const prefixMatch = voices.find((v) =>
          v.lang.toLowerCase().startsWith(targetLangPrefix)
        );
        if (exactMatch) {
          utterance.voice = exactMatch;
        } else if (prefixMatch) {
          utterance.voice = prefixMatch;
        }
      }

      utterance.lang = options.languageCode === 'ur-Latn' ? 'ur-PK' : options.languageCode || 'en-US';

      utterance.onstart = () => {
        if (requestId === this.activeRequestId) {
          this.isSpeakingFlag = true;
          options.onStart?.();
        }
      };

      utterance.onend = () => {
        if (requestId === this.activeRequestId) {
          this.isSpeakingFlag = false;
          options.onEnd?.();
        }
      };

      utterance.onerror = () => {
        if (requestId === this.activeRequestId) {
          this.isSpeakingFlag = false;
          options.onEnd?.();
        }
      };

      this.isSpeakingFlag = true;
      options.onStart?.();
      window.speechSynthesis.speak(utterance);
    } catch {
      this.isSpeakingFlag = false;
      options.onEnd?.();
    }
  }
}
