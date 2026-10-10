import React, { useEffect, useState } from 'react';
import { Mic, MicOff, Volume2, Square, RotateCcw, Power, Radio, PhoneOff } from 'lucide-react';
import { AssistantState } from '../types/dnyl';
import { detectScriptDirection } from '../config/languages';

interface HudReactorCoreProps {
  state: AssistantState;
  liveStatus: 'disconnected' | 'connecting' | 'connected';
  liveMicMuted: boolean;
  liveAudioLevel: number;
  liveUserTranscript: string;
  liveAssistantTranscript: string;
  interimTranscript: string;
  activeLanguageName: string;
  activeLanguageDir: 'ltr' | 'rtl';
  continuousListening: boolean;
  isStandby: boolean;
  canRepeatLast: boolean;
  onToggleLiveSession: () => void;
  onToggleLiveMicMute: () => void;
  onToggleListening: () => void;
  onStopSpeaking: () => void;
  onRepeatLast: () => void;
  onToggleStandby: () => void;
}

export const HudReactorCore: React.FC<HudReactorCoreProps> = ({
  state,
  liveStatus,
  liveMicMuted,
  liveAudioLevel,
  liveUserTranscript,
  liveAssistantTranscript,
  interimTranscript,
  activeLanguageName,
  activeLanguageDir,
  continuousListening,
  isStandby,
  canRepeatLast,
  onToggleLiveSession,
  onToggleLiveMicMute,
  onToggleListening,
  onStopSpeaking,
  onRepeatLast,
  onToggleStandby,
}) => {
  const [waveBars, setWaveBars] = useState<number[]>(Array(24).fill(18));

  const isLiveConnected = liveStatus === 'connected';
  const isLiveConnecting = liveStatus === 'connecting';

  // Animate sound-wave visualizer bars smoothly when in Live session, listening, or speaking
  useEffect(() => {
    const isActive =
      isLiveConnected ||
      isLiveConnecting ||
      state === 'listening' ||
      state === 'speaking' ||
      state === 'processing';

    if (!isActive) {
      setWaveBars(Array(24).fill(14));
      return;
    }

    const interval = window.setInterval(() => {
      setWaveBars((prev) =>
        prev.map((_, idx) => {
          const centerFactor = 1 - Math.abs(idx - 11.5) / 13;
          if (state === 'speaking') {
            return Math.round(22 + Math.random() * 76 * centerFactor);
          }
          if (isLiveConnected) {
            const boost = Math.max(18, liveAudioLevel * 1.15);
            return Math.round(14 + Math.random() * boost * centerFactor);
          }
          if (state === 'listening') {
            return Math.round(16 + Math.random() * 58 * centerFactor);
          }
          return Math.round(18 + Math.sin(Date.now() / 180 + idx * 0.5) * 28 * centerFactor + 20);
        })
      );
    }, 85);

    return () => window.clearInterval(interval);
  }, [state, isLiveConnected, isLiveConnecting, liveAudioLevel]);

  const getStateLabel = () => {
    if (isLiveConnecting) return 'Connecting Real-Time Voice Stream';
    if (isLiveConnected) {
      if (state === 'speaking') return 'Live Duplex · DNYL Speaking';
      if (liveMicMuted) return 'Live Duplex · Microphone Muted';
      return 'Live Duplex · Listening & Responding in Real Time';
    }
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
        return 'Ready for Real-Time Voice or Text';
    }
  };

  const getCoreAccentClasses = () => {
    if (isLiveConnected) {
      return state === 'speaking'
        ? 'border-blue-400 shadow-[0_0_75px_rgba(59,130,246,0.65)] text-blue-200'
        : 'border-cyan-300 shadow-[0_0_70px_rgba(34,211,238,0.6)] text-cyan-200';
    }
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

  const activeTranscriptText =
    liveAssistantTranscript || liveUserTranscript || interimTranscript;
  const activeTranscriptDir = activeTranscriptText
    ? detectScriptDirection(activeTranscriptText, activeLanguageDir)
    : activeLanguageDir;

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
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 border cursor-pointer ${
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
      <div className="relative my-5 flex items-center justify-center w-60 h-60 sm:w-68 sm:h-68 select-none">
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
          onClick={isLiveConnected ? onToggleLiveMicMute : onToggleLiveSession}
          aria-label={
            isLiveConnected
              ? liveMicMuted
                ? 'Unmute live microphone'
                : 'Mute live microphone'
              : 'Start Real-Time Live Voice Conversation'
          }
          className={`relative z-10 w-36 h-36 rounded-full bg-gradient-to-b from-[#0b1936] via-[#071226] to-[#040a17] border-2 flex flex-col items-center justify-center transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 cursor-pointer disabled:cursor-not-allowed ${getCoreAccentClasses()} ${
            isLiveConnected || state === 'listening' || state === 'speaking'
              ? 'animate-pulse-core'
              : ''
          }`}
        >
          <div className="absolute inset-2.5 rounded-full border border-cyan-400/25 pointer-events-none" />
          <div className="absolute inset-5 rounded-full border border-sky-400/20 pointer-events-none" />

          {isLiveConnected ? (
            liveMicMuted ? (
              <MicOff className="w-9 h-9 text-amber-300" />
            ) : state === 'speaking' ? (
              <Volume2 className="w-9 h-9 text-blue-300 drop-shadow-[0_0_10px_rgba(96,165,250,0.8)]" />
            ) : (
              <Radio className="w-9 h-9 text-cyan-300 drop-shadow-[0_0_10px_rgba(34,211,238,0.9)]" />
            )
          ) : state === 'listening' ? (
            <Mic className="w-9 h-9 text-cyan-300 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
          ) : state === 'speaking' ? (
            <Volume2 className="w-9 h-9 text-blue-300 drop-shadow-[0_0_10px_rgba(96,165,250,0.8)]" />
          ) : state === 'standby' ? (
            <MicOff className="w-8 h-8 text-slate-500" />
          ) : (
            <Radio className="w-8 h-8 text-cyan-400/90" />
          )}

          <span className="mt-2 font-display text-sm font-bold tracking-widest text-slate-100">
            DNYL
          </span>
          <span className="text-[11px] font-mono text-cyan-300/80 mt-0.5">
            {isLiveConnecting
              ? 'CONNECTING...'
              : isLiveConnected
                ? liveMicMuted
                  ? 'MIC MUTED'
                  : state === 'speaking'
                    ? 'LIVE SPEAKING'
                    : 'LIVE DUPLEX'
                : state === 'listening'
                  ? 'DICTATING'
                  : state === 'processing'
                    ? 'THINKING'
                    : state === 'speaking'
                      ? 'SPEAKING'
                      : state === 'standby'
                        ? 'OFFLINE'
                        : 'START LIVE'}
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
                  : isLiveConnected || state === 'listening'
                    ? 'bg-cyan-400'
                    : state === 'processing' || isLiveConnecting
                      ? 'bg-sky-400'
                      : 'bg-slate-700'
              }`}
            />
          ))}
        </div>

        {/* Live Real-Time Speech Transcription Preview */}
        <div
          dir={activeTranscriptDir}
          className="w-full min-h-[3.25rem] px-3.5 py-2 rounded-xl bg-[#050b18]/80 border border-slate-800/80 flex flex-col items-center justify-center text-center"
        >
          {liveAssistantTranscript ? (
            <p className="text-xs text-blue-200 font-medium leading-relaxed">
              <span className="text-cyan-400 font-semibold mr-1.5">DNYL:</span>
              {liveAssistantTranscript}
            </p>
          ) : liveUserTranscript ? (
            <p className="text-xs text-cyan-200 font-medium leading-relaxed">
              <span className="text-slate-400 font-semibold mr-1.5">You:</span>
              {liveUserTranscript}
            </p>
          ) : interimTranscript ? (
            <p className="text-xs text-cyan-200 font-medium leading-relaxed">
              {interimTranscript}
            </p>
          ) : (
            <p className="text-xs text-slate-400">
              {isLiveConnected
                ? 'Real-Time Live Mode active. Speak naturally in any language—interrupt anytime.'
                : state === 'listening'
                  ? 'Listening for voice dictation...'
                  : 'Click "Real-Time Live Voice" below for continuous low-latency duplex conversation.'}
            </p>
          )}
        </div>
      </div>

      {/* Primary Real-Time Live Session Banner Button */}
      <div className="w-full mt-4 z-10">
        <button
          type="button"
          disabled={isStandby || isLiveConnecting}
          onClick={onToggleLiveSession}
          className={`w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
            isLiveConnected
              ? 'bg-red-500/20 text-red-200 border-red-500/50 hover:bg-red-500/30'
              : 'bg-cyan-400 text-slate-950 border-cyan-300 hover:bg-cyan-300 shadow-[0_0_25px_rgba(34,211,238,0.3)]'
          }`}
        >
          {isLiveConnected ? (
            <>
              <PhoneOff className="w-4 h-4 shrink-0" />
              <span>End Real-Time Live Conversation</span>
            </>
          ) : (
            <>
              <Radio className="w-4 h-4 shrink-0" />
              <span>
                {isLiveConnecting
                  ? 'Connecting Real-Time Voice Stream...'
                  : 'Start Real-Time Live Voice Conversation'}
              </span>
            </>
          )}
        </button>
      </div>

      {/* Secondary Voice Controls */}
      <div className="w-full grid grid-cols-3 gap-2.5 mt-2.5 z-10">
        {isLiveConnected ? (
          <button
            type="button"
            onClick={onToggleLiveMicMute}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 border cursor-pointer ${
              liveMicMuted
                ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                : 'bg-cyan-950/50 text-cyan-200 border-cyan-500/30 hover:bg-cyan-900/50'
            }`}
          >
            {liveMicMuted ? (
              <>
                <MicOff className="w-3.5 h-3.5 shrink-0" />
                <span>Unmute Mic</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5 shrink-0" />
                <span>Mute Mic</span>
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            disabled={isStandby}
            onClick={onToggleListening}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              state === 'listening'
                ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-semibold'
                : 'bg-cyan-950/50 text-cyan-200 border-cyan-500/30 hover:bg-cyan-900/50'
            }`}
          >
            {state === 'listening' ? (
              <>
                <MicOff className="w-3.5 h-3.5 shrink-0" />
                <span>Stop Dictation</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5 shrink-0" />
                <span>Voice Dictation</span>
              </>
            )}
          </button>
        )}

        <button
          type="button"
          disabled={state !== 'speaking'}
          onClick={onStopSpeaking}
          className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium bg-slate-900/90 text-slate-200 border border-slate-700/80 hover:border-cyan-500/40 hover:text-cyan-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Square className="w-3.5 h-3.5 shrink-0" />
          <span>Stop Voice</span>
        </button>

        <button
          type="button"
          disabled={!canRepeatLast || isStandby || isLiveConnected}
          onClick={onRepeatLast}
          className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium bg-slate-900/90 text-slate-200 border border-slate-700/80 hover:border-cyan-500/40 hover:text-cyan-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RotateCcw className="w-3.5 h-3.5 shrink-0" />
          <span>Repeat</span>
        </button>
      </div>
    </div>
  );
};
