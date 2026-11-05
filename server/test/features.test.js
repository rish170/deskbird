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

  it('SmsService handles Twilio trial error 572006 by retrying with trial template', async () => {
    const { SmsService } = await import('../src/sms.js');
    const service = new SmsService({
      accountSid: 'AC_TEST',
      authToken: 'AUTH_TEST',
      fromNumber: '+17372508034'
    });

    const calls = [];
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, opts) => {
        calls.push({ url, body: opts.body });
        // First call fails with 572006
        if (calls.length === 1) {
          return {
            ok: false,
            json: async () => ({
              code: 572006,
              message: 'Invalid template name. Trial accounts can only use predefined SMS templates.'
            })
          };
        }
        // Retry call succeeds
        return {
          ok: true,
          json: async () => ({ sid: 'SM_TRIAL_SUCCESS' })
        };
      };

      const result = await service.sendSms({
        to: '+919404082621',
        body: 'Custom Deskbird Message'
      });

      expect(result.ok).toBe(true);
      expect(result.trialMode).toBe(true);
      expect(result.sid).toBe('SM_TRIAL_SUCCESS');
      expect(calls.length).toBe(2);
      expect(calls[0].body).toContain('Custom+Deskbird+Message');
      expect(calls[1].body).toContain('sms_event_notifications');

      // Subsequent call should directly use trial template
      const nextResult = await service.sendSms({
        to: '+919404082621',
        body: 'Another Message'
      });
      expect(nextResult.ok).toBe(true);
      expect(calls.length).toBe(3);
      expect(calls[2].body).toContain('sms_event_notifications');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

