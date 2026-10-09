import React, { useState } from 'react';
import { Languages, ArrowRightLeft, Volume2, Copy, Check, X, Sparkles } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../config/languages';
import { TranslationResult } from '../types/dnyl';

interface TranslationStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSpeakText: (text: string, langCode: string, langName: string) => void;
}

export const TranslationStudioModal: React.FC<TranslationStudioModalProps> = ({
  isOpen,
  onClose,
  onSpeakText,
}) => {
  const [sourceLanguage, setSourceLanguage] = useState<string>('auto');
  const [targetLanguage, setTargetLanguage] = useState<string>('Urdu');
  const [preserveTone, setPreserveTone] = useState<string>('natural');
  const [sourceText, setSourceText] = useState<string>('');
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleTranslate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceText.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/dnyl/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sourceText.trim(),
          sourceLanguage,
          targetLanguage,
          preserveTone,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Translation request failed');
      }
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to complete translation');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwapLanguages = () => {
    if (sourceLanguage === 'auto') {
      setSourceLanguage(targetLanguage);
      setTargetLanguage('English');
    } else {
      const prevSource = sourceLanguage;
      setSourceLanguage(targetLanguage);
      setTargetLanguage(prevSource);
    }
    if (result?.translatedText) {
      setSourceText(result.translatedText);
      setResult(null);
    }
  };

  const handleCopy = async () => {
    if (!result?.translatedText) return;
    try {
      await navigator.clipboard.writeText(result.translatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const targetLangObj = SUPPORTED_LANGUAGES.find((l) => l.name === targetLanguage);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-[#081022] border border-cyan-500/30 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Languages className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-slate-100">
              DNYL Multilingual Translation Bridge
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 transition-colors"
            aria-label="Close Translation Studio"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleTranslate} className="p-6 overflow-y-auto space-y-5">
          {/* Language Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_1fr] gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Source Language
              </label>
              <select
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#050b18] border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
              >
                <option value="auto">Auto-Detect Language</option>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.id} value={lang.name}>
                    {lang.name} ({lang.nativeName})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleSwapLanguages}
              title="Swap Languages"
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-cyan-300 hover:border-cyan-500/50 transition-colors self-end"
            >
              <ArrowRightLeft className="w-4 h-4" />
            </button>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Target Language
              </label>
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#050b18] border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.id} value={lang.name}>
                    {lang.name} ({lang.nativeName})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Tone & Context
              </label>
              <select
                value={preserveTone}
                onChange={(e) => setPreserveTone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#050b18] border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
              >
                <option value="natural">Natural & Conversational</option>
                <option value="formal">Formal & Executive</option>
                <option value="simple">Simple & Educational</option>
                <option value="literary">Poetic & Literary</option>
              </select>
            </div>
          </div>

          {/* Input Area */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-400">
                Source Text (supports mixed languages & code-switching)
              </label>
              <div className="flex items-center gap-2 text-xs text-cyan-400">
                <button
                  type="button"
                  onClick={() =>
                    setSourceText(
                      'Artificial intelligence and clean energy can empower communities across every language and region.'
                    )
                  }
                  className="hover:underline"
                >
                  Sample English
                </button>
                <span>·</span>
                <button
                  type="button"
                  onClick={() =>
                    setSourceText(
                      'Aaj ka mausam bohat khushgawar hai aur hum nayi technology par kaam kar rahe hain.'
                    )
                  }
                  className="hover:underline"
                >
                  Sample Roman Urdu
                </button>
              </div>
            </div>
            <textarea
              rows={4}
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Enter text in English, Urdu, Roman Urdu, Arabic, Persian, Hindi, French, or any supported language..."
              className="w-full p-3.5 rounded-xl bg-[#050b18] border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 resize-none"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isLoading || !sourceText.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isLoading ? 'Translating via DNYL...' : `Translate to ${targetLanguage}`}</span>
            </button>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-red-950/50 border border-red-500/40 text-xs text-red-200">
              {error}
            </div>
          )}

          {/* Output Area */}
          {result && (
            <div className="p-5 rounded-xl bg-[#050b18] border border-cyan-500/30 space-y-4">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                <span>
                  Detected Source: <strong className="text-slate-200">{result.detectedSourceLanguage}</strong> · Target: <strong className="text-cyan-300">{targetLanguage}</strong> ({result.targetDirection.toUpperCase()})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onSpeakText(
                        result.translatedText,
                        targetLangObj?.bcp47 || 'en-US',
                        targetLanguage
                      )
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/70 border border-cyan-500/30 text-cyan-200 hover:bg-cyan-900/60 transition-colors"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Speak Aloud</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:border-cyan-500/40 transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div
                dir={result.targetDirection}
                className={`p-4 rounded-xl bg-[#081226] border border-slate-800 text-base text-slate-100 leading-relaxed ${
                  result.targetDirection === 'rtl' ? 'text-right font-sans text-lg' : 'text-left'
                }`}
              >
                {result.translatedText}
              </div>

              {result.romanizedPronunciation && (
                <div className="text-xs text-slate-300 space-y-1">
                  <span className="text-slate-400 font-medium">Phonetic / Romanized Reading:</span>
                  <p className="text-cyan-200/90 italic">{result.romanizedPronunciation}</p>
                </div>
              )}

              {result.notes && (
                <p className="text-xs text-slate-400 border-t border-slate-800/80 pt-2.5">
                  Context Note: {result.notes}
                </p>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
