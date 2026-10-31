/**
 * Renderer-safe protocol helpers with zero external dependencies or bare module specifiers.
 */

export const LIMITS = {
  MAX_TEXT_LENGTH: 120,
  MAX_FROM_LENGTH: 12,
  MAX_QUEUE: 20,
  MIN_DISPLAY_TIME_MS: 2500,
  MAX_DISPLAY_TIME_MS: 12000,
  MS_PER_CHAR: 60,
  TYPEWRITER_CHARS_PER_SEC: 40,
  LINE_WRAP_CHARS: 24,
  MAX_VISIBLE_LINES: 4
};

export function calculateDisplayTime(text) {
  const len = typeof text === 'string' ? text.length : 0;
  const time = LIMITS.MIN_DISPLAY_TIME_MS + len * LIMITS.MS_PER_CHAR;
  return Math.min(LIMITS.MAX_DISPLAY_TIME_MS, time);
}

export function wrapBubbleText(text, maxCharsPerLine = LIMITS.LINE_WRAP_CHARS) {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if (!word) continue;

    if (word.length > maxCharsPerLine) {
      if (currentLine) {
        lines.push(currentLine);
      }
      let remaining = word;
      while (remaining.length > maxCharsPerLine) {
        lines.push(remaining.slice(0, maxCharsPerLine));
        remaining = remaining.slice(maxCharsPerLine);
      }
      currentLine = remaining;
      continue;
    }

    if (!currentLine) {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= maxCharsPerLine) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

