import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Send,
  Search,
  Globe,
  Calculator,
  Trash2,
  Volume2,
  VolumeX,
  AlertTriangle,
  WifiOff,
  Sparkles,
  ExternalLink,
  Radio,
  PhoneOff,
} from 'lucide-react';
import {
  AssistantState,
  ChatMessage,
  DNYLPreferences,
} from './types/dnyl';
import {
  detectScriptDirection,
  SUPPORTED_LANGUAGES,
} from './config/languages';
import {
  BrowserSpeechRecognitionProvider,
  DNYLSpeechSynthesizer,
  ISpeechToTextProvider,
  NeuralCloudSTTProvider,
} from './services/speechProviders';
import { DNYLLiveSessionClient } from './services/liveSessionClient';
import {
  createWelcomeMessage,
  evaluateSafeMath,
  processLocalUtilityCommand,
} from './services/localCommands';
import { HudReactorCore } from './components/HudReactorCore';
import { MessageStream } from './components/MessageStream';
import { TranslationStudioModal } from './components/TranslationStudioModal';
import { SettingsDrawer } from './components/SettingsDrawer';

const PREFS_STORAGE_KEY = 'dnyl_preferences_v1';
const HISTORY_STORAGE_KEY = 'dnyl_conversation_v1';

const DEFAULT_PREFERENCES: DNYLPreferences = {
  preferredLanguage: 'auto',
  sttRecognitionLang: 'en-US',
  sttProvider: 'browser_continuous',
  ttsProvider: 'neural_hybrid',
  neuralVoice: 'Zephyr',
  browserVoiceURI: '',
  speechRate: 1.0,
  speechVolume: 1.0,
  autoSpeakResponses: true,
  continuousListening: true,
  interruptOnSpeech: true,
  responseStyle: 'balanced',
  memoryEnabled: true,
};

export default function App() {
  // Preferences state
  const [preferences, setPreferences] = useState<DNYLPreferences>(() => {
    try {
      const saved = localStorage.getItem(PREFS_STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) };
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_PREFERENCES;
  });

  // Conversation history state
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore storage errors
    }
    return [createWelcomeMessage()];
  });

  // Core operational states
  const [assistantState, setAssistantState] = useState<AssistantState>('booting');
  const [isStandby, setIsStandby] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [inputText, setInputText] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  // Real-Time Gemini Live Conversation states
  const [liveStatus, setLiveStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [liveMicMuted, setLiveMicMuted] = useState<boolean>(false);
  const [liveAudioLevel, setLiveAudioLevel] = useState<number>(0);
  const [liveUserTranscript, setLiveUserTranscript] = useState<string>('');
  const [liveAssistantTranscript, setLiveAssistantTranscript] = useState<string>('');

  // Modals / Drawers / Active Tab
  const [isTranslationOpen, setIsTranslationOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [activeLeftPanel, setActiveLeftPanel] = useState<'languages' | 'utilities'>('languages');

  // Local Calculator quick input
  const [calcInput, setCalcInput] = useState<string>('(1024 * 64) / 8');
  const [calcOutput, setCalcOutput] = useState<string>('8,192');

  // Live Clock
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Refs for providers and state synchronization
  const sttProviderRef = useRef<ISpeechToTextProvider | null>(null);
  const ttsSynthesizerRef = useRef<DNYLSpeechSynthesizer | null>(null);
  const liveClientRef = useRef<DNYLLiveSessionClient | null>(null);
  const preferencesRef = useRef<DNYLPreferences>(preferences);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const isStandbyRef = useRef<boolean>(isStandby);
  const handleSendMessageRef = useRef<(text: string) => Promise<void>>(async () => {});

  preferencesRef.current = preferences;
  messagesRef.current = messages;
  isStandbyRef.current = isStandby;

  // Startup boot sequence
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAssistantState('idle');
    }, 650);
    return () => window.clearTimeout(timer);
  }, []);

  // Live clock tick
  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Online / Offline network listener
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Save preferences to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // ignore
    }
  }, [preferences]);

  // Update Live client volume dynamically
  useEffect(() => {
    liveClientRef.current?.setVolume(preferences.speechVolume);
  }, [preferences.speechVolume]);

  // Save messages to localStorage if memoryEnabled
  useEffect(() => {
    try {
      if (preferences.memoryEnabled) {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(messages.slice(-50)));
      }
    } catch {
      // ignore
    }
  }, [messages, preferences.memoryEnabled]);

  // Synchronize unified AssistantState for HUD visualization
  useEffect(() => {
    if (isStandby) {
      setAssistantState('standby');
    } else if (isProcessing || liveStatus === 'connecting') {
      setAssistantState('processing');
    } else if (isSpeaking) {
      setAssistantState('speaking');
    } else if (isListening || (liveStatus === 'connected' && !liveMicMuted)) {
      setAssistantState('listening');
    } else {
      setAssistantState('idle');
    }
  }, [isStandby, isProcessing, isSpeaking, isListening, liveStatus, liveMicMuted]);

  // Initialize TTS synthesizer and Live Session client once
  useEffect(() => {
    ttsSynthesizerRef.current = new DNYLSpeechSynthesizer();
    liveClientRef.current = new DNYLLiveSessionClient({
      onStatusChange: (status) => {
        setLiveStatus(status);
        if (status === 'disconnected') {
          setLiveUserTranscript('');
          setLiveAssistantTranscript('');
          setLiveAudioLevel(0);
          setLiveMicMuted(false);
        }
      },
      onSpeakingChange: (speaking) => {
        setIsSpeaking(speaking);
      },
      onUserTranscriptUpdate: (partial) => {
        setLiveUserTranscript(partial);
      },
      onAssistantTranscriptUpdate: (partial) => {
        setLiveAssistantTranscript(partial);
      },
      onTurnCompleted: (userText, assistantText) => {
        const nowIso = new Date().toISOString();
        const newEntries: ChatMessage[] = [];
        if (userText) {
          const uDir = detectScriptDirection(userText, 'ltr');
          newEntries.push({
            id: `live-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            role: 'user',
            text: userText,
            timestamp: nowIso,
            languageCode: preferencesRef.current.sttRecognitionLang,
            languageName: 'Live Voice',
            direction: uDir,
          });
        }
        if (assistantText) {
          const aDir = detectScriptDirection(assistantText, 'ltr');
          newEntries.push({
            id: `live-dnyl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            role: 'assistant',
            text: assistantText,
            spokenSummary: assistantText,
            timestamp: nowIso,
            languageCode: preferencesRef.current.sttRecognitionLang,
            languageName: 'Live Voice',
            direction: aDir,
          });
        }
        if (newEntries.length > 0) {
          setMessages((prev) => [...prev, ...newEntries]);
        }
      },
      onAudioLevel: (lvl) => {
        setLiveAudioLevel(lvl);
      },
      onError: (errMsg) => {
        setErrorBanner(errMsg);
      },
    });

    return () => {
      ttsSynthesizerRef.current?.stop();
      liveClientRef.current?.disconnect();
    };
  }, []);

  // Speak arbitrary text using DNYL TTS abstraction
  const speakText = useCallback(
    (text: string, langCode: string, langName: string) => {
      if (!ttsSynthesizerRef.current || isStandbyRef.current) return;
      const prefs = preferencesRef.current;

      sttProviderRef.current?.pauseForAssistantSpeech();

      ttsSynthesizerRef.current.speak({
        text,
        languageCode: langCode,
        languageName: langName,
        provider: prefs.ttsProvider,
        neuralVoice: prefs.neuralVoice,
        browserVoiceURI: prefs.browserVoiceURI,
        rate: prefs.speechRate,
        volume: prefs.speechVolume,
        onStart: () => {
          setIsSpeaking(true);
        },
        onEnd: () => {
          setIsSpeaking(false);
          sttProviderRef.current?.resumeAfterAssistantSpeech();
        },
        onError: (errMsg) => {
          setErrorBanner(errMsg);
          setIsSpeaking(false);
          sttProviderRef.current?.resumeAfterAssistantSpeech();
        },
      });
    },
    []
  );

  const handleStopSpeaking = useCallback(() => {
    ttsSynthesizerRef.current?.stop();
    liveClientRef.current?.clearPlaybackQueue();
    setIsSpeaking(false);
    sttProviderRef.current?.resumeAfterAssistantSpeech();
  }, []);

  // Toggle Real-Time Gemini Live Conversation
  const handleToggleLiveSession = useCallback(async () => {
    if (isStandby) return;
    setErrorBanner(null);

    if (liveStatus === 'connected' || liveStatus === 'connecting') {
      liveClientRef.current?.disconnect();
      return;
    }

    // Stop standard STT/TTS before opening full-duplex Live session
    sttProviderRef.current?.stop();
    ttsSynthesizerRef.current?.stop();
    setIsListening(false);
    setIsSpeaking(false);
    setInterimTranscript('');

    await liveClientRef.current?.connect(
      preferences.neuralVoice,
      preferences.preferredLanguage,
      preferences.speechVolume
    );
  }, [
    isStandby,
    liveStatus,
    preferences.neuralVoice,
    preferences.preferredLanguage,
    preferences.speechVolume,
  ]);

  const handleToggleLiveMicMute = useCallback(() => {
    setLiveMicMuted((prev) => {
      const next = !prev;
      liveClientRef.current?.setMicMuted(next);
      return next;
    });
  }, []);

  // Core message sending & AI conversation handler
  const handleSendMessage = useCallback(
    async (rawText: string) => {
      const trimmed = rawText.trim();
      if (!trimmed || isStandbyRef.current) return;

      setErrorBanner(null);

      // If Real-Time Live Session is currently connected, send text into the Live session or run local utility
      if (liveStatus === 'connected') {
        const localCheck = processLocalUtilityCommand(trimmed, !navigator.onLine);
        if (!localCheck.handled) {
          liveClientRef.current?.sendTextMessage(trimmed);
          const uDir = detectScriptDirection(trimmed, 'ltr');
          setMessages((prev) => [
            ...prev,
            {
              id: `user-${Date.now()}`,
              role: 'user',
              text: trimmed,
              timestamp: new Date().toISOString(),
              languageCode: preferencesRef.current.sttRecognitionLang,
              languageName: 'Live Text',
              direction: uDir,
            },
          ]);
          return;
        }
      }

      if (preferencesRef.current.interruptOnSpeech && ttsSynthesizerRef.current?.isSpeaking()) {
        handleStopSpeaking();
      }

      const userDir = detectScriptDirection(trimmed, 'ltr');
      const currentLangConfig = SUPPORTED_LANGUAGES.find(
        (l) => l.bcp47 === preferencesRef.current.sttRecognitionLang
      );

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        text: trimmed,
        timestamp: new Date().toISOString(),
        languageCode: preferencesRef.current.sttRecognitionLang,
        languageName:
          userDir === 'rtl'
            ? 'RTL Script'
            : currentLangConfig?.name || 'Auto',
        direction: userDir,
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsProcessing(true);

      // 1. Check local / offline command engine first
      const localResult = processLocalUtilityCommand(trimmed, !navigator.onLine);
      if (localResult.handled && localResult.reply) {
        const assistantMsg: ChatMessage = {
          id: `dnyl-${Date.now()}`,
          role: 'assistant',
          text: localResult.reply,
          spokenSummary: localResult.spokenSummary || localResult.reply,
          timestamp: new Date().toISOString(),
          languageCode: 'en-US',
          languageName: 'English',
          direction: 'ltr',
          intentCategory: localResult.intentCategory,
          isOfflineCommand: true,
          openWebsiteUrl: localResult.openWebsiteUrl,
          openWebsiteTitle: localResult.openWebsiteTitle,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setIsProcessing(false);

        if (preferencesRef.current.autoSpeakResponses && assistantMsg.spokenSummary && liveStatus !== 'connected') {
          speakText(assistantMsg.spokenSummary, 'en-US', 'English');
        }
        return;
      }

      // 2. Online AI Core Request (/api/dnyl/chat)
      try {
        const historyPayload = preferencesRef.current.memoryEnabled
          ? messagesRef.current.slice(-14).map((m) => ({
              role: m.role,
              text: m.text,
            }))
          : [];

        const response = await fetch('/api/dnyl/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            history: historyPayload,
            preferredLanguage: preferencesRef.current.preferredLanguage,
            responseStyle: preferencesRef.current.responseStyle,
            localTimeContext: new Date().toLocaleString(),
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'DNYL server returned an error');
        }

        const replyText = String(data.reply || 'I am ready to assist.');
        const spokenSummary = String(data.spokenSummary || replyText);
        const detectedCode = String(data.detectedLanguageCode || 'en-US');
        const detectedName = String(data.detectedLanguageName || 'English');
        const replyDir =
          data.direction === 'rtl' || detectScriptDirection(replyText) === 'rtl'
            ? 'rtl'
            : 'ltr';

        const assistantMsg: ChatMessage = {
          id: `dnyl-${Date.now()}`,
          role: 'assistant',
          text: replyText,
          spokenSummary,
          timestamp: new Date().toISOString(),
          languageCode: detectedCode,
          languageName: detectedName,
          direction: replyDir,
          intentCategory: String(data.intentCategory || 'conversation'),
          openWebsiteUrl: data.openWebsiteUrl ? String(data.openWebsiteUrl) : undefined,
          openWebsiteTitle: data.openWebsiteTitle ? String(data.openWebsiteTitle) : undefined,
        };

        setMessages((prev) => [...prev, assistantMsg]);
        setIsProcessing(false);

        if (preferencesRef.current.autoSpeakResponses) {
          speakText(spokenSummary, detectedCode, detectedName);
        }
      } catch (err: unknown) {
        setIsProcessing(false);
        const errMsg =
          err instanceof Error
            ? err.message
            : 'Unable to reach DNYL AI Core. Check your connection.';
        setErrorBanner(errMsg);
      }
    },
    [handleStopSpeaking, liveStatus, speakText]
  );

  handleSendMessageRef.current = handleSendMessage;

  // Initialize / Re-initialize STT Provider when sttProvider type changes
  useEffect(() => {
    sttProviderRef.current?.destroy();

    const callbacks = {
      onInterimTranscript: (text: string) => {
        setInterimTranscript(text);
      },
      onFinalTranscript: (text: string) => {
        setInterimTranscript('');
        handleSendMessageRef.current(text);
      },
      onStateChange: (listening: boolean) => {
        setIsListening(listening);
      },
      onError: (message: string, recoverable: boolean) => {
        setErrorBanner(message);
        if (!recoverable) {
          setIsListening(false);
        }
      },
      onSpeechDetected: () => {
        if (preferencesRef.current.interruptOnSpeech && ttsSynthesizerRef.current?.isSpeaking()) {
          ttsSynthesizerRef.current.stop();
          setIsSpeaking(false);
        }
      },
    };

    const browserProvider = new BrowserSpeechRecognitionProvider(callbacks);
    if (preferences.sttProvider === 'browser_continuous' && browserProvider.isSupported()) {
      sttProviderRef.current = browserProvider;
    } else {
      sttProviderRef.current = new NeuralCloudSTTProvider(callbacks);
    }

    return () => {
      sttProviderRef.current?.destroy();
    };
  }, [preferences.sttProvider]);

  // Toggle Voice Dictation Listening
  const handleToggleListening = useCallback(async () => {
    if (isStandby) return;
    setErrorBanner(null);

    if (liveStatus === 'connected') {
      handleToggleLiveMicMute();
      return;
    }

    if (isListening) {
      sttProviderRef.current?.stop();
      setInterimTranscript('');
    } else {
      if (preferences.interruptOnSpeech && ttsSynthesizerRef.current?.isSpeaking()) {
        handleStopSpeaking();
      }
      await sttProviderRef.current?.start(
        preferences.sttRecognitionLang,
        preferences.continuousListening
      );
    }
  }, [
    isStandby,
    liveStatus,
    isListening,
    preferences.interruptOnSpeech,
    preferences.sttRecognitionLang,
    preferences.continuousListening,
    handleToggleLiveMicMute,
    handleStopSpeaking,
  ]);

  // Repeat last assistant response aloud
  const lastAssistantMessage = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant');

  const handleRepeatLast = useCallback(() => {
    if (!lastAssistantMessage) return;
    speakText(
      lastAssistantMessage.spokenSummary || lastAssistantMessage.text,
      lastAssistantMessage.languageCode,
      lastAssistantMessage.languageName
    );
  }, [lastAssistantMessage, speakText]);

  // Toggle Standby / Wake
  const handleToggleStandby = () => {
    if (!isStandby) {
      liveClientRef.current?.disconnect();
      sttProviderRef.current?.stop();
      ttsSynthesizerRef.current?.stop();
      setIsListening(false);
      setIsSpeaking(false);
      setInterimTranscript('');
      setIsStandby(true);
    } else {
      setIsStandby(false);
    }
  };

  // Update Preferences helper
  const updatePreferences = (patch: Partial<DNYLPreferences>) => {
    setPreferences((prev) => {
      const updated = { ...prev, ...patch };
      if (patch.sttRecognitionLang && isListening) {
        sttProviderRef.current?.stop();
        window.setTimeout(() => {
          sttProviderRef.current?.start(
            updated.sttRecognitionLang,
            updated.continuousListening
          );
        }, 200);
      }
      return updated;
    });
  };

  const handleClearHistory = () => {
    const welcome = createWelcomeMessage();
    setMessages([welcome]);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const handleResetPreferences = () => {
    setPreferences(DEFAULT_PREFERENCES);
    try {
      localStorage.removeItem(PREFS_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isProcessing || isStandby) return;
    const toSend = inputText;
    setInputText('');
    handleSendMessage(toSend);
  };

  const handleRunQuickCalc = (e: React.FormEvent) => {
    e.preventDefault();
    const res = evaluateSafeMath(calcInput);
    if (res !== null) {
      setCalcOutput(res);
    } else {
      setCalcOutput('Invalid arithmetic expression');
    }
  };

  const activeSttLangObj =
    SUPPORTED_LANGUAGES.find((l) => l.bcp47 === preferences.sttRecognitionLang) ||
    SUPPORTED_LANGUAGES[0];

  const inputDirection = detectScriptDirection(inputText, activeSttLangObj.direction);

  const browserSTTSupported =
    typeof window !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const isLiveActive = liveStatus === 'connected' || liveStatus === 'connecting';

  return (
    <div className="min-h-screen flex flex-col bg-[#050914] text-slate-100">
      {/* Top Bar Contract: Strictly 3 Zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-cyan-500/20 bg-[#060c1a]/90 backdrop-blur-md sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          className="text-xl font-bold tracking-widest text-cyan-300 font-display whitespace-nowrap shrink-0"
        >
          DNYL
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
          <button
            type="button"
            onClick={() => setActiveLeftPanel('languages')}
            className="hover:text-cyan-300 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Multilingual Hub
          </button>
          <button
            type="button"
            onClick={() => setIsTranslationOpen(true)}
            className="hover:text-cyan-300 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Translation Studio
          </button>
          <button
            type="button"
            onClick={() => setActiveLeftPanel('utilities')}
            className="hover:text-cyan-300 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Local Utilities
          </button>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="hover:text-cyan-300 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Voice Settings
          </button>
        </nav>

        {/* Zone 3: 1 primary action (Real-Time Live Conversation Toggle) */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            disabled={isStandby}
            onClick={handleToggleLiveSession}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 ${
              isLiveActive
                ? 'bg-red-500/25 text-red-200 border border-red-500/50 hover:bg-red-500/35'
                : 'bg-cyan-400 text-slate-950 hover:bg-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.35)]'
            }`}
          >
            {isLiveActive ? (
              <>
                <PhoneOff className="w-3.5 h-3.5" />
                <span>End Live Voice</span>
              </>
            ) : (
              <>
                <Radio className="w-3.5 h-3.5" />
                <span>Start Live Voice</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main 1440px Workspace Container */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">
        {/* Error / Offline Alert Banner */}
        {(errorBanner || isOffline) && (
          <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-amber-950/60 border border-amber-500/40 text-xs text-amber-200">
            <div className="flex items-center gap-2.5">
              {isOffline ? (
                <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span>
                {isOffline
                  ? 'Network connection is offline. DNYL Local Subsystem is active for math calculations, date/time, and saved history.'
                  : errorBanner}
              </span>
            </div>
            {errorBanner && (
              <button
                type="button"
                onClick={() => setErrorBanner(null)}
                className="text-amber-300 hover:text-white underline whitespace-nowrap shrink-0"
              >
                Dismiss
              </button>
            )}
          </div>
        )}

        {/* Primary 2-Column Holographic Command Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1">
          {/* Left Column (5 cols on Desktop): Reactor Core + Multilingual / Utility Deck */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            {/* Central Animated Reactor & Real-Time Live Voice Controller */}
            <HudReactorCore
              state={assistantState}
              liveStatus={liveStatus}
              liveMicMuted={liveMicMuted}
              liveAudioLevel={liveAudioLevel}
              liveUserTranscript={liveUserTranscript}
              liveAssistantTranscript={liveAssistantTranscript}
              interimTranscript={interimTranscript}
              activeLanguageName={
                preferences.preferredLanguage === 'auto'
                  ? `Auto-Detect (Mic: ${activeSttLangObj.name})`
                  : `Reply in ${preferences.preferredLanguage}`
              }
              activeLanguageDir={activeSttLangObj.direction}
              continuousListening={preferences.continuousListening}
              isStandby={isStandby}
              canRepeatLast={Boolean(lastAssistantMessage)}
              onToggleLiveSession={handleToggleLiveSession}
              onToggleLiveMicMute={handleToggleLiveMicMute}
              onToggleListening={handleToggleListening}
              onStopSpeaking={handleStopSpeaking}
              onRepeatLast={handleRepeatLast}
              onToggleStandby={handleToggleStandby}
            />

            {/* Secondary Control Deck: Switchable between Multilingual Matrix & Local Utilities */}
            <div className="flex-1 flex flex-col rounded-2xl bg-[#081022]/90 border border-cyan-500/20 p-5">
              {/* Segmented Filter Control */}
              <div className="flex items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-800/80">
                <div className="flex items-center gap-1 p-1 bg-[#040915] rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setActiveLeftPanel('languages')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      activeLeftPanel === 'languages'
                        ? 'bg-cyan-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Multilingual Matrix ({SUPPORTED_LANGUAGES.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveLeftPanel('utilities')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      activeLeftPanel === 'utilities'
                        ? 'bg-cyan-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Local Utilities & Clock
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsTranslationOpen(true)}
                  className="text-xs text-cyan-300 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Open Translator
                </button>
              </div>

              {activeLeftPanel === 'languages' ? (
                <div className="space-y-4">
                  {/* Response Language Mode & Mic Language Selectors */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        DNYL Response Language
                      </label>
                      <select
                        value={preferences.preferredLanguage}
                        onChange={(e) =>
                          updatePreferences({ preferredLanguage: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-[#040915] border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                      >
                        <option value="auto">Auto-Detect & Match User</option>
                        {SUPPORTED_LANGUAGES.map((lang) => (
                          <option key={lang.id} value={lang.name}>
                            {lang.name} ({lang.nativeName})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Voice Recognition Script
                      </label>
                      <select
                        value={preferences.sttRecognitionLang}
                        onChange={(e) =>
                          updatePreferences({ sttRecognitionLang: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-[#040915] border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                      >
                        {SUPPORTED_LANGUAGES.map((lang) => (
                          <option key={lang.id} value={lang.bcp47}>
                            {lang.name} — {lang.nativeName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Interactive Language Grid */}
                  <div>
                    <p className="text-xs text-slate-400 mb-2">
                      Select any language below to switch voice input or send a native test prompt:
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1">
                      {SUPPORTED_LANGUAGES.map((lang) => {
                        const isSelected =
                          preferences.sttRecognitionLang === lang.bcp47 &&
                          (preferences.preferredLanguage === lang.name ||
                            preferences.preferredLanguage === 'auto');
                        return (
                          <div
                            key={lang.id}
                            className={`p-2.5 rounded-xl border transition-colors flex flex-col justify-between gap-1.5 ${
                              isSelected
                                ? 'bg-cyan-950/60 border-cyan-400/50'
                                : 'bg-[#050b18] border-slate-800 hover:border-cyan-500/30'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-semibold text-slate-100 truncate">
                                {lang.name}
                              </span>
                              <span className="text-[11px] text-cyan-300 font-mono shrink-0">
                                {lang.direction.toUpperCase()}
                              </span>
                            </div>
                            <div
                              dir={lang.direction}
                              className="text-xs text-slate-300 truncate"
                            >
                              {lang.nativeName}
                            </div>
                            <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-800/80">
                              <button
                                type="button"
                                onClick={() =>
                                  updatePreferences({
                                    sttRecognitionLang: lang.bcp47,
                                  })
                                }
                                className="text-[11px] text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                              >
                                Set Mic
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  updatePreferences({
                                    sttRecognitionLang: lang.bcp47,
                                  });
                                  handleSendMessage(lang.samplePrompt);
                                }}
                                className="text-[11px] font-medium text-cyan-400 hover:text-cyan-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                              >
                                Ask DNYL
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                /* Local Utilities, Live Clock & Safe Website Launcher */
                <div className="space-y-4">
                  {/* Real-Time Clock & Date Display */}
                  <div className="p-3.5 rounded-xl bg-[#050b18] border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-slate-400 block">
                        Local System Chronometer
                      </span>
                      <span className="text-lg font-mono font-semibold text-cyan-300">
                        {currentTime.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-200 block">
                        {currentTime.toLocaleDateString([], {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {Intl.DateTimeFormat().resolvedOptions().timeZone}
                      </span>
                    </div>
                  </div>

                  {/* Instant Local Calculator */}
                  <form onSubmit={handleRunQuickCalc} className="space-y-2">
                    <label className="block text-xs font-medium text-slate-300">
                      Instant Offline Scientific Calculator
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={calcInput}
                        onChange={(e) => setCalcInput(e.target.value)}
                        placeholder="e.g., sqrt(144) + (25 * 4)"
                        className="flex-1 px-3 py-2 rounded-xl bg-[#040915] border border-slate-700 font-mono text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                      />
                      <button
                        type="submit"
                        className="px-3.5 py-2 rounded-xl bg-cyan-500 text-slate-950 font-semibold text-xs hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Compute
                      </button>
                    </div>
                    <div className="px-3 py-2 rounded-xl bg-[#040915] border border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Result:</span>
                      <span className="font-mono font-semibold text-cyan-300">
                        {calcOutput}
                      </span>
                    </div>
                  </form>

                  {/* Verified Quick External Website Launchers */}
                  <div>
                    <span className="block text-xs font-medium text-slate-300 mb-2">
                      Verified External Portals
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { title: 'Wikipedia', url: 'https://www.wikipedia.org' },
                        { title: 'Google Scholar', url: 'https://scholar.google.com' },
                        { title: 'GitHub', url: 'https://github.com' },
                        { title: 'arXiv', url: 'https://arxiv.org' },
                        { title: 'MDN Docs', url: 'https://developer.mozilla.org' },
                        { title: 'YouTube', url: 'https://www.youtube.com' },
                      ].map((site) => (
                        <a
                          key={site.title}
                          href={site.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#050b18] border border-slate-800 hover:border-cyan-500/40 text-xs text-slate-200 hover:text-cyan-300 transition-colors"
                        >
                          <span className="truncate">{site.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0 text-slate-400" />
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column (7 cols on Desktop): Multilingual Conversation Console */}
          <div className="lg:col-span-7 flex flex-col rounded-2xl bg-[#081022]/90 border border-cyan-500/20 overflow-hidden min-h-[640px] max-h-[860px]">
            {/* Console Toolbar */}
            <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-[#060c1a]/70">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Globe className="w-4 h-4 text-cyan-400" />
                <span className="font-semibold text-slate-100">
                  DNYL Conversation Log
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{messages.length} entries</span>
                {liveStatus === 'connected' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-cyan-300 font-medium">
                      Live Duplex Active
                    </span>
                  </>
                )}
              </div>

              {/* Search & Audio Controls */}
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter history..."
                    className="pl-8 pr-3 py-1.5 rounded-xl bg-[#040915] border border-slate-700/80 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 w-40 sm:w-48"
                  />
                </div>

                <button
                  type="button"
                  onClick={() =>
                    updatePreferences({
                      autoSpeakResponses: !preferences.autoSpeakResponses,
                    })
                  }
                  title={
                    preferences.autoSpeakResponses
                      ? 'Auto-Speak Enabled (Click to Mute Auto-Speak)'
                      : 'Auto-Speak Muted (Click to Enable Auto-Speak)'
                  }
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    preferences.autoSpeakResponses
                      ? 'bg-cyan-950/60 border-cyan-500/40 text-cyan-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  {preferences.autoSpeakResponses ? (
                    <>
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Voice On</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-3.5 h-3.5" />
                      <span>Muted</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleClearHistory}
                  title="Clear Conversation Log"
                  className="p-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-400 hover:text-red-300 hover:border-red-500/40 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Multilingual Starter Strip */}
            <div className="px-5 py-2.5 bg-[#050b18]/80 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto text-xs">
              <span className="text-slate-400 shrink-0">Try asking:</span>
              <button
                type="button"
                onClick={() =>
                  handleSendMessage(
                    'DNYL, explain how quantum computers work in simple English.'
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-cyan-950/60 border border-slate-800 hover:border-cyan-500/30 text-slate-200 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                Quantum Computing (EN)
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSendMessage(
                    'ڈی این وائی ایل، مصنوعی ذہانت کے فوائد آسان اردو میں بیان کریں۔'
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-cyan-950/60 border border-slate-800 hover:border-cyan-500/30 text-slate-200 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                اردو (Urdu Script)
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSendMessage(
                    'DNYL, mujhe Roman Urdu mein batayein ke black hole kya hota hai aur yeh kaise banta hai?'
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-cyan-950/60 border border-slate-800 hover:border-cyan-500/30 text-slate-200 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                Roman Urdu
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSendMessage(
                    'يا DNYL، ما هي أهم تطبيقات الذكاء الاصطناعي في الطب الحديث؟'
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-cyan-950/60 border border-slate-800 hover:border-cyan-500/30 text-slate-200 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                العربية (Arabic)
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSendMessage('calculate (1920 * 1080) / 1000')
                }
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-cyan-950/60 border border-slate-800 hover:border-cyan-500/30 text-slate-200 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                Math Calculation
              </button>
            </div>

            {/* Scrollable Message Stream */}
            <MessageStream
              messages={messages}
              isProcessing={isProcessing}
              searchQuery={searchQuery}
              onSpeakMessage={(msg) =>
                speakText(
                  msg.spokenSummary || msg.text,
                  msg.languageCode,
                  msg.languageName
                )
              }
              onSelectStarterPrompt={(prompt, bcp47) => {
                updatePreferences({ sttRecognitionLang: bcp47 });
                handleSendMessage(prompt);
              }}
            />

            {/* Bottom Multilingual Input Composer */}
            <form
              onSubmit={handleFormSubmit}
              className="p-4 border-t border-slate-800 bg-[#050b18]/95 flex flex-col gap-2.5"
            >
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={isStandby}
                  onClick={handleToggleListening}
                  title={
                    isListening
                      ? 'Stop Microphone Dictation'
                      : 'Speak in your selected language'
                  }
                  className={`p-3 rounded-xl border transition-colors shrink-0 cursor-pointer disabled:opacity-40 ${
                    isListening
                      ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                      : 'bg-[#081226] text-cyan-300 border-cyan-500/30 hover:bg-cyan-950/60'
                  }`}
                >
                  {isListening ? (
                    <MicOff className="w-5 h-5" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </button>

                <input
                  type="text"
                  dir={inputDirection}
                  disabled={isStandby}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={
                    isStandby
                      ? 'DNYL is in Standby Mode. Click Wake Core to resume...'
                      : 'Speak or type in English, Urdu (اردو), Roman Urdu, Arabic, Hindi, Persian, French, or any language...'
                  }
                  className={`flex-1 px-4 py-3 rounded-xl bg-[#081226] border border-slate-700/90 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 disabled:opacity-50 ${
                    inputDirection === 'rtl' ? 'text-right text-base' : 'text-left'
                  }`}
                />

                <button
                  type="submit"
                  disabled={!inputText.trim() || isProcessing || isStandby}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                  <span>Send</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 px-1">
                <span>
                  Active Voice Input: <strong className="text-slate-200">{activeSttLangObj.name} ({activeSttLangObj.nativeName})</strong> · Response Mode: <strong className="text-cyan-300">{preferences.preferredLanguage === 'auto' ? 'Auto-Match Language' : preferences.preferredLanguage}</strong>
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsTranslationOpen(true)}
                    className="hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-cyan-400" />
                    <span>Translate Text</span>
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(true)}
                    className="hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Calculator className="w-3 h-3 text-cyan-400" />
                    <span>Configure Voice ({preferences.neuralVoice})</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </main>

      {/* Modals & Drawers */}
      <TranslationStudioModal
        isOpen={isTranslationOpen}
        onClose={() => setIsTranslationOpen(false)}
        onSpeakText={speakText}
      />

      <SettingsDrawer
        isOpen={isSettingsOpen}
        preferences={preferences}
        browserSTTSupported={browserSTTSupported}
        onClose={() => setIsSettingsOpen(false)}
        onUpdatePreferences={updatePreferences}
        onResetPreferences={handleResetPreferences}
        onClearHistory={handleClearHistory}
        onTestVoice={() =>
          speakText(
            'Greetings. I am DNYL. All multilingual voice and conversational systems are operational.',
            'en-US',
            'English'
          )
        }
      />
    </div>
  );
}
