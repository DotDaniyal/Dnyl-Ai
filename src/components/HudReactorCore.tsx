import React, { useEffect, useState } from 'react';
import { Mic, MicOff, Volume2, Square, RotateCcw, Power } from 'lucide-react';
import { AssistantState } from '../types/dnyl';

interface HudReactorCoreProps {
  state: AssistantState;
  interimTranscript: string;
  activeLanguageName: string;
  activeLanguageDir: 'ltr' | 'rtl';
  continuousListening: boolean;
  isStandby: boolean;
  canRepeatLast: boolean;
  onToggleListening: () => void;
  onStopSpeaking: () => void;
  onRepeatLast: () => void;
  onToggleStandby: () => void;
}

export const HudReactorCore: React.FC<HudReactorCoreProps> = ({
  state,
  interimTranscript,
  activeLanguageName,
  activeLanguageDir,
  continuousListening,
  isStandby,
  canRepeatLast,
  onToggleListening,
  onStopSpeaking,
  onRepeatLast,
  onToggleStandby,
}) => {
  const [waveBars, setWaveBars] = useState<number[]>(Array(24).fill(18));

  // Animate sound-wave visualizer bars smoothly when listening or speaking
  useEffect(() => {
    if (state !== 'listening' && state !== 'speaking' && state !== 'processing') {
      setWaveBars(Array(24).fill(14));
      return;
    }

    const interval = window.setInterval(() => {
      setWaveBars((prev) =>
        prev.map((_, idx) => {
          const centerFactor = 1 - Math.abs(idx - 11.5) / 13;
          if (state === 'speaking') {
            return Math.round(20 + Math.random() * 75 * centerFactor);
          }
          if (state === 'listening') {
            return Math.round(16 + Math.random() * 58 * centerFactor);
          }
          // processing wave
          return Math.round(18 + Math.sin(Date.now() / 180 + idx * 0.5) * 28 * centerFactor + 20);
        })
      );
    }, 90);

    return () => window.clearInterval(interval);
  }, [state]);

  const getStateLabel = () => {
    switch (state) {
      case 'booting':
        return 'Initializing Core Systems';
      case 'listening':
        return continuousListening ? 'Listening Continuously' : 'Listening for Voice Input';
      case 'processing':
        return 'Analyzing & Synthesizing';
      case 'speaking':
        return 'Speaking Response';
      case 'standby':
        return 'Standby Mode';
      default:
        return 'Ready for Voice or Text';
    }
  };

  const getCoreAccentClasses = () => {
    switch (state) {
      case 'listening':
        return 'border-cyan-400 shadow-[0_0_55px_rgba(34,211,238,0.45)] text-cyan-300';
      case 'processing':
        return 'border-sky-400 shadow-[0_0_60px_rgba(56,189,248,0.5)] text-sky-300';
      case 'speaking':
        return 'border-blue-400 shadow-[0_0_65px_rgba(59,130,246,0.55)] text-blue-200';
      case 'standby':
        return 'border-slate-800 shadow-none text-slate-500 opacity-60';
      default:
        return 'border-cyan-500/50 shadow-[0_0_35px_rgba(6,182,212,0.22)] text-cyan-300';
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-between p-6 rounded-2xl bg-[#081022]/90 border border-cyan-500/20 overflow-hidden">
      {/* Subtle HUD Corner Brackets */}
      <div className="pointer-events-none absolute top-3 left-3 w-4 h-4 border-t border-l border-cyan-400/40" />
      <div className="pointer-events-none absolute top-3 right-3 w-4 h-4 border-t border-r border-cyan-400/40" />
      <div className="pointer-events-none absolute bottom-3 left-3 w-4 h-4 border-b border-l border-cyan-400/40" />
      <div className="pointer-events-none absolute bottom-3 right-3 w-4 h-4 border-b border-r border-cyan-400/40" />

      {/* Header Row inside Core Panel */}
      <div className="w-full flex items-center justify-between gap-2 z-10">
        <div>
          <h2 className="text-base font-semibold tracking-wide text-slate-100">
            DNYL Holographic Core
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {getStateLabel()} · {activeLanguageName}
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleStandby}
          title={isStandby ? 'Power On DNYL Core' : 'Enter Standby Mode'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 border ${
            isStandby
              ? 'bg-slate-900 border-slate-700 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40'
              : 'bg-cyan-950/60 border-cyan-500/30 text-cyan-300 hover:bg-cyan-900/50'
          }`}
        >
          <Power className="w-3.5 h-3.5" />
          <span>{isStandby ? 'Wake Core' : 'Standby'}</span>
        </button>
      </div>

      {/* Central Animated Arc Reactor Visualization */}
      <div className="relative my-6 flex items-center justify-center w-64 h-64 sm:w-72 sm:h-72 select-none">
        {/* Outer SVG HUD Ring 1 */}
        <svg
          viewBox="0 0 260 260"
          className={`absolute inset-0 w-full h-full ${
            isStandby ? 'opacity-20' : 'animate-spin-slow opacity-75'
          }`}
        >
          <circle
            cx="130"
            cy="130"
            r="122"
            fill="none"
            stroke="rgba(34, 211, 238, 0.18)"
            strokeWidth="1.5"
          />
          <circle
            cx="130"
            cy="130"
            r="122"
            fill="none"
            stroke="rgba(34, 211, 238, 0.65)"
            strokeWidth="2.5"
            strokeDasharray="28 42 12 42 55 42"
            strokeLinecap="round"
          />
          <circle
            cx="130"
            cy="130"
            r="108"
            fill="none"
            stroke="rgba(56, 189, 248, 0.25)"
            strokeWidth="1"
            strokeDasharray="4 8"
          />
        </svg>

        {/* Middle Counter-Rotating HUD Ring 2 */}
        <svg
          viewBox="0 0 260 260"
          className={`absolute inset-0 w-full h-full ${
            isStandby ? 'opacity-15' : 'animate-spin-reverse-slow opacity-85'
          }`}
        >
          <circle
            cx="130"
            cy="130"
            r="92"
            fill="none"
            stroke="rgba(59, 130, 246, 0.55)"
            strokeWidth="3"
            strokeDasharray="48 28 16 28"
          />
          <circle
            cx="130"
            cy="130"
            r="78"
            fill="none"
            stroke="rgba(34, 211, 238, 0.35)"
            strokeWidth="1.5"
            strokeDasharray="10 14"
          />
        </svg>

        {/* Inner Reactor Energy Chamber Button */}
        <button
          type="button"
          disabled={isStandby}
          onClick={onToggleListening}
          aria-label={state === 'listening' ? 'Stop voice listening' : 'Start voice listening'}
          className={`relative z-10 w-36 h-36 rounded-full bg-gradient-to-b from-[#0b1936] via-[#071226] to-[#040a17] border-2 flex flex-col items-center justify-center transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 cursor-pointer disabled:cursor-not-allowed ${getCoreAccentClasses()} ${
            state === 'listening' || state === 'speaking' ? 'animate-pulse-core' : ''
          }`}
        >
          {/* Inner Geometric Arc Reactor Tri-Ring */}
          <div className="absolute inset-2.5 rounded-full border border-cyan-400/25 pointer-events-none" />
          <div className="absolute inset-5 rounded-full border border-sky-400/20 pointer-events-none" />

          {state === 'listening' ? (
            <Mic className="w-9 h-9 text-cyan-300 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
          ) : state === 'speaking' ? (
            <Volume2 className="w-9 h-9 text-blue-300 drop-shadow-[0_0_10px_rgba(96,165,250,0.8)]" />
          ) : state === 'standby' ? (
            <MicOff className="w-8 h-8 text-slate-500" />
          ) : (
            <Mic className="w-8 h-8 text-cyan-400/90" />
          )}

          <span className="mt-2 font-display text-sm font-bold tracking-widest text-slate-100">
            DNYL
          </span>
          <span className="text-[11px] font-mono text-cyan-300/80 mt-0.5">
            {state === 'listening'
              ? 'ACTIVE MIC'
              : state === 'processing'
                ? 'THINKING'
                : state === 'speaking'
                  ? 'SPEAKING'
                  : state === 'standby'
                    ? 'OFFLINE'
                    : 'TAP TO SPEAK'}
          </span>
        </button>
      </div>

      {/* Sound-Wave Spectrum Visualizer */}
      <div className="w-full flex flex-col items-center gap-2 z-10">
        <div
          aria-hidden="true"
          className="w-full h-12 px-4 flex items-center justify-center gap-1 bg-[#050b18]/90 rounded-xl border border-cyan-500/15"
        >
          {waveBars.map((heightPct, idx) => (
            <div
              key={idx}
              style={{
                transform: `scaleY(${Math.max(0.15, heightPct / 100)})`,
              }}
              className={`w-1.5 h-8 rounded-full transition-transform duration-100 origin-center ${
                state === 'speaking'
                  ? 'bg-blue-400'
                  : state === 'listening'
                    ? 'bg-cyan-400'
                    : state === 'processing'
                      ? 'bg-sky-400'
                      : 'bg-slate-700'
              }`}
            />
          ))}
        </div>

        {/* Live Interim Speech Transcription Preview */}
        <div
          dir={activeLanguageDir}
          className="w-full min-h-[2.75rem] px-3.5 py-2 rounded-xl bg-[#050b18]/80 border border-slate-800/80 flex items-center justify-center text-center"
        >
          {interimTranscript ? (
            <p className="text-xs text-cyan-200 font-medium leading-relaxed">
              {interimTranscript}
            </p>
          ) : (
            <p className="text-xs text-slate-400">
              {state === 'listening'
                ? 'Listening for English, Urdu, Roman Urdu, Arabic, or any supported language...'
                : state === 'speaking'
                  ? 'DNYL is speaking aloud. You can interrupt or stop speech below.'
                  : 'Click the central reactor or microphone button to converse by voice.'}
            </p>
          )}
        </div>
      </div>

      {/* Primary Voice Action Controls */}
      <div className="w-full grid grid-cols-3 gap-2.5 mt-4 z-10">
        <button
          type="button"
          disabled={isStandby}
          onClick={onToggleListening}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
            state === 'listening'
              ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-semibold'
              : 'bg-cyan-950/50 text-cyan-200 border-cyan-500/30 hover:bg-cyan-900/50'
          }`}
        >
          {state === 'listening' ? (
            <>
              <MicOff className="w-3.5 h-3.5 shrink-0" />
              <span>Mute Mic</span>
            </>
          ) : (
            <>
              <Mic className="w-3.5 h-3.5 shrink-0" />
              <span>Listen</span>
            </>
          )}
        </button>

        <button
          type="button"
          disabled={state !== 'speaking'}
          onClick={onStopSpeaking}
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-medium bg-slate-900/90 text-slate-200 border border-slate-700/80 hover:border-cyan-500/40 hover:text-cyan-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Square className="w-3.5 h-3.5 shrink-0" />
          <span>Stop Voice</span>
        </button>

        <button
          type="button"
          disabled={!canRepeatLast || isStandby}
          onClick={onRepeatLast}
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-medium bg-slate-900/90 text-slate-200 border border-slate-700/80 hover:border-cyan-500/40 hover:text-cyan-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RotateCcw className="w-3.5 h-3.5 shrink-0" />
          <span>Repeat</span>
        </button>
      </div>
    </div>
  );
};
