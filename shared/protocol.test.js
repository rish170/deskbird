import { describe, it, expect } from 'vitest';
import {
  deriveRoomId,
  normalizeRoomId,
  formatRoomId,
  isValidRoomId,
  sanitizeText,
  validateMessage,
  calculateDisplayTime,
  wrapBubbleText,
  LOCAL_TEST_SECRET,
  LOCAL_TEST_ROOM_ID,
  ERROR_CODES
} from './protocol.js';

describe('shared/protocol', () => {
  describe('deriveRoomId', () => {
    it('returns fixed room for local test secret in non-production', () => {
      const room = deriveRoomId(LOCAL_TEST_SECRET, 'development');
      expect(room).toBe(LOCAL_TEST_ROOM_ID);
    });

    it('derives deterministic 8-char base32 room ID from secret', () => {
      const secret = 'test-secret-12345-very-long-string-key';
      const id1 = deriveRoomId(secret, 'production');
      const id2 = deriveRoomId(secret, 'production');
      expect(id1).toBe(id2);
      expect(id1).toHaveLength(8);
      expect(isValidRoomId(id1)).toBe(true);
    });

    it('throws on empty or non-string secret', () => {
      expect(() => deriveRoomId('')).toThrow();
      expect(() => deriveRoomId(null)).toThrow();
    });
  });

  describe('normalizeRoomId and formatRoomId', () => {
    it('normalizes case and hyphens', () => {
      expect(normalizeRoomId('abcd-2345')).toBe('ABCD2345');
      expect(normalizeRoomId('  a b c d - 2 3 4 5  ')).toBe('ABCD2345');
    });

    it('formats 8-char room into ABCD-2345', () => {
      expect(formatRoomId('ABCD2345')).toBe('ABCD-2345');
      expect(formatRoomId('abcd2345')).toBe('ABCD-2345');
      expect(formatRoomId('short')).toBe('SHORT');
    });
  });

  describe('isValidRoomId', () => {
    it('accepts valid base32 8-char strings', () => {
      expect(isValidRoomId('ABCD2345')).toBe(true);
      expect(isValidRoomId('LCLTEST2')).toBe(true);
      expect(isValidRoomId('ABCD-2345')).toBe(true);
    });

    it('rejects forbidden characters (0, 1, I, O, symbols)', () => {
      expect(isValidRoomId('ABCD0345')).toBe(false); // contains '0'
      expect(isValidRoomId('ABCD1345')).toBe(false); // contains '1'
      expect(isValidRoomId('ABCDI345')).toBe(false); // contains 'I'
      expect(isValidRoomId('ABCDO345')).toBe(false); // contains 'O'
      expect(isValidRoomId('ABCD!345')).toBe(false);
    });

    it('rejects wrong length', () => {
      expect(isValidRoomId('ABC')).toBe(false);
      expect(isValidRoomId('ABCDEFGHJKL')).toBe(false);
    });
  });

  describe('sanitizeText', () => {
    it('removes control characters and trims leading/trailing whitespace', () => {
      const input = '\x00\x07Hello \x1B[31mworld\x1B[0m\t\n  ';
      const output = sanitizeText(input);
      expect(output).toBe('Hello [31mworld[0m');
    });

    it('preserves internal newlines', () => {
      const input = 'Line 1\nLine 2';
      expect(sanitizeText(input)).toBe('Line 1\nLine 2');
    });
  });

  describe('validateMessage', () => {
    it('validates a normal message', () => {
      const res = validateMessage('Hello bird!', 'Alice');
      expect(res.valid).toBe(true);
      expect(res.sanitizedText).toBe('Hello bird!');
      expect(res.sanitizedFrom).toBe('Alice');
    });

    it('rejects empty message', () => {
      const res = validateMessage('   \n  ');
      expect(res.valid).toBe(false);
      expect(res.error).toBe(ERROR_CODES.EMPTY);
    });

    it('rejects message exceeding 120 chars', () => {
      const longText = 'a'.repeat(121);
      const res = validateMessage(longText);
      expect(res.valid).toBe(false);
      expect(res.error).toBe(ERROR_CODES.TOO_LONG);
    });

    it('truncates sender name exceeding 12 chars', () => {
      const res = validateMessage('Hi', 'AlexanderTheGreat');
      expect(res.valid).toBe(true);
      expect(res.sanitizedFrom).toHaveLength(12);
      expect(res.sanitizedFrom).toBe('AlexanderThe');
    });
  });

  describe('calculateDisplayTime', () => {
    it('calculates display time with min 2.5s and 60ms/char', () => {
      expect(calculateDisplayTime('')).toBe(2500);
      expect(calculateDisplayTime('Hello')).toBe(2500 + 5 * 60); // 2800
    });

    it('caps display time at 12s', () => {
      const veryLong = 'a'.repeat(200);
      expect(calculateDisplayTime(veryLong)).toBe(12000);
    });
  });

  describe('wrapBubbleText', () => {
    it('wraps words across 24 char boundaries', () => {
      const text = 'The quick brown fox jumps over the lazy dog and rests peacefully.';
      const lines = wrapBubbleText(text, 24);
      expect(lines.length).toBeGreaterThan(1);
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(24);
      }
    });

    it('splits words longer than 24 chars', () => {
      const longWord = 'supercalifragilisticexpialidocious';
      const lines = wrapBubbleText(longWord, 24);
      expect(lines[0].length).toBe(24);
      expect(lines[1]).toBe(longWord.slice(24));
    });
  });
});
