import React, { useState } from 'react';
import { Volume2, Copy, Check, ExternalLink } from 'lucide-react';
import { ChatMessage } from '../types/dnyl';
import { sanitizeExternalUrl } from '../services/localCommands';

interface MessageStreamProps {
  messages: ChatMessage[];
  isProcessing: boolean;
  searchQuery: string;
  onSpeakMessage: (msg: ChatMessage) => void;
  onSelectStarterPrompt: (prompt: string, bcp47: string) => void;
}

export const MessageStream: React.FC<MessageStreamProps> = ({
  messages,
  isProcessing,
  searchQuery,
  onSpeakMessage,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // ignore clipboard errors
    }
  };

  const filteredMessages = searchQuery.trim()
    ? messages.filter(
        (m) =>
          m.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.languageName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  const renderFormattedContent = (text: string) => {
    // Split by fenced code blocks ```lang ... ```
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const lines = part.slice(3, -3).trim().split('\n');
        const firstLine = lines[0]?.trim() || '';
        const hasLangTag = /^[a-zA-Z0-9_-]+$/.test(firstLine);
        const codeContent = hasLangTag ? lines.slice(1).join('\n') : lines.join('\n');

        return (
          <pre
            key={idx}
            dir="ltr"
            className="my-3 p-3.5 rounded-xl bg-[#030711] border border-slate-800 text-xs font-mono text-cyan-200 overflow-x-auto text-left"
          >
            <code>{codeContent}</code>
          </pre>
        );
      }

      // Render paragraphs and inline bold/code
      return (
        <div key={idx} className="space-y-2 leading-relaxed">
          {part.split('\n\n').map((para, pIdx) => {
            const trimmed = para.trim();
            if (!trimmed) return null;
            return (
              <p key={pIdx} className="whitespace-pre-wrap">
                {trimmed.split(/(\*\*.*?\*\*|`[^`]+`)/g).map((token, tIdx) => {
                  if (token.startsWith('**') && token.endsWith('**')) {
                    return (
                      <strong key={tIdx} className="font-semibold text-white">
                        {token.slice(2, -2)}
                      </strong>
                    );
                  }
                  if (token.startsWith('`') && token.endsWith('`')) {
                    return (
                      <code
                        key={tIdx}
                        dir="ltr"
                        className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700/80 font-mono text-xs text-cyan-300"
                      >
                        {token.slice(1, -1)}
                      </code>
                    );
                  }
                  return token;
                })}
              </p>
            );
          })}
        </div>
      );
    });
  };

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
      {filteredMessages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center py-12">
          <p className="text-sm text-slate-400">
            No conversation entries match &ldquo;{searchQuery}&rdquo;.
          </p>
        </div>
      ) : (
        filteredMessages.map((msg) => {
          const isAssistant = msg.role === 'assistant';
          const isRtl = msg.direction === 'rtl';
          const safeUrl = sanitizeExternalUrl(msg.openWebsiteUrl);
          const timeFormatted = new Date(msg.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${
                isAssistant ? 'items-start' : 'items-end'
              }`}
            >
              {/* Unboxed Metadata Line (Zero-Pill Discipline) */}
              <div className="flex items-center gap-2 text-xs text-slate-400 mb-1.5 px-1">
                <span className="font-semibold text-slate-200">
                  {isAssistant ? 'DNYL' : 'You'}
                </span>
                <span aria-hidden="true">·</span>
                <span>{msg.languageName}</span>
                {msg.isOfflineCommand && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-300">Local Subsystem</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="font-mono">{timeFormatted}</span>
              </div>

              {/* Message Surface */}
              <div
                dir={msg.direction}
                className={`max-w-2xl w-full sm:w-auto rounded-2xl px-5 py-4 text-sm border transition-colors ${
                  isAssistant
                    ? 'bg-[#081226]/95 border-cyan-500/25 text-slate-100'
                    : 'bg-cyan-950/45 border-cyan-400/35 text-slate-100'
                } ${isRtl ? 'text-right text-base leading-loose' : 'text-left'}`}
              >
                {renderFormattedContent(msg.text)}

                {/* Safe Website Launch Link if requested by user */}
                {safeUrl && (
                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-start">
                    <a
                      href={safeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>
                        Open {msg.openWebsiteTitle || safeUrl} in New Tab
                      </span>
                    </a>
                  </div>
                )}

                {/* Action Bar on Assistant Messages */}
                {isAssistant && (
                  <div
                    dir="ltr"
                    className="mt-3 pt-2.5 border-t border-slate-800/70 flex items-center justify-end gap-3 text-xs text-slate-400"
                  >
                    <button
                      type="button"
                      onClick={() => onSpeakMessage(msg)}
                      className="flex items-center gap-1 hover:text-cyan-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Speak</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopy(msg.id, msg.text)}
                      className="flex items-center gap-1 hover:text-cyan-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}

      {/* Pending / Processing Indicator */}
      {isProcessing && (
        <div className="flex flex-col items-start">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1.5 px-1">
            <span className="font-semibold text-cyan-300">DNYL</span>
            <span aria-hidden="true">·</span>
            <span>Synthesizing Multilingual Response</span>
          </div>
          <div className="rounded-2xl px-5 py-3.5 bg-[#081226]/90 border border-cyan-500/30 text-xs text-cyan-200 flex items-center gap-3">
            <span className="font-mono">Processing query across neural core...</span>
          </div>
        </div>
      )}
    </div>
  );
};
