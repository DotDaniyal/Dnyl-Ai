export type ScriptDirection = 'ltr' | 'rtl';

export type AssistantState =
  | 'booting'
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'standby';

export type STTProviderType = 'browser_continuous' | 'neural_cloud';
export type TTSProviderType = 'neural_hybrid' | 'neural_only' | 'browser_only';

export type NeuralVoiceName = 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';

export interface LanguageConfig {
  id: string;
  name: string;
  nativeName: string;
  bcp47: string;
  direction: ScriptDirection;
  supportsBrowserSTT: boolean;
  samplePrompt: string;
  regionLabel: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  spokenSummary?: string;
  timestamp: string;
  languageCode: string;
  languageName: string;
  direction: ScriptDirection;
  intentCategory?: string;
  isOfflineCommand?: boolean;
  openWebsiteUrl?: string;
  openWebsiteTitle?: string;
}

export interface DNYLPreferences {
  preferredLanguage: string; // 'auto' or LanguageConfig.name
  sttRecognitionLang: string; // BCP-47 code for browser STT, e.g. 'en-US', 'ur-PK', 'ar-SA'
  sttProvider: STTProviderType;
  ttsProvider: TTSProviderType;
  neuralVoice: NeuralVoiceName;
  browserVoiceURI: string;
  speechRate: number; // 0.7 to 1.5
  speechVolume: number; // 0 to 1
  autoSpeakResponses: boolean;
  continuousListening: boolean;
  interruptOnSpeech: boolean;
  responseStyle: 'concise' | 'balanced' | 'detailed';
  memoryEnabled: boolean;
}

export interface TranslationResult {
  translatedText: string;
  romanizedPronunciation: string;
  detectedSourceLanguage: string;
  targetDirection: ScriptDirection;
  notes: string;
}
