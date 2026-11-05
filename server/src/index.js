import http from 'node:http';
import { fileURLToPath, URL } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import {
  PROTOCOL_VERSION,
  EVENTS,
  ERROR_CODES,
  MESSAGE_STATUS,
  deriveRoomId,
  normalizeRoomId,
  formatRoomId,
  isValidRoomId,
  validateMessage
} from 'deskbird-shared';
import { RoomManager } from './rooms.js';
import { RateLimiter } from './limits.js';
import { SmsService } from './sms.js';

dotenv.config();

export function createDeskbirdServer(options = {}) {
  const nodeEnv = options.nodeEnv || process.env.NODE_ENV || 'development';
  const allowedOriginsRaw = options.allowedOrigins || process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3001';
  const allowedOrigins = allowedOriginsRaw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const isOriginAllowed = (origin) => {
    if (!origin) return true;
    const clean = origin.replace(/\/$/, '');
    if (allowedOrigins.includes('*') || allowedOrigins.includes(clean) || allowedOrigins.includes(origin)) {
      return true;
    }
    try {
      const parsed = new URL(clean);
      if (
        parsed.hostname.endsWith('.vercel.app') ||
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1'
      ) {
        return true;
      }
    } catch {}
    return false;
  };

  const app = express();
  const httpServer = http.createServer(app);

  // Security and CORS middleware
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true
    })
  );
  app.use(express.json());

  // Root welcoming route
  app.get('/', (req, res) => {
    res.json({
      name: 'Deskbird Server',
      status: 'healthy',
      ok: true,
      version: PROTOCOL_VERSION,
      env: nodeEnv
    });
  });

  // Health check endpoint (used by Render and web client wakeup)
  app.get('/healthz', (req, res) => {
    res.json({
      ok: true,
      status: 'healthy',
      version: PROTOCOL_VERSION,
      uptime: Math.floor(process.uptime()),
      env: nodeEnv
    });
  });

  const smsService = new SmsService();

  const roomManager = new RoomManager({
    maxQueue: options.maxQueue ? parseInt(options.maxQueue, 10) : undefined,
    messageTtlMs: options.messageTtlMs ? parseInt(options.messageTtlMs, 10) : undefined
  });
  const rateLimiter = new RateLimiter();

  // API 1: Room status & SMS alert state
  app.get('/api/rooms/:roomId/status', (req, res) => {
    const roomId = normalizeRoomId(req.params.roomId);
    if (!isValidRoomId(roomId)) {
      return res.status(400).json({ ok: false, error: 'Invalid room code' });
    }
    const online = roomManager.isBirdOnline(roomId);
    const phone = roomManager.getSmsPhone(roomId);
    return res.json({
      ok: true,
      roomId,
      formattedCode: formatRoomId(roomId),
      online,
      smsSubscribed: Boolean(phone),
      maskedPhone: smsService.maskPhone(phone),
      smsConfigured: smsService.isConfigured()
    });
  });

  // API 2: Subscribe phone number to receive online SMS alert
  app.post('/api/rooms/:roomId/sms-subscription', (req, res) => {
    const roomId = normalizeRoomId(req.params.roomId);
    if (!isValidRoomId(roomId)) {
      return res.status(400).json({ ok: false, error: 'Invalid room code' });
    }
    const phone = req.body && req.body.phone;
    if (!phone || !smsService.isValidPhone(phone)) {
      return res.status(400).json({
        ok: false,
        error: 'Please enter a valid phone number with country code (e.g. +1234567890).'
      });
    }
    roomManager.setSmsPhone(roomId, phone);
    return res.json({
      ok: true,
      subscribed: true,
      maskedPhone: smsService.maskPhone(phone)
    });
  });

  // API 3: Remove phone subscription
  app.delete('/api/rooms/:roomId/sms-subscription', (req, res) => {
    const roomId = normalizeRoomId(req.params.roomId);
    if (!isValidRoomId(roomId)) {
      return res.status(400).json({ ok: false, error: 'Invalid room code' });
    }
    roomManager.setSmsPhone(roomId, null);
    return res.json({ ok: true, subscribed: false });
  });

  // API 4: Test SMS trigger
  app.post('/api/rooms/:roomId/sms-test', async (req, res) => {
    const roomId = normalizeRoomId(req.params.roomId);
    if (!isValidRoomId(roomId)) {
      return res.status(400).json({ ok: false, error: 'Invalid room code' });
    }
    const phone = roomManager.getSmsPhone(roomId);
    if (!phone) {
      return res.status(400).json({ ok: false, error: 'No phone number saved for this room.' });
    }
    const sendRes = await smsService.sendTestSms(phone, formatRoomId(roomId));
    return res.json(sendRes);
  });

  // API 5: Full message history for room
  app.get('/api/rooms/:roomId/history', (req, res) => {
    const roomId = normalizeRoomId(req.params.roomId);
    if (!isValidRoomId(roomId)) {
      return res.status(400).json({ ok: false, error: 'Invalid room code' });
    }
    const history = roomManager.getHistory(roomId);
    return res.json({
      ok: true,
      roomId,
      formattedCode: formatRoomId(roomId),
      history
    });
  });

  // Socket.IO configuration
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
          return callback(null, true);
        }
        return callback(new Error('CORS origin rejected'));
      },
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingInterval: 20000,
    pingTimeout: 25000,
    transports: ['websocket', 'polling']
  });

  io.on('connection', (socket) => {
    const _clientIp = socket.handshake.address;

    // 1. Bird joining
    socket.on(EVENTS.BIRD_JOIN, async (payload, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};
      try {
        if (!payload || !payload.secret) {
          return ack({ ok: false, code: ERROR_CODES.BAD_SECRET });
        }

        let roomId;
        try {
          roomId = deriveRoomId(payload.secret, nodeEnv);
        } catch {
          return ack({ ok: false, code: ERROR_CODES.BAD_SECRET });
        }

        const wasOffline = !roomManager.isBirdOnline(roomId);
        roomManager.setBirdOnline(roomId, socket.id);
        socket.data.birdRoomId = roomId;

        // Broadcast online status to any senders in this room
        io.to(`room:${roomId}`).emit(EVENTS.BIRD_STATUS, { online: true });

        // If bird transitioned from offline to online, check for SMS subscriber
        if (wasOffline) {
          const smsPhone = roomManager.getSmsPhone(roomId);
          if (smsPhone) {
            smsService.sendBirdOnlineAlert(roomId, smsPhone, formatRoomId(roomId)).catch((err) => {
              console.error('[Deskbird SMS] Error sending online alert:', err.message);
            });
          }
        }

        // Deliver any queued messages
        const queued = roomManager.drainQueue(roomId);
        for (const msg of queued) {
          socket.emit(EVENTS.MESSAGE_NEW, {
            id: msg.id,
            text: msg.text,
            from: msg.from,
            ts: msg.ts
          });
          roomManager.updateHistoryStatus(roomId, msg.id, MESSAGE_STATUS.DELIVERED);
          // Inform senders that the queued message was delivered
          io.to(`room:${roomId}`).emit(EVENTS.MESSAGE_STATUS, {
            id: msg.id,
            status: MESSAGE_STATUS.DELIVERED
          });
        }

        console.log(`[Deskbird] Bird joined room: ${roomId} (delivered ${queued.length} queued messages)`);
        return ack({ ok: true, roomId, queued: queued.length });
      } catch (err) {
        console.error('[Deskbird] Error in bird:join:', err.message);
        return ack({ ok: false, code: ERROR_CODES.SERVER_ERROR });
      }
    });

    // 2. Bird ping (keepalive for Render free tier)
    socket.on(EVENTS.BIRD_PING, (callback) => {
      if (typeof callback === 'function') {
        callback({ ok: true, ts: Date.now() });
      }
    });

    // 3. Bird seen receipt
    socket.on(EVENTS.MESSAGE_SEEN, (payload) => {
      const roomId = socket.data.birdRoomId;
      if (!roomId || !payload || !payload.id) return;
      roomManager.updateHistoryStatus(roomId, payload.id, MESSAGE_STATUS.SEEN);
      io.to(`room:${roomId}`).emit(EVENTS.MESSAGE_STATUS, {
        id: payload.id,
        status: MESSAGE_STATUS.SEEN
      });
    });

    // 4. Sender joining
    socket.on(EVENTS.SENDER_JOIN, (payload, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};
      if (!payload || !payload.roomId) {
        return ack({ ok: false, code: ERROR_CODES.BAD_ROOM });
      }

      const roomId = normalizeRoomId(payload.roomId);
      if (!isValidRoomId(roomId)) {
        return ack({ ok: false, code: ERROR_CODES.BAD_ROOM });
      }

      socket.join(`room:${roomId}`);
      socket.data.senderRoomId = roomId;

      const birdOnline = roomManager.isBirdOnline(roomId);
      return ack({ ok: true, birdOnline });
    });

    // 5. Sender sending message
    socket.on(EVENTS.MESSAGE_SEND, (payload, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};
      const roomId = socket.data.senderRoomId;
      if (!roomId) {
        return ack({ ok: false, code: ERROR_CODES.BAD_ROOM });
      }

      if (!payload) {
        return ack({ ok: false, code: ERROR_CODES.EMPTY });
      }

      // Check per-sender rate limit (1 msg per 2 seconds)
      const senderCheck = rateLimiter.checkSender(socket.id);
      if (!senderCheck.allowed) {
        return ack({
          ok: false,
          code: ERROR_CODES.RATE_LIMITED,
          retryAfterMs: senderCheck.retryAfterMs
        });
      }

      // Check per-room rate limit
      if (!roomManager.canSendToRoom(roomId)) {
        return ack({
          ok: false,
          code: ERROR_CODES.RATE_LIMITED,
          retryAfterMs: roomManager.getRoomRetryAfterMs(roomId),
          error: 'Room hourly message limit reached. Please wait a bit before sending more messages.'
        });
      }

      // Validate message content
      const validation = validateMessage(payload.text, payload.from);
      if (!validation.valid) {
        return ack({ ok: false, code: validation.error });
      }

      // Record rate limit consumption
      rateLimiter.recordSender(socket.id);
      roomManager.recordRoomMessage(roomId);

      const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const message = {
        id: msgId,
        text: validation.sanitizedText,
        from: validation.sanitizedFrom,
        ts: Date.now()
      };

      const birdSocketId = roomManager.getBirdSocketId(roomId);
      if (birdSocketId) {
        // Bird is online: deliver immediately
        io.to(birdSocketId).emit(EVENTS.MESSAGE_NEW, message);
        roomManager.recordHistory(roomId, message, MESSAGE_STATUS.DELIVERED);
        io.to(`room:${roomId}`).emit(EVENTS.MESSAGE_STATUS, {
          id: msgId,
          status: MESSAGE_STATUS.DELIVERED
        });
        return ack({ ok: true, id: msgId, status: MESSAGE_STATUS.DELIVERED });
      } else {
        // Bird is offline: store in queue
        const enqueueRes = roomManager.enqueueMessage(roomId, message);
        if (!enqueueRes.ok) {
          return ack({ ok: false, code: enqueueRes.error });
        }
        roomManager.recordHistory(roomId, message, MESSAGE_STATUS.QUEUED);
        return ack({ ok: true, id: msgId, status: MESSAGE_STATUS.QUEUED });
      }
    });

    // 6. Disconnect
    socket.on('disconnect', () => {
      rateLimiter.cleanupSocket(socket.id);
      const offlineRoomId = roomManager.setBirdOffline(socket.id);
      if (offlineRoomId) {
        io.to(`room:${offlineRoomId}`).emit(EVENTS.BIRD_STATUS, { online: false });
        console.log(`[Deskbird] Bird disconnected from room: ${offlineRoomId}`);
      }
    });
  });

  return { app, httpServer, io, roomManager, smsService };
}

// Direct execution entry point
const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  const PORT = process.env.PORT || 3001;
  const { httpServer } = createDeskbirdServer();
  httpServer.listen(PORT, () => {
    console.log(`[Deskbird Server] Listening on port ${PORT}`);
  });

  // Graceful shutdown handling
  const shutdown = () => {
    console.log('[Deskbird Server] Shutting down gracefully...');
    httpServer.close(() => {
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
