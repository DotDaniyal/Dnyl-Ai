import { NeuralVoiceName } from '../types/dnyl';

export interface LiveSessionCallbacks {
  onStatusChange: (status: 'disconnected' | 'connecting' | 'connected') => void;
  onSpeakingChange: (isSpeaking: boolean) => void;
  onUserTranscriptUpdate: (partialText: string) => void;
  onAssistantTranscriptUpdate: (partialText: string) => void;
  onTurnCompleted: (userText: string, assistantText: string) => void;
  onAudioLevel?: (level: number) => void;
  onError: (message: string) => void;
}

/**
 * Converts Float32Array (-1.0 to 1.0) into 16-bit Little-Endian PCM Base64 string.
 */
function float32ToPcm16Base64(float32Data: Float32Array): string {
  const pcm16 = new Int16Array(float32Data.length);
  for (let i = 0; i < float32Data.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Data[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

/**
 * Decodes Base64 16-bit Little-Endian PCM string into Float32Array for 24kHz AudioBuffer playback.
 */
function pcm16Base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const byteLength = binary.length;
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer, 0, Math.floor(byteLength / 2));
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

export class DNYLLiveSessionClient {
  private ws: WebSocket | null = null;
  private inputAudioCtx: AudioContext | null = null;
  private outputAudioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;

  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private nextStartTime = 0;
  private callbacks: LiveSessionCallbacks;
  private volume = 1.0;
  private isMuted = false;

  private accumulatedUserText = '';
  private accumulatedAssistantText = '';

  constructor(callbacks: LiveSessionCallbacks) {
    this.callbacks = callbacks;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode && this.outputAudioCtx) {
      this.gainNode.gain.setValueAtTime(this.volume, this.outputAudioCtx.currentTime);
    }
  }

  public setMicMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  public async connect(voice: NeuralVoiceName, preferredLanguage: string, initialVolume = 1.0): Promise<void> {
    this.disconnect();
    this.volume = initialVolume;
    this.isMuted = false;
    this.accumulatedUserText = '';
    this.accumulatedAssistantText = '';

    this.callbacks.onStatusChange('connecting');

    try {
      // 1. Request microphone stream (16kHz mono preferred)
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // 2. Initialize separate 16kHz input AudioContext and 24kHz output AudioContext
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.inputAudioCtx = new AudioCtx({ sampleRate: 16000 });
      this.outputAudioCtx = new AudioCtx({ sampleRate: 24000 });

      this.gainNode = this.outputAudioCtx.createGain();
      this.gainNode.gain.value = this.volume;
      this.gainNode.connect(this.outputAudioCtx.destination);
      this.nextStartTime = 0;

      // 3. Connect WebSocket to server Live API bridge
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/dnyl/live?voice=${encodeURIComponent(
        voice
      )}&lang=${encodeURIComponent(preferredLanguage)}`;

      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        this.startMicCapture();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'connected') {
            this.callbacks.onStatusChange('connected');
          } else if (msg.type === 'audio' && typeof msg.audio === 'string') {
            this.scheduleAudioChunk(msg.audio);
          } else if (msg.type === 'input_transcription' && typeof msg.text === 'string') {
            this.accumulatedUserText += msg.text;
            this.callbacks.onUserTranscriptUpdate(this.accumulatedUserText.trim());
          } else if (msg.type === 'output_transcription' && typeof msg.text === 'string') {
            this.accumulatedAssistantText += msg.text;
            this.callbacks.onAssistantTranscriptUpdate(this.accumulatedAssistantText.trim());
          } else if (msg.type === 'interrupted') {
            this.clearPlaybackQueue();
            if (this.accumulatedUserText.trim() || this.accumulatedAssistantText.trim()) {
              this.callbacks.onTurnCompleted(
                this.accumulatedUserText.trim(),
                this.accumulatedAssistantText.trim()
              );
              this.accumulatedUserText = '';
              this.accumulatedAssistantText = '';
              this.callbacks.onUserTranscriptUpdate('');
              this.callbacks.onAssistantTranscriptUpdate('');
            }
          } else if (msg.type === 'turn_complete') {
            if (this.accumulatedUserText.trim() || this.accumulatedAssistantText.trim()) {
              this.callbacks.onTurnCompleted(
                this.accumulatedUserText.trim(),
                this.accumulatedAssistantText.trim()
              );
              this.accumulatedUserText = '';
              this.accumulatedAssistantText = '';
              this.callbacks.onUserTranscriptUpdate('');
              this.callbacks.onAssistantTranscriptUpdate('');
            }
          } else if (msg.type === 'error') {
            this.callbacks.onError(msg.error || 'Live voice session encountered an error.');
          } else if (msg.type === 'closed') {
            this.disconnect();
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onerror = () => {
        this.callbacks.onError('WebSocket connection error during Live Voice session.');
      };

      ws.onclose = () => {
        this.disconnect();
      };
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Microphone access is required for Real-Time Live Voice conversation.';
      this.callbacks.onError(msg);
      this.disconnect();
    }
  }

  private startMicCapture(): void {
    if (!this.inputAudioCtx || !this.mediaStream) return;

    this.sourceNode = this.inputAudioCtx.createMediaStreamSource(this.mediaStream);
    this.scriptProcessor = this.inputAudioCtx.createScriptProcessor(4096, 1, 1);

    this.scriptProcessor.onaudioprocess = (e: AudioProcessingEvent) => {
      if (this.isMuted || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }

      const channelData = e.inputBuffer.getChannelData(0);

      // Compute RMS audio level for live HUD visualization
      let sumSquares = 0;
      for (let i = 0; i < channelData.length; i += 4) {
        sumSquares += channelData[i] * channelData[i];
      }
      const rms = Math.sqrt(sumSquares / (channelData.length / 4));
      this.callbacks.onAudioLevel?.(Math.min(100, Math.round(rms * 420)));

      const base64Audio = float32ToPcm16Base64(channelData);
      this.ws.send(JSON.stringify({ audio: base64Audio }));
    };

    this.sourceNode.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.inputAudioCtx.destination);
  }

  private scheduleAudioChunk(base64Pcm: string): void {
    if (!this.outputAudioCtx || !this.gainNode) return;

    if (this.outputAudioCtx.state === 'suspended') {
      this.outputAudioCtx.resume().catch(() => {});
    }

    const float32Samples = pcm16Base64ToFloat32(base64Pcm);
    if (float32Samples.length === 0) return;

    const audioBuffer = this.outputAudioCtx.createBuffer(1, float32Samples.length, 24000);
    audioBuffer.copyToChannel(float32Samples, 0);

    const source = this.outputAudioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.gainNode);

    const currentTime = this.outputAudioCtx.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime + 0.02;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;

    this.activeSources.add(source);
    this.callbacks.onSpeakingChange(true);

    source.onended = () => {
      this.activeSources.delete(source);
      if (this.activeSources.size === 0) {
        this.callbacks.onSpeakingChange(false);
      }
    };
  }

  public clearPlaybackQueue(): void {
    this.activeSources.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // ignore
      }
    });
    this.activeSources.clear();
    if (this.outputAudioCtx) {
      this.nextStartTime = this.outputAudioCtx.currentTime;
    } else {
      this.nextStartTime = 0;
    }
    this.callbacks.onSpeakingChange(false);
  }

  public sendTextMessage(text: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && text.trim()) {
      this.ws.send(JSON.stringify({ text: text.trim() }));
    }
  }

  public disconnect(): void {
    this.clearPlaybackQueue();

    if (this.scriptProcessor) {
      try {
        this.scriptProcessor.disconnect();
        this.scriptProcessor.onaudioprocess = null;
      } catch {
        // ignore
      }
      this.scriptProcessor = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }

    if (this.inputAudioCtx) {
      this.inputAudioCtx.close().catch(() => {});
      this.inputAudioCtx = null;
    }

    if (this.outputAudioCtx) {
      this.outputAudioCtx.close().catch(() => {});
      this.outputAudioCtx = null;
    }

    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
      } catch {
        // ignore
      }
      this.ws = null;
    }

    this.callbacks.onStatusChange('disconnected');
    this.callbacks.onSpeakingChange(false);
  }
}
