import { LIMITS } from 'deskbird-shared';

export class RateLimiter {
  constructor(options = {}) {
    this.senderMinIntervalMs = options.senderMinIntervalMs || LIMITS.RATE_LIMIT_SENDER_INTERVAL_MS;
    this.senderLastMessageTimes = new Map(); // socketId -> timestamp
  }

  /**
   * Checks if a sender socket is allowed to send a message.
   * @param {string} socketId
   * @param {number} [now=Date.now()]
   * @returns {{ allowed: boolean, retryAfterMs?: number }}
   */
  checkSender(socketId, now = Date.now()) {
    const lastTime = this.senderLastMessageTimes.get(socketId);
    if (!lastTime) return { allowed: true };

    const elapsed = now - lastTime;
    // 150ms grace margin protects against browser setTimeout drift and network latency jitter
    const effectiveInterval = Math.max(200, this.senderMinIntervalMs - 150);
    if (elapsed < effectiveInterval) {
      const retryAfterMs = Math.max(100, this.senderMinIntervalMs - elapsed);
      return { allowed: false, retryAfterMs };
    }
    return { allowed: true };
  }

  /**
   * Records a sent message for a sender socket.
   * @param {string} socketId
   * @param {number} [now=Date.now()]
   */
  recordSender(socketId, now = Date.now()) {
    this.senderLastMessageTimes.set(socketId, now);
  }

  /**
   * Cleans up tracking when a socket disconnects.
   * @param {string} socketId
   */
  cleanupSocket(socketId) {
    this.senderLastMessageTimes.delete(socketId);
  }
}

