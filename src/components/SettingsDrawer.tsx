import React, { useEffect, useState } from 'react';
import { X, Sliders, Trash2, RotateCcw, Volume2, Mic } from 'lucide-react';
import { DNYLPreferences, NeuralVoiceName, STTProviderType, TTSProviderType } from '../types/dnyl';
import { NEURAL_VOICES, SUPPORTED_LANGUAGES } from '../config/languages';

interface SettingsDrawerProps {
  isOpen: boolean;
  preferences: DNYLPreferences;
  browserSTTSupported: boolean;
  onClose: () => void;
  onUpdatePreferences: (patch: Partial<DNYLPreferences>) => void;
  onResetPreferences: () => void;
  onClearHistory: () => void;
  onTestVoice: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  preferences,
  browserSTTSupported,
  onClose,
  onUpdatePreferences,
  onResetPreferences,
  onClearHistory,
  onTestVoice,
}) => {
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const loadVoices = () => {
      const list = window.speechSynthesis.getVoices();
      setBrowserVoices(list);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-[#070f20] border-l border-cyan-500/30 h-full flex flex-col justify-between overflow-hidden shadow-2xl">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-slate-100">
              DNYL Configuration & Voice Providers
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 transition-colors"
            aria-label="Close Settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* 1. Language & Conversational Intelligence */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-cyan-300">
              01. Multilingual Detection & Response Style
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Response Language Mode
                </label>
                <select
                  value={preferences.preferredLanguage}
                  onChange={(e) =>
                    onUpdatePreferences({ preferredLanguage: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#040915] border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                >
                  <option value="auto">Auto-Detect & Match User Language</option>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.id} value={lang.name}>
                      Always Reply in {lang.name} ({lang.nativeName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Microphone Recognition Language
                </label>
                <select
                  value={preferences.sttRecognitionLang}
                  onChange={(e) =>
                    onUpdatePreferences({ sttRecognitionLang: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#040915] border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.id} value={lang.bcp47}>
                      {lang.name} — {lang.nativeName} ({lang.bcp47})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Communication Depth
              </label>
              <div className="grid grid-cols-3 gap-2 p-1 bg-[#040915] rounded-xl border border-slate-800">
                {(['concise', 'balanced', 'detailed'] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => onUpdatePreferences({ responseStyle: style })}
                    className={`py-2 px-3 rounded-lg text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                      preferences.responseStyle === style
                        ? 'bg-cyan-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* 2. Speech-to-Text (STT) Provider Abstraction */}
          <section className="space-y-4 pt-4 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-cyan-300">
                02. Speech-to-Text (STT) Provider Layer
              </h3>
              <Mic className="w-4 h-4 text-cyan-400" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Active Speech Recognition Engine
              </label>
              <select
                value={preferences.sttProvider}
                onChange={(e) =>
                  onUpdatePreferences({ sttProvider: e.target.value as STTProviderType })
                }
                className="w-full px-3 py-2 rounded-xl bg-[#040915] border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
              >
                <option value="browser_continuous" disabled={!browserSTTSupported}>
                  Browser Continuous SpeechRecognition {browserSTTSupported ? '(Real-Time Streaming)' : '(Unsupported in Browser)'}
                </option>
                <option value="neural_cloud">
                  DNYL Neural Cloud Audio Transcription (Multilingual High-Precision)
                </option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                {preferences.sttProvider === 'browser_continuous'
                  ? 'Streams recognized speech in real time and automatically resumes listening after DNYL finishes speaking.'
                  : 'Records crisp audio via MediaRecorder and transcribes any spoken language on the server.'}
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 py-2">
              <div>
                <p className="text-xs font-medium text-slate-200">
                  Continuous Auto-Resume Listening
                </p>
                <p className="text-[11px] text-slate-400">
                  Keep microphone ready after each sentence without repeated clicks
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.continuousListening}
                onChange={(e) =>
                  onUpdatePreferences({ continuousListening: e.target.checked })
                }
                className="w-4 h-4 accent-cyan-400 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between gap-4 py-1">
              <div>
                <p className="text-xs font-medium text-slate-200">
                  Automatic Voice Interruption Handling
                </p>
                <p className="text-[11px] text-slate-400">
                  Stop DNYL from speaking over you when new user input is initiated
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.interruptOnSpeech}
                onChange={(e) =>
                  onUpdatePreferences({ interruptOnSpeech: e.target.checked })
                }
                className="w-4 h-4 accent-cyan-400 rounded cursor-pointer"
              />
            </div>
          </section>

          {/* 3. Text-to-Speech (TTS) Provider Abstraction & Voice Controls */}
          <section className="space-y-4 pt-4 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-cyan-300">
                03. Text-to-Speech (TTS) Provider & Voice Controls
              </h3>
              <button
                type="button"
                onClick={onTestVoice}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-950/70 border border-cyan-500/30 text-xs text-cyan-200 hover:bg-cyan-900/60 transition-colors"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Test Voice</span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 py-1">
              <div>
                <p className="text-xs font-medium text-slate-200">
                  Automatically Speak DNYL Answers Aloud
                </p>
                <p className="text-[11px] text-slate-400">
                  Read responses aloud in the selected or detected language
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.autoSpeakResponses}
                onChange={(e) =>
                  onUpdatePreferences({ autoSpeakResponses: e.target.checked })
                }
                className="w-4 h-4 accent-cyan-400 rounded cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Speech Synthesis Provider
              </label>
              <select
                value={preferences.ttsProvider}
                onChange={(e) =>
                  onUpdatePreferences({ ttsProvider: e.target.value as TTSProviderType })
                }
                className="w-full px-3 py-2 rounded-xl bg-[#040915] border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
              >
                <option value="neural_hybrid">
                  Hybrid Neural TTS + Browser Fallback (Recommended)
                </option>
                <option value="neural_only">
                  DNYL Server Neural Voice Only (24kHz WAV)
                </option>
                <option value="browser_only">
                  Local Browser / OS SpeechSynthesis Engine
                </option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  DNYL Neural Voice Persona
                </label>
                <select
                  value={preferences.neuralVoice}
                  onChange={(e) =>
                    onUpdatePreferences({ neuralVoice: e.target.value as NeuralVoiceName })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#040915] border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                >
                  {NEURAL_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label} — {v.style}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Browser Fallback Voice ({browserVoices.length} available)
                </label>
                <select
                  value={preferences.browserVoiceURI}
                  onChange={(e) =>
                    onUpdatePreferences({ browserVoiceURI: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#040915] border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                >
                  <option value="">Automatic Language-Matched Voice</option>
                  {browserVoices.map((bv) => (
                    <option key={bv.voiceURI} value={bv.voiceURI}>
                      {bv.name} ({bv.lang})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Speed & Volume Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Speech Speed</span>
                  <span className="font-mono text-cyan-300">
                    {preferences.speechRate.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0.7"
                  max="1.5"
                  step="0.05"
                  value={preferences.speechRate}
                  onChange={(e) =>
                    onUpdatePreferences({ speechRate: parseFloat(e.target.value) })
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Output Volume</span>
                  <span className="font-mono text-cyan-300">
                    {Math.round(preferences.speechVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={preferences.speechVolume}
                  onChange={(e) =>
                    onUpdatePreferences({ speechVolume: parseFloat(e.target.value) })
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>
          </section>

          {/* 4. Memory & Privacy Controls */}
          <section className="space-y-4 pt-4 border-t border-slate-800/80">
            <h3 className="text-sm font-semibold text-cyan-300">
              04. Conversational Memory & Local Storage
            </h3>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-slate-200">
                  Persist Conversation Context Locally
                </p>
                <p className="text-[11px] text-slate-400">
                  Save conversation history in your browser across reloads
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.memoryEnabled}
                onChange={(e) =>
                  onUpdatePreferences({ memoryEnabled: e.target.checked })
                }
                className="w-4 h-4 accent-cyan-400 rounded cursor-pointer"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClearHistory}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-950/50 border border-red-500/30 text-xs font-medium text-red-200 hover:bg-red-900/50 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Saved Conversations</span>
              </button>

              <button
                type="button"
                onClick={onResetPreferences}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-medium text-slate-300 hover:border-cyan-500/40 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Default Settings</span>
              </button>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-[#050b18] flex items-center justify-between text-xs text-slate-400">
          <span>DNYL Configuration</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-cyan-500 text-slate-950 font-semibold hover:bg-cyan-400 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
