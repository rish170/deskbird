import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import {
  EVENTS,
  MESSAGE_STATUS,
  LOCAL_TEST_ROOM_ID
} from 'deskbird-shared';
import { createDeskbirdServer } from '../src/index.js';

describe('Feature 1 & 2: SMS Alerts and Message History Tests', () => {
  let serverInstance;
  let httpServer;
  let serverUrl;
  let serverPort;

  beforeAll(async () => {
    serverInstance = createDeskbirdServer({
      nodeEnv: 'test',
      allowedOrigins: 'http://localhost:5173,http://127.0.0.1:5173'
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

  it('GET /api/rooms/:roomId/status returns room online state and sms subscription', async () => {
    const res = await fetch(`${serverUrl}/api/rooms/${LOCAL_TEST_ROOM_ID}/status`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.online).toBe(false);
    expect(data.smsSubscribed).toBe(false);
  });

  it('POST & DELETE /api/rooms/:roomId/sms-subscription saves and removes phone', async () => {
    // 1. Invalid phone without country code
    const invalidRes = await fetch(`${serverUrl}/api/rooms/${LOCAL_TEST_ROOM_ID}/sms-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '1234567890' })
    });
    expect(invalidRes.status).toBe(400);

    // 2. Valid international phone
    const validRes = await fetch(`${serverUrl}/api/rooms/${LOCAL_TEST_ROOM_ID}/sms-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+12345678901' })
    });
    expect(validRes.status).toBe(200);
    const validData = await validRes.json();
    expect(validData.ok).toBe(true);
    expect(validData.subscribed).toBe(true);
    expect(validData.maskedPhone).toContain('***');

    // 3. Status confirms subscription
    const statusRes = await fetch(`${serverUrl}/api/rooms/${LOCAL_TEST_ROOM_ID}/status`);
    const statusData = await statusRes.json();
    expect(statusData.smsSubscribed).toBe(true);
    expect(statusData.maskedPhone).toContain('***');

    // 4. Test SMS endpoint
    const testSmsRes = await fetch(`${serverUrl}/api/rooms/${LOCAL_TEST_ROOM_ID}/sms-test`, {
      method: 'POST'
    });
    const testSmsData = await testSmsRes.json();
    expect(testSmsData.ok).toBe(true);

    // 5. Delete subscription
    const deleteRes = await fetch(`${serverUrl}/api/rooms/${LOCAL_TEST_ROOM_ID}/sms-subscription`, {
      method: 'DELETE'
    });
    expect(deleteRes.status).toBe(200);
    const deleteData = await deleteRes.json();
    expect(deleteData.subscribed).toBe(false);
  });

  it('GET /api/rooms/:roomId/history records and returns message history', async () => {
    // Send a message via socket
    const senderSocket = ioClient(serverUrl, { transports: ['websocket'] });
    await new Promise((resolve) => senderSocket.on('connect', resolve));

    await new Promise((resolve) => {
      senderSocket.emit(EVENTS.SENDER_JOIN, { roomId: LOCAL_TEST_ROOM_ID }, resolve);
    });

    await new Promise((resolve) => {
      senderSocket.emit(
        EVENTS.MESSAGE_SEND,
        { text: 'Hello history archive!', from: 'TestBot' },
        (res) => {
          expect(res.ok).toBe(true);
          resolve();
        }
      );
    });

    senderSocket.disconnect();

    // Verify history endpoint
    const res = await fetch(`${serverUrl}/api/rooms/${LOCAL_TEST_ROOM_ID}/history`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.history.length).toBeGreaterThanOrEqual(1);

    const msg = data.history.find((m) => m.text === 'Hello history archive!');
    expect(msg).toBeDefined();
    expect(msg.from).toBe('TestBot');
    expect(msg.status).toBe(MESSAGE_STATUS.QUEUED);
  });
});

