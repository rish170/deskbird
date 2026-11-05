import { LIMITS, MESSAGE_STATUS, ERROR_CODES } from 'deskbird-shared';

export class RoomManager {
  constructor(options = {}) {
    this.maxQueue = options.maxQueue || LIMITS.MAX_QUEUE;
    this.messageTtlMs = options.messageTtlMs || LIMITS.MESSAGE_TTL_MS;
    this.roomHourlyLimit = options.roomHourlyLimit || LIMITS.RATE_LIMIT_ROOM_HOURLY;
    this.maxHistory = options.maxHistory || 200;
    this.rooms = new Map(); // roomId -> Room
    this.socketToBirdRoom = new Map(); // socketId -> roomId
  }

  getOrCreateRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        roomId,
        birdSocketId: null,
        queue: [], // Array<{ id, text, from, ts, status }>
        history: [], // Array<{ id, text, from, ts, status }>
        smsPhone: null, // Subscribed phone number for bird online alerts
        messageTimestamps: [] // for hourly rate limiting
      });
    }
    const room = this.rooms.get(roomId);
    this.cleanExpiredMessages(room);
    return room;
  }

  getRoom(roomId) {
    if (!this.rooms.has(roomId)) return null;
    const room = this.rooms.get(roomId);
    this.cleanExpiredMessages(room);
    return room;
  }

  cleanExpiredMessages(room, now = Date.now()) {
    const cutoff = now - this.messageTtlMs;
    room.queue = room.queue.filter((msg) => msg.ts >= cutoff);
    // Also clean hourly rate limit timestamps (older than 1 hour)
    const hourCutoff = now - 3600000;
    room.messageTimestamps = room.messageTimestamps.filter((ts) => ts >= hourCutoff);
  }

  isBirdOnline(roomId) {
    const room = this.rooms.get(roomId);
    return Boolean(room && room.birdSocketId);
  }

  getBirdSocketId(roomId) {
    const room = this.rooms.get(roomId);
    return room ? room.birdSocketId : null;
  }

  setBirdOnline(roomId, socketId) {
    const room = this.getOrCreateRoom(roomId);
    room.birdSocketId = socketId;
    this.socketToBirdRoom.set(socketId, roomId);
  }

  setBirdOffline(socketId) {
    const roomId = this.socketToBirdRoom.get(socketId);
    if (!roomId) return null;

    this.socketToBirdRoom.delete(socketId);
    const room = this.rooms.get(roomId);
    if (room && room.birdSocketId === socketId) {
      room.birdSocketId = null;
      return roomId;
    }
    return null;
  }

  canSendToRoom(roomId, now = Date.now()) {
    const room = this.getOrCreateRoom(roomId);
    this.cleanExpiredMessages(room, now);
    return room.messageTimestamps.length < this.roomHourlyLimit;
  }

  recordRoomMessage(roomId, now = Date.now()) {
    const room = this.getOrCreateRoom(roomId);
    room.messageTimestamps.push(now);
  }

  enqueueMessage(roomId, message) {
    const room = this.getOrCreateRoom(roomId);
    if (room.queue.length >= this.maxQueue) {
      return { ok: false, error: ERROR_CODES.QUEUE_FULL };
    }
    const item = {
      ...message,
      status: MESSAGE_STATUS.QUEUED
    };
    room.queue.push(item);
    return { ok: true, message: item };
  }

  drainQueue(roomId) {
    const room = this.getOrCreateRoom(roomId);
    const queued = [...room.queue];
    room.queue = [];
    return queued;
  }

  updateMessageStatus(roomId, messageId, status) {
    const room = this.getRoom(roomId);
    if (!room) return false;
    const msg = room.queue.find((m) => m.id === messageId);
    if (msg) {
      msg.status = status;
      return true;
    }
    return false;
  }

  recordHistory(roomId, message, initialStatus = MESSAGE_STATUS.DELIVERED) {
    const room = this.getOrCreateRoom(roomId);
    const item = {
      id: message.id,
      text: message.text,
      from: message.from || 'Anonymous',
      ts: message.ts || Date.now(),
      status: initialStatus
    };
    room.history.push(item);
    if (room.history.length > this.maxHistory) {
      room.history.shift();
    }
    return item;
  }

  updateHistoryStatus(roomId, messageId, status) {
    const room = this.getRoom(roomId);
    if (!room) return false;
    const msg = room.history.find((m) => m.id === messageId);
    if (msg) {
      msg.status = status;
      return true;
    }
    return false;
  }

  getHistory(roomId) {
    const room = this.getRoom(roomId);
    if (!room) return [];
    return [...room.history];
  }

  setSmsPhone(roomId, phone) {
    const room = this.getOrCreateRoom(roomId);
    room.smsPhone = phone ? phone.trim() : null;
    return room.smsPhone;
  }

  getSmsPhone(roomId) {
    const room = this.getRoom(roomId);
    return room ? room.smsPhone : null;
  }
}
