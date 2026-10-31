import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import {
  EVENTS,
  ERROR_CODES,
  MESSAGE_STATUS,
  LOCAL_TEST_SECRET,
  LOCAL_TEST_ROOM_ID,
  deriveRoomId
} from 'deskbird-shared';
import { createDeskbirdServer } from '../src/index.js';

describe('Server Integration Tests', () => {
  let serverInstance;
  let httpServer;
  let serverUrl;
  let serverPort;

  beforeAll(async () => {
    serverInstance = createDeskbirdServer({
      nodeEnv: 'test',
      allowedOrigins: 'http://localhost:5173,http://127.0.0.1:5173',
      maxQueue: 3 // small queue for testing queue full
    });
    httpServer = serverInstance.httpServer;

    await new Promise((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        serverPort = httpServer.address().port;
        serverUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (serverInstance.io) {
      await serverInstance.io.close();
    }
    await new Promise((resolve) => httpServer.close(resolve));
  });

  it('GET /healthz returns 200 and healthy status', async () => {
    const res = await fetch(`${serverUrl}/healthz`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.status).toBe('healthy');
    expect(typeof data.uptime).toBe('number');
  });

  it('handles bird join with correct and incorrect secret', async () => {
    const birdSocket = ioClient(serverUrl, { transports: ['websocket'] });
    await new Promise((resolve) => birdSocket.on('connect', resolve));

    // 1. Invalid secret
    const badRes = await new Promise((resolve) => {
      birdSocket.emit(EVENTS.BIRD_JOIN, { secret: '' }, resolve);
    });
    expect(badRes.ok).toBe(false);
    expect(badRes.code).toBe(ERROR_CODES.BAD_SECRET);

    // 2. Valid secret (local test secret)
    const goodRes = await new Promise((resolve) => {
      birdSocket.emit(EVENTS.BIRD_JOIN, { secret: LOCAL_TEST_SECRET }, resolve);
    });
    expect(goodRes.ok).toBe(true);
    expect(goodRes.roomId).toBe(LOCAL_TEST_ROOM_ID);

    birdSocket.disconnect();
  });

  it('bird ping returns ok timestamp', async () => {
    const birdSocket = ioClient(serverUrl, { transports: ['websocket'] });
    await new Promise((resolve) => birdSocket.on('connect', resolve));

    const pingRes = await new Promise((resolve) => {
      birdSocket.emit(EVENTS.BIRD_PING, resolve);
    });
    expect(pingRes.ok).toBe(true);
    expect(typeof pingRes.ts).toBe('number');

    birdSocket.disconnect();
  });

  it('sender joins and receives bird status, message is delivered immediately if bird is online', async () => {
    const testSecret = 'online-delivery-secret-test';
    const testRoom = deriveRoomId(testSecret, 'test');

    const birdSocket = ioClient(serverUrl, { transports: ['websocket'] });
    await new Promise((resolve) => birdSocket.on('connect', resolve));
    await new Promise((resolve) => {
      birdSocket.emit(EVENTS.BIRD_JOIN, { secret: testSecret }, resolve);
    });

    const senderSocket = ioClient(serverUrl, { transports: ['websocket'] });
    await new Promise((resolve) => senderSocket.on('connect', resolve));

    const joinRes = await new Promise((resolve) => {
      senderSocket.emit(EVENTS.SENDER_JOIN, { roomId: testRoom }, resolve);
    });
    expect(joinRes.ok).toBe(true);
    expect(joinRes.birdOnline).toBe(true);

    // Send message and expect immediate delivery to bird
    const birdMsgPromise = new Promise((resolve) => {
      birdSocket.on(EVENTS.MESSAGE_NEW, resolve);
    });

    const sendRes = await new Promise((resolve) => {
      senderSocket.emit(EVENTS.MESSAGE_SEND, { text: 'Hello birdie!', from: 'Bob' }, resolve);
    });
    expect(sendRes.ok).toBe(true);
    expect(sendRes.status).toBe(MESSAGE_STATUS.DELIVERED);

    const receivedByBird = await birdMsgPromise;
    expect(receivedByBird.id).toBe(sendRes.id);
    expect(receivedByBird.text).toBe('Hello birdie!');
    expect(receivedByBird.from).toBe('Bob');

    birdSocket.disconnect();
    senderSocket.disconnect();
  });

  it('queues messages when bird is offline and delivers when bird joins', async () => {
    const testSecret = 'offline-queue-secret-test';
    const testRoom = deriveRoomId(testSecret, 'test');

    const senderSocket = ioClient(serverUrl, { transports: ['websocket'] });
    await new Promise((resolve) => senderSocket.on('connect', resolve));

    const joinRes = await new Promise((resolve) => {
      senderSocket.emit(EVENTS.SENDER_JOIN, { roomId: testRoom }, resolve);
    });
    expect(joinRes.birdOnline).toBe(false);

    // Send while bird is offline
    const sendRes = await new Promise((resolve) => {
      senderSocket.emit(EVENTS.MESSAGE_SEND, { text: 'Waiting for you', from: 'Alice' }, resolve);
    });
    expect(sendRes.ok).toBe(true);
    expect(sendRes.status).toBe(MESSAGE_STATUS.QUEUED);

    // Now bird joins
    const birdSocket = ioClient(serverUrl, { transports: ['websocket'] });
    await new Promise((resolve) => birdSocket.on('connect', resolve));

    const deliveredPromise = new Promise((resolve) => {
      birdSocket.on(EVENTS.MESSAGE_NEW, resolve);
    });

    const birdJoinRes = await new Promise((resolve) => {
      birdSocket.emit(EVENTS.BIRD_JOIN, { secret: testSecret }, resolve);
    });
    expect(birdJoinRes.ok).toBe(true);
    expect(birdJoinRes.queued).toBe(1);

    const deliveredMsg = await deliveredPromise;
    expect(deliveredMsg.id).toBe(sendRes.id);
    expect(deliveredMsg.text).toBe('Waiting for you');

    birdSocket.disconnect();
    senderSocket.disconnect();
  });

  it('propagates seen receipt from bird back to room sender', async () => {
    const testSecret = 'seen-receipt-secret';
    const testRoom = deriveRoomId(testSecret, 'test');

    const birdSocket = ioClient(serverUrl, { transports: ['websocket'] });
    await new Promise((resolve) => birdSocket.on('connect', resolve));
    await new Promise((resolve) => {
      birdSocket.emit(EVENTS.BIRD_JOIN, { secret: testSecret }, resolve);
    });

    const senderSocket = ioClient(serverUrl, { transports: ['websocket'] });
    await new Promise((resolve) => senderSocket.on('connect', resolve));
    await new Promise((resolve) => {
      senderSocket.emit(EVENTS.SENDER_JOIN, { roomId: testRoom }, resolve);
    });

    const sendRes = await new Promise((resolve) => {
      senderSocket.emit(EVENTS.MESSAGE_SEND, { text: 'Testing seen receipt' }, resolve);
    });

    // Sender listens for seen status
    const seenPromise = new Promise((resolve) => {
      senderSocket.on(EVENTS.MESSAGE_STATUS, (payload) => {
        if (payload.id === sendRes.id && payload.status === MESSAGE_STATUS.SEEN) {
          resolve(payload);
        }
      });
    });

    // Bird sends seen receipt
    birdSocket.emit(EVENTS.MESSAGE_SEEN, { id: sendRes.id });

    const seenReceipt = await seenPromise;
    expect(seenReceipt.id).toBe(sendRes.id);
    expect(seenReceipt.status).toBe(MESSAGE_STATUS.SEEN);

    birdSocket.disconnect();
    senderSocket.disconnect();
  });

  it('enforces sender rate limits (1 message per 2 seconds)', async () => {
    const testSecret = 'rate-limit-secret';
    const testRoom = deriveRoomId(testSecret, 'test');

    const senderSocket = ioClient(serverUrl, { transports: ['websocket'] });
    await new Promise((resolve) => senderSocket.on('connect', resolve));
    await new Promise((resolve) => {
      senderSocket.emit(EVENTS.SENDER_JOIN, { roomId: testRoom }, resolve);
    });

    // First send succeeds
    const res1 = await new Promise((resolve) => {
      senderSocket.emit(EVENTS.MESSAGE_SEND, { text: 'First msg' }, resolve);
    });
    expect(res1.ok).toBe(true);

    // Immediate second send fails with rate_limited
    const res2 = await new Promise((resolve) => {
      senderSocket.emit(EVENTS.MESSAGE_SEND, { text: 'Rapid fire msg' }, resolve);
    });
    expect(res2.ok).toBe(false);
    expect(res2.code).toBe(ERROR_CODES.RATE_LIMITED);
    expect(typeof res2.retryAfterMs).toBe('number');

    senderSocket.disconnect();
  });

  it('rejects empty and too-long messages', async () => {
    const testSecret = 'validation-secret';
    const testRoom = deriveRoomId(testSecret, 'test');

    const senderSocket = ioClient(serverUrl, { transports: ['websocket'] });
    await new Promise((resolve) => senderSocket.on('connect', resolve));
    await new Promise((resolve) => {
      senderSocket.emit(EVENTS.SENDER_JOIN, { roomId: testRoom }, resolve);
    });

    // Empty text
    const emptyRes = await new Promise((resolve) => {
      senderSocket.emit(EVENTS.MESSAGE_SEND, { text: '   ' }, resolve);
    });
    expect(emptyRes.ok).toBe(false);
    expect(emptyRes.code).toBe(ERROR_CODES.EMPTY);

    // Too long text
    const tooLongRes = await new Promise((resolve) => {
      senderSocket.emit(EVENTS.MESSAGE_SEND, { text: 'x'.repeat(121) }, resolve);
    });
    expect(tooLongRes.ok).toBe(false);
    expect(tooLongRes.code).toBe(ERROR_CODES.TOO_LONG);

    senderSocket.disconnect();
  });

  it('rejects message when offline queue is full', async () => {
    const testSecret = 'queue-full-secret';
    const testRoom = deriveRoomId(testSecret, 'test');

    // Create a new sender socket for each message to bypass the 1 msg / 2s per socket limit
    for (let i = 0; i < 3; i++) {
      const s = ioClient(serverUrl, { transports: ['websocket'] });
      await new Promise((resolve) => s.on('connect', resolve));
      await new Promise((resolve) => s.emit(EVENTS.SENDER_JOIN, { roomId: testRoom }, resolve));
      const res = await new Promise((resolve) =>
        s.emit(EVENTS.MESSAGE_SEND, { text: `Msg ${i}` }, resolve)
      );
      expect(res.ok).toBe(true);
      s.disconnect();
    }

    // 4th message should fail because maxQueue is 3
    const s4 = ioClient(serverUrl, { transports: ['websocket'] });
    await new Promise((resolve) => s4.on('connect', resolve));
    await new Promise((resolve) => s4.emit(EVENTS.SENDER_JOIN, { roomId: testRoom }, resolve));
    const overflowRes = await new Promise((resolve) =>
      s4.emit(EVENTS.MESSAGE_SEND, { text: 'Overflow msg' }, resolve)
    );
    expect(overflowRes.ok).toBe(false);
    expect(overflowRes.code).toBe(ERROR_CODES.QUEUE_FULL);
    s4.disconnect();
  });
});

