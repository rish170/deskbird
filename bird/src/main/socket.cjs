const { io } = require('socket.io-client');
const { EVENTS, PROTOCOL_VERSION } = require('deskbird-shared');

class BirdSocketClient {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl;
    this.secret = options.secret;
    this.appVersion = options.appVersion || PROTOCOL_VERSION;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || 240000;
    this.onMessage = options.onMessage || (() => {});
    this.onStateChange = options.onStateChange || (() => {});
    this.socket = null;
    this.heartbeatTimer = null;
    this.state = 'offline'; // 'connected' | 'reconnecting' | 'offline'
  }

  connect() {
    if (this.socket) {
      this.socket.disconnect();
    }

    this.setState('reconnecting');

    this.socket = io(this.serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
      randomizationFactor: 0.5
    });

    this.socket.on('connect', () => {
      this.setState('connected');
      console.log(`[Deskbird Main] Connected to server at ${this.serverUrl}`);

      // Authenticate bird with secret
      this.socket.emit(
        EVENTS.BIRD_JOIN,
        {
          secret: this.secret,
          appVersion: this.appVersion
        },
        (res) => {
          if (res && res.ok) {
            console.log(`[Deskbird Main] Bird successfully joined room: ${res.roomId} (${res.queued} queued msgs)`);
          } else {
            console.warn('[Deskbird Main] Failed to join room:', res ? res.code : 'unknown');
          }
        }
      );

      this.startHeartbeat();
    });

    this.socket.on(EVENTS.MESSAGE_NEW, (message) => {
      console.log(`[Deskbird Main] Received message: ${message.id} from ${message.from || 'Anonymous'}`);
      this.onMessage(message);
    });

    this.socket.on('connect_error', (_err) => {
      this.setState('reconnecting');
      this.stopHeartbeat();
    });

    this.socket.on('disconnect', () => {
      this.setState('reconnecting');
      this.stopHeartbeat();
    });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit(EVENTS.BIRD_PING);
      }
    }, this.heartbeatIntervalMs);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  sendSeenReceipt(messageId) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(EVENTS.MESSAGE_SEEN, { id: messageId });
    }
  }

  setState(newState) {
    if (this.state !== newState) {
      this.state = newState;
      this.onStateChange(newState);
    }
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.setState('offline');
  }
}

module.exports = {
  BirdSocketClient
};
