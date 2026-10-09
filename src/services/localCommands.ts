import { ChatMessage } from '../types/dnyl';

export interface LocalCommandResult {
  handled: boolean;
  reply?: string;
  spokenSummary?: string;
  intentCategory?: string;
  openWebsiteUrl?: string;
  openWebsiteTitle?: string;
}

const KNOWN_SITES: Record<string, { url: string; title: string }> = {
  youtube: { url: 'https://www.youtube.com', title: 'YouTube' },
  wikipedia: { url: 'https://www.wikipedia.org', title: 'Wikipedia' },
  github: { url: 'https://github.com', title: 'GitHub' },
  google: { url: 'https://www.google.com', title: 'Google' },
  scholar: { url: 'https://scholar.google.com', title: 'Google Scholar' },
  stackoverflow: { url: 'https://stackoverflow.com', title: 'Stack Overflow' },
  mdn: { url: 'https://developer.mozilla.org', title: 'MDN Web Docs' },
  arxiv: { url: 'https://arxiv.org', title: 'arXiv Research' },
  nasa: { url: 'https://www.nasa.gov', title: 'NASA' },
  bbc: { url: 'https://www.bbc.com/news', title: 'BBC News' },
};

/**
 * Safely evaluates pure mathematical expressions without using eval() on arbitrary code.
 */
export function evaluateSafeMath(input: string): string | null {
  const cleaned = input
    .replace(/^(?:dnyl[,:\s]*)?(?:calculate|compute|solve|what\s+is|kitna\s+hai|hisab\s+karo)\s+/i, '')
    .replace(/[?=]+$/g, '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\^/g, '**')
    .replace(/\bpi\b/gi, String(Math.PI))
    .replace(/\bsqrt\(([^)]+)\)/gi, 'Math.sqrt($1)')
    .replace(/\bsin\(([^)]+)\)/gi, 'Math.sin($1)')
    .replace(/\bcos\(([^)]+)\)/gi, 'Math.cos($1)')
    .replace(/\btan\(([^)]+)\)/gi, 'Math.tan($1)')
    .replace(/\blog\(([^)]+)\)/gi, 'Math.log10($1)')
    .trim();

  // Only allow numbers, basic arithmetic operators, parentheses, decimal points, and Math.* calls
  const strippedMathFuncs = cleaned.replace(/Math\.(sqrt|sin|cos|tan|log10)/g, '');
  if (!/^[0-9+\-*/().%\s]+$/.test(strippedMathFuncs)) {
    return null;
  }

  // Must contain at least one operator and one digit
  if (!/[0-9]/.test(strippedMathFuncs) || !/[+\-*/%]|Math\./.test(cleaned)) {
    return null;
  }

  try {
    const fn = new Function(`"use strict"; return (${cleaned});`);
    const result = fn();
    if (typeof result === 'number' && Number.isFinite(result)) {
      const formatted = Number.isInteger(result)
        ? result.toLocaleString()
        : Number(result.toFixed(8)).toString();
      return formatted;
    }
    return null;
  } catch {
    return null;
  }
}

export function processLocalUtilityCommand(
  rawInput: string,
  isOffline: boolean
): LocalCommandResult {
  const text = rawInput.trim();
  const lower = text.toLowerCase();

  // 1. Direct pure math expression or explicit "calculate ..."
  const isExplicitMath = /^(?:dnyl[,:\s]*)?(?:calculate|compute)\s+/i.test(text);
  const isPureArithmetic = /^[0-9()\s.+\-*/^×÷%]+$/.test(text) && /[+\-*/^×÷%]/.test(text);

  if (isExplicitMath || isPureArithmetic || isOffline) {
    const mathVal = evaluateSafeMath(text);
    if (mathVal !== null) {
      return {
        handled: true,
        reply: `**Calculation Result:** \`${mathVal}\`\n\nExpression evaluated locally by DNYL arithmetic subsystem: \`${text}\``,
        spokenSummary: `The result is ${mathVal}.`,
        intentCategory: 'calculation',
      };
    }
  }

  // 2. Local Date / Time check (instant & works offline)
  if (
    /^(?:dnyl[,:\s]*)?(?:what\s+time\s+is\s+it|current\s+time|what\s+is\s+today'?s?\s+date|current\s+date|waqt\s+kya\s+hua\s+hai|aaj\s+ki\s+tareekh)/i.test(
      lower
    )
  ) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString([], {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      handled: true,
      reply: `**Current Local Time:** ${timeStr}\n**Date:** ${dateStr}\n**Timezone:** ${tz}`,
      spokenSummary: `It is currently ${timeStr} on ${dateStr}.`,
      intentCategory: 'utility',
    };
  }

  // 3. Website navigation command ("open youtube", "open wikipedia", etc.)
  const openMatch = lower.match(/^(?:dnyl[,:\s]*)?(?:open|launch|go\s+to|visit)\s+([a-z0-9.-]+)(?:\s+website)?$/i);
  if (openMatch) {
    const target = openMatch[1].toLowerCase().replace(/\.com|\.org|\.gov/g, '');
    if (KNOWN_SITES[target]) {
      const site = KNOWN_SITES[target];
      return {
        handled: true,
        reply: `I have prepared a verified external link to **${site.title}** (\`${site.url}\`). Use the launch control below to open it in a new browser tab.`,
        spokenSummary: `I have prepared the link for ${site.title}. You can open it using the launch button on screen.`,
        intentCategory: 'website_navigation',
        openWebsiteUrl: site.url,
        openWebsiteTitle: site.title,
      };
    } else if (/^[a-z0-9-]+\.(com|org|edu|gov|io|net|ai)$/.test(openMatch[1])) {
      const url = `https://${openMatch[1]}`;
      return {
        handled: true,
        reply: `I have prepared the external link for **${openMatch[1]}** (\`${url}\`). Click the launch action below to visit the site safely.`,
        spokenSummary: `I have prepared the link for ${openMatch[1]}.`,
        intentCategory: 'website_navigation',
        openWebsiteUrl: url,
        openWebsiteTitle: openMatch[1],
      };
    }
  }

  // 4. If browser is offline and command wasn't matched above, return transparent offline message
  if (isOffline) {
    return {
      handled: true,
      reply: `**Offline Mode Active:** DNYL cannot reach the remote AI core while your network connection is offline.\n\nWhile offline, I can still perform:\n- Mathematical & scientific calculations (e.g., \`calculate (256 * 18) / 4\`)\n- Local date, time, and timezone checks (e.g., \`what time is it\`)\n- Website link preparation (e.g., \`open wikipedia\`)\n- Reviewing and searching your saved conversation history`,
      spokenSummary:
        'Network connection is currently offline. I can still run local calculations, check the time and date, or access your saved conversation history.',
      intentCategory: 'offline_fallback',
    };
  }

  return { handled: false };
}

export function sanitizeExternalUrl(url?: string): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function createWelcomeMessage(): ChatMessage {
  return {
    id: 'dnyl-welcome-init',
    role: 'assistant',
    text: `Good day. I am **DNYL**, your multilingual AI assistant.\n\nI can converse, translate, explain complex concepts, write code, and assist you by voice or text across **English, Urdu (اردو), Roman Urdu, Arabic (العربية), Hindi, Punjabi, Sindhi, Pashto, Persian (فارسی), French, German, Spanish, Chinese, Japanese, Korean, Russian, Turkish**, and more.\n\nSpeak naturally or type in any supported language—I will automatically detect your language and respond accordingly.`,
    spokenSummary:
      'Good day. I am DNYL, your multilingual AI assistant. Speak or type in any supported language and I will assist you.',
    timestamp: new Date().toISOString(),
    languageCode: 'en-US',
    languageName: 'English',
    direction: 'ltr',
    intentCategory: 'conversation',
  };
}
