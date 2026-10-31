const crypto = require('crypto');

const PROTOCOL_VERSION = '1.0.0';
const BASE32_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LOCAL_TEST_SECRET = 'local-test-secret';
const LOCAL_TEST_ROOM_ID = 'LCLTEST2';

const LIMITS = {
  MAX_TEXT_LENGTH: 120,
  MAX_FROM_LENGTH: 12,
  MAX_QUEUE: 20,
  MESSAGE_TTL_MS: 24 * 60 * 60 * 1000,
  RATE_LIMIT_SENDER_INTERVAL_MS: 2000,
  RATE_LIMIT_ROOM_HOURLY: 30,
  HEARTBEAT_INTERVAL_MS: 4 * 60 * 1000,
  MIN_DISPLAY_TIME_MS: 2500,
  MAX_DISPLAY_TIME_MS: 12000,
  MS_PER_CHAR: 60,
  TYPEWRITER_CHARS_PER_SEC: 40,
  LINE_WRAP_CHARS: 24,
  MAX_VISIBLE_LINES: 4
};

const EVENTS = {
  BIRD_JOIN: 'bird:join',
  BIRD_PING: 'bird:ping',
  MESSAGE_SEEN: 'message:seen',
  MESSAGE_NEW: 'message:new',
  SENDER_JOIN: 'sender:join',
  MESSAGE_SEND: 'message:send',
  BIRD_STATUS: 'bird:status',
  MESSAGE_STATUS: 'message:status'
};

function deriveRoomId(secret, nodeEnv = process.env.NODE_ENV) {
  if (!secret || typeof secret !== 'string') {
    throw new Error('Secret must be a non-empty string');
  }

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

function normalizeRoomId(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\s-]+/g, '').toUpperCase();
}

function formatRoomId(roomId) {
  const norm = normalizeRoomId(roomId);
  if (norm.length !== 8) return norm;
  return `${norm.slice(0, 4)}-${norm.slice(4)}`;
}

function isValidRoomId(roomId) {
  const norm = normalizeRoomId(roomId);
  if (norm.length !== 8) return false;
  for (let i = 0; i < norm.length; i++) {
    if (!BASE32_ALPHABET.includes(norm[i])) {
      return false;
    }
  }
  return true;
}

module.exports = {
  PROTOCOL_VERSION,
  BASE32_ALPHABET,
  LOCAL_TEST_SECRET,
  LOCAL_TEST_ROOM_ID,
  LIMITS,
  EVENTS,
  deriveRoomId,
  normalizeRoomId,
  formatRoomId,
  isValidRoomId
};

