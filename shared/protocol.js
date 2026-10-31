import crypto from 'node:crypto';

export const PROTOCOL_VERSION = '1.0.0';

export const BASE32_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const LOCAL_TEST_SECRET = 'local-test-secret';
export const LOCAL_TEST_ROOM_ID = 'LCLTEST2';

export const LIMITS = {
  MAX_TEXT_LENGTH: 120,
  MAX_FROM_LENGTH: 12,
  MAX_QUEUE: 20,
  MESSAGE_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
  RATE_LIMIT_SENDER_INTERVAL_MS: 2000, // 1 msg per 2s per sender socket
  RATE_LIMIT_ROOM_HOURLY: 30, // 30 msgs per hour per room
  HEARTBEAT_INTERVAL_MS: 4 * 60 * 1000, // 4 minutes
  MIN_DISPLAY_TIME_MS: 2500,
  MAX_DISPLAY_TIME_MS: 12000,
  MS_PER_CHAR: 60,
  TYPEWRITER_CHARS_PER_SEC: 40,
  LINE_WRAP_CHARS: 24,
  MAX_VISIBLE_LINES: 4
};

export const EVENTS = {
  BIRD_JOIN: 'bird:join',
  BIRD_PING: 'bird:ping',
  MESSAGE_SEEN: 'message:seen',
  MESSAGE_NEW: 'message:new',
  SENDER_JOIN: 'sender:join',
  MESSAGE_SEND: 'message:send',
  BIRD_STATUS: 'bird:status',
  MESSAGE_STATUS: 'message:status'
};

export const ERROR_CODES = {
  BAD_ROOM: 'bad_room',
  BAD_SECRET: 'bad_secret',
  TOO_LONG: 'too_long',
  EMPTY: 'empty',
  RATE_LIMITED: 'rate_limited',
  QUEUE_FULL: 'queue_full',
  SERVER_ERROR: 'server_error',
  INCOMPATIBLE_VERSION: 'incompatible_version'
};

export const MESSAGE_STATUS = {
  QUEUED: 'queued',
  DELIVERED: 'delivered',
  SEEN: 'seen'
};

/**
 * Derives the 8-character public room ID from a secret string.
 * @param {string} secret
 * @param {string} [nodeEnv]
 * @returns {string} 8-character room ID (e.g. 'ABCD2345')
 */
export function deriveRoomId(secret, nodeEnv = process.env.NODE_ENV) {
  if (!secret || typeof secret !== 'string') {
    throw new Error('Secret must be a non-empty string');
  }

  // Allow fixed local test room in non-production environments
  if (secret === LOCAL_TEST_SECRET && nodeEnv !== 'production') {
    return LOCAL_TEST_ROOM_ID;
  }

  const hash = crypto.createHash('sha256').update(secret).digest();
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < hash.length; i++) {
    value = (value << 8) | hash[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
      if (output.length === 8) {
        return output;
      }
    }
  }

  return output;
}

/**
 * Normalizes a user-input room ID (strips whitespace, dashes, lowercases to uppercase).
 * @param {string} raw
 * @returns {string}
 */
export function normalizeRoomId(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\s-]+/g, '').toUpperCase();
}

/**
 * Formats an 8-character room ID into the canonical display format "ABCD-2345".
 * @param {string} roomId
 * @returns {string}
 */
export function formatRoomId(roomId) {
  const norm = normalizeRoomId(roomId);
  if (norm.length !== 8) return norm;
  return `${norm.slice(0, 4)}-${norm.slice(4)}`;
}

/**
 * Checks if a string is a valid 8-character Base32 room ID.
 * @param {string} roomId
 * @returns {boolean}
 */
export function isValidRoomId(roomId) {
  const norm = normalizeRoomId(roomId);
  if (norm.length !== 8) return false;
  for (let i = 0; i < norm.length; i++) {
    if (!BASE32_ALPHABET.includes(norm[i])) {
      return false;
    }
  }
  return true;
}

/**
 * Strips non-printable and control characters, leaving standard text and linebreaks.
 * @param {string} text
 * @returns {string}
 */
export function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  // Strip control characters except newline and tab
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '').trim();
}

/**
 * Validates a message payload.
 * @param {string} text
 * @param {string} [from]
 * @returns {{ valid: boolean, error?: string, sanitizedText?: string, sanitizedFrom?: string }}
 */
export function validateMessage(text, from) {
  const sanitizedText = sanitizeText(text);
  if (!sanitizedText || sanitizedText.length === 0) {
    return { valid: false, error: ERROR_CODES.EMPTY };
  }
  if (sanitizedText.length > LIMITS.MAX_TEXT_LENGTH) {
    return { valid: false, error: ERROR_CODES.TOO_LONG };
  }

  let sanitizedFrom = '';
  if (from && typeof from === 'string') {
    sanitizedFrom = sanitizeText(from).slice(0, LIMITS.MAX_FROM_LENGTH);
  }

  return {
    valid: true,
    sanitizedText,
    sanitizedFrom
  };
}

/**
 * Calculates display time in milliseconds: 2.5s + 60ms per character, capped at 12s.
 * @param {string} text
 * @returns {number}
 */
export function calculateDisplayTime(text) {
  const len = typeof text === 'string' ? text.length : 0;
  const time = LIMITS.MIN_DISPLAY_TIME_MS + len * LIMITS.MS_PER_CHAR;
  return Math.min(LIMITS.MAX_DISPLAY_TIME_MS, time);
}

/**
 * Wraps text into lines for the 8-bit speech bubble.
 * 24 characters per line. Breaks on words where possible.
 * @param {string} text
 * @param {number} [maxCharsPerLine=24]
 * @returns {string[]}
 */
export function wrapBubbleText(text, maxCharsPerLine = LIMITS.LINE_WRAP_CHARS) {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if (!word) continue;

    // If word itself is longer than line length, chunk it
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
