# Deskbird Communication Protocol Specification

**Protocol Version**: `1.0.0`

This document details all real-time events, payload structures, limits, and error codes exchanged between the Desktop Bird, the Relay Server, and the Web Sender client.

---

## 1. Protocol Architecture & Room Identity

- **Bird Secret**: A 32-byte cryptographically secure random value generated on first run.
- **Room ID Derivation**:
  $$\text{hash} = \text{SHA-256}(\text{secret})$$
  $$\text{roomId} = \text{first 8 characters of Base32}(\text{hash})$$
  - Base32 Alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 characters, excluding confusing characters `I`, `O`, `0`, `1`).
  - Canonical Display Format: `ABCD-2345`.
  - Wire & Storage Format: `ABCD2345`.
- **Local Testing Override**:
  - In non-production environments (`NODE_ENV !== 'production'`), secret `local-test-secret` maps deterministically to `LCLTEST2`.

---

## 2. Global Limits & Constraints

| Parameter | Limit | Description |
|---|---|---|
| `MAX_TEXT_LENGTH` | `120` chars | Maximum characters permitted per message. |
| `MAX_FROM_LENGTH` | `12` chars | Maximum characters for sender name. |
| `MAX_QUEUE` | `20` msgs | Maximum unread messages stored for an offline bird. |
| `MESSAGE_TTL_MS` | `86400000` ms (24h) | Time-to-live for unread queued messages. |
| `RATE_LIMIT_SENDER_INTERVAL_MS` | `2000` ms | Senders must wait 2s between consecutive messages. |
| `RATE_LIMIT_ROOM_HOURLY` | `30` msgs | Max messages sent to a single room per rolling hour. |
| `HEARTBEAT_INTERVAL_MS` | `240000` ms (4 min) | Bird ping interval to keep Render web service awake. |
| `MIN_DISPLAY_TIME_MS` | `2500` ms | Minimum duration a speech bubble remains visible. |
| `MAX_DISPLAY_TIME_MS` | `12000` ms | Maximum duration a speech bubble remains visible. |
| `MS_PER_CHAR` | `60` ms | Additional display time per character. |

---

## 3. Real-Time Events

### 3.1 Bird Client -> Relay Server

#### `bird:join`
Sent by the desktop bird upon connecting or reconnecting to the server.
- **Payload**:
  ```json
  {
    "secret": "string (32-byte secret)",
    "appVersion": "1.0.0"
  }
  ```
- **Acknowledgment Callback**:
  - Success:
    ```json
    { "ok": true, "roomId": "ABCD2345", "queued": 2 }
    ```
  - Failure:
    ```json
    { "ok": false, "code": "bad_secret" }
    ```

#### `bird:ping`
Heartbeat sent every 4 minutes to maintain the Render free-tier socket alive.
- **Acknowledgment Callback**:
  ```json
  { "ok": true, "ts": 1730419200000 }
  ```

#### `message:seen`
Sent by the desktop bird when an incoming message is displayed in a speech bubble.
- **Payload**:
  ```json
  { "id": "msg_1730419200000_abc123" }
  ```

---

### 3.2 Relay Server -> Bird Client

#### `message:new`
Pushed by the server to the bird when a sender submits a note (or when draining offline queues).
- **Payload**:
  ```json
  {
    "id": "msg_1730419200000_abc123",
    "text": "Hello little bird!",
    "from": "Alex",
    "ts": 1730419200000
  }
  ```

---

### 3.3 Sender Web Client -> Relay Server

#### `sender:join`
Sent by the web client upon opening a room URL (`/#/ABCD2345`).
- **Payload**:
  ```json
  { "roomId": "ABCD2345" }
  ```
- **Acknowledgment Callback**:
  - Success:
    ```json
    { "ok": true, "birdOnline": true }
    ```
  - Failure:
    ```json
    { "ok": false, "code": "bad_room" }
    ```

#### `message:send`
Submits a note to be shown on the bird's screen.
- **Payload**:
  ```json
  {
    "text": "Are you busy right now?",
    "from": "Bob"
  }
  ```
- **Acknowledgment Callback**:
  - Success (Bird online):
    ```json
    { "ok": true, "id": "msg_1730419200000_xyz789", "status": "delivered" }
    ```
  - Success (Bird offline, queued):
    ```json
    { "ok": true, "id": "msg_1730419200000_xyz789", "status": "queued" }
    ```
  - Failure (Rate limited):
    ```json
    { "ok": false, "code": "rate_limited", "retryAfterMs": 1400 }
    ```
  - Failure (Validation or capacity):
    ```json
    { "ok": false, "code": "too_long" | "empty" | "queue_full" }
    ```

---

### 3.4 Relay Server -> Sender Web Client

#### `bird:status`
Broadcast to senders in a room when the bird connects or disconnects.
- **Payload**:
  ```json
  { "online": true }
  ```

#### `message:status`
Informs the sender of message lifecycle transitions.
- **Payload**:
  ```json
  {
    "id": "msg_1730419200000_xyz789",
    "status": "queued" | "delivered" | "seen"
  }
  ```

---

## 4. Standard Error Codes

| Code | Explanation |
|---|---|
| `bad_room` | The room ID is malformed or contains invalid characters. |
| `bad_secret` | The provided secret was empty or invalid. |
| `empty` | The message text was empty or consisted solely of whitespace. |
| `too_long` | The message exceeded 120 characters after trimming. |
| `rate_limited` | Exceeded 1 msg/2s per sender socket, or 30 msgs/hr per room. |
| `queue_full` | The offline message queue has reached capacity (20 messages). |
| `incompatible_version` | Client protocol version does not match the server. |
| `server_error` | An unexpected internal error occurred on the server. |

---

## 5. HTTP Endpoints

### `GET /healthz`
Public health check endpoint used by Render monitoring and the web app wakeup routine.
- **Response `200 OK`**:
  ```json
  {
    "ok": true,
    "status": "healthy",
    "version": "1.0.0",
    "uptime": 1284,
    "env": "production"
  }
  ```

