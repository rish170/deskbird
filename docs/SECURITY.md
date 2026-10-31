# Security & Privacy Specification

Deskbird is built with a zero-friction, privacy-first threat model.

---

## 1. Threat Model & Room Cryptography

### 1.1 Secret vs. Room ID
- **The Secret (Private)**:
  - A cryptographically random 32-byte hexadecimal string generated on User 1's computer using `crypto.randomBytes(32)`.
  - Stored locally on User 1's machine in `userData/deskbird-settings.json`.
  - Never shared with senders, never displayed on screen, and never sent in plaintext over unencrypted connections.
- **The Room ID (Public)**:
  - Formed by taking the first 8 characters of the Base32-encoded SHA-256 hash of the secret.
  - Senders only ever receive the public `roomId` (e.g. `ABCD-2345`).
- **Impersonation Prevention**:
  - Because SHA-256 is a one-way cryptographic hash function, it is computationally infeasible for a malicious sender to invert `roomId` back into `secret`.
  - When User 1 connects, the server verifies ownership by recomputing $\text{deriveRoomId}(\text{secret})$. Only the authentic bird can claim the room and receive messages.

---

## 2. Anti-Spam & Rate Limiting

To prevent denial-of-service and flooding attacks on the desktop companion:
1. **Per-Sender Rate Limit**:
   - Each sender WebSocket is restricted to **1 message every 2 seconds**.
   - Violations immediately return `rate_limited` with a `retryAfterMs` cooldown countdown.
2. **Per-Room Rate Limit**:
   - Each bird room is capped at **30 messages per rolling hour**.
3. **Queue Capacity & TTL**:
   - If the bird is offline, the server buffers at most **20 unread messages**. Subsequent messages are rejected with `queue_full`.
   - All unread queued messages automatically expire and are purged from memory after **24 hours**.

---

## 3. Cross-Site Scripting (XSS) Prevention

- **HTML Injection Defense**:
  - Message text and sender names are strictly sanitized to strip non-printable ASCII control characters.
  - The desktop bird overlay inserts text exclusively via DOM `textContent` properties. Neither the bird app nor the web client ever uses `innerHTML` or `dangerouslySetInnerHTML`.
- **Content Security Policy (CSP)**:
  - The static web client enforces a strict CSP in `vercel.json`:
    - `default-src 'self'`
    - `script-src 'self' 'unsafe-inline'`
    - `connect-src 'self' https: http: wss: ws:`
    - `frame-ancestors 'none'` (anti-clickjacking)

---

## 4. Privacy Statement

1. **Zero Message Logging**:
   - Message contents and sender names are **never logged** to server stdout, server log files, or databases. Server logs only record connection states and message IDs.
2. **Ephemeral In-Memory Storage**:
   - Once a message is delivered to the bird app, it is deleted from server memory.
   - The relay server has no database, no disk cache, and retains zero historical communication records.
3. **No User Accounts or Tracking**:
   - Neither User 1 nor User 2 is required to register an account, enter an email address, or provide cookies/trackers.

