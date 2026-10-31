import './style.css';
import { io } from 'socket.io-client';
import {
  EVENTS,
  ERROR_CODES,
  MESSAGE_STATUS,
  normalizeRoomId,
  formatRoomId,
  isValidRoomId
} from 'deskbird-shared';

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ||
  (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? 'https://deskbird-server.onrender.com'
    : 'http://localhost:3001');

// DOM Elements
const roomActiveContainer = document.getElementById('room-active-container');
const roomCodeDisplay = document.getElementById('room-code-display');
const changeRoomBtn = document.getElementById('change-room-btn');
const roomInputForm = document.getElementById('room-input-form');
const roomCodeInput = document.getElementById('room-code-input');

const statusPill = document.getElementById('status-pill');
const statusText = document.getElementById('status-text');

const messageForm = document.getElementById('message-form');
const senderNameInput = document.getElementById('sender-name-input');
const messageTextInput = document.getElementById('message-text-input');
const charCounter = document.getElementById('char-counter');
const sendButton = document.getElementById('send-button');
const formErrorAlert = document.getElementById('form-error-alert');
const messageLog = document.getElementById('message-log');

// State
let currentRoomId = null;
let socket = null;
let isBirdOnline = false;
let isRateLimited = false;
let rateLimitTimer = null;
const messages = new Map(); // msgId -> { id, text, from, status, ts }

// LocalStorage helpers
function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key, val) {
  try {
    localStorage.setItem(key, val);
  } catch {
    // Ignore storage quota or disabled storage
  }
}

// Status Pill Helpers
function setStatus(type, message) {
  statusPill.className = `status-pill status-${type}`;
  statusText.textContent = message;
}

function showError(msg) {
  formErrorAlert.textContent = msg;
  formErrorAlert.classList.remove('hidden');
}

function clearError() {
  formErrorAlert.textContent = '';
  formErrorAlert.classList.add('hidden');
}

// Extract room ID from URL hash or storage
function getInitialRoomId() {
  const hash = window.location.hash.replace(/^#\/?/, '').trim();
  if (hash) {
    const norm = normalizeRoomId(hash);
    if (isValidRoomId(norm)) {
      return norm;
    }
  }

  const saved = safeGetItem('deskbird_last_room');
  if (saved && isValidRoomId(saved)) {
    return saved;
  }

  return null;
}

// Room UI Management
function setRoom(roomId) {
  const norm = normalizeRoomId(roomId);
  if (!isValidRoomId(norm)) {
    showError('Invalid code. Please enter an 8-character bird code.');
    return;
  }

  clearError();
  currentRoomId = norm;
  safeSetItem('deskbird_last_room', norm);
  window.location.hash = `#/${norm}`;

  roomCodeDisplay.textContent = formatRoomId(norm);
  roomActiveContainer.classList.remove('hidden');
  roomInputForm.classList.add('hidden');

  connectSocket();
}

function promptForRoom() {
  currentRoomId = null;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  window.location.hash = '';
  roomActiveContainer.classList.add('hidden');
  roomInputForm.classList.remove('hidden');
  roomCodeInput.value = '';
  roomCodeInput.focus();
  setStatus('offline', 'enter a bird code to connect');
}

// Message Rendering in Log
function renderMessageLog() {
  if (messages.size === 0) {
    messageLog.innerHTML = '<div class="empty-log-hint">No messages sent yet. Say hello!</div>';
    return;
  }

  const sorted = Array.from(messages.values()).sort((a, b) => b.ts - a.ts);
  messageLog.innerHTML = '';

  for (const msg of sorted) {
    const item = document.createElement('div');
    item.className = 'message-item';
    item.id = `msg-el-${msg.id}`;

    const header = document.createElement('div');
    header.className = 'message-item-header';

    const senderSpan = document.createElement('span');
    senderSpan.className = 'message-sender-name';
    senderSpan.textContent = msg.from ? `From ${msg.from}` : 'Anonymous';

    const statusBadge = document.createElement('span');
    statusBadge.className = `message-status-badge badge-${msg.status}`;

    let statusLabel = msg.status;
    let tick = '';
    if (msg.status === MESSAGE_STATUS.DELIVERED) {
      tick = ' ✓';
      statusLabel = 'delivered';
    } else if (msg.status === MESSAGE_STATUS.SEEN) {
      tick = ' ✓✓';
      statusLabel = 'seen by bird';
    } else if (msg.status === MESSAGE_STATUS.QUEUED) {
      statusLabel = 'queued';
    } else if (msg.status === 'sending') {
      statusLabel = 'sending...';
    }

    statusBadge.textContent = `${statusLabel}${tick}`;

    header.appendChild(senderSpan);
    header.appendChild(statusBadge);

    const body = document.createElement('div');
    body.className = 'message-text';
    body.textContent = msg.text;

    item.appendChild(header);
    item.appendChild(body);
    messageLog.appendChild(item);
  }
}

function updateMessageStatus(id, newStatus) {
  if (messages.has(id)) {
    const m = messages.get(id);
    m.status = newStatus;
    renderMessageLog();
  }
}

// Wake up Render backend
async function wakeBackend() {
  setStatus('waking', 'waking the server (may take ~30s)...');
  try {
    const res = await fetch(`${SERVER_URL}/healthz`, { mode: 'cors' });
    if (res.ok) {
      setStatus('waking', 'server awake, connecting...');
    }
  } catch (err) {
    console.warn('Initial server ping error (server might still be booting):', err);
  }
}

// Socket Connection
function connectSocket() {
  if (!currentRoomId) return;

  if (socket) {
    socket.disconnect();
  }

  socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    timeout: 20000,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15000,
    randomizationFactor: 0.5
  });

  socket.on('connect', () => {
    setStatus('waking', 'joining room...');
    socket.emit(EVENTS.SENDER_JOIN, { roomId: currentRoomId }, (res) => {
      if (res && res.ok) {
        isBirdOnline = Boolean(res.birdOnline);
        if (isBirdOnline) {
          setStatus('online', 'bird is online');
        } else {
          setStatus('offline', 'bird offline - messages will wait');
        }
      } else {
        setStatus('offline', 'failed to join room');
        showError('Could not join room. Check the code and try again.');
      }
    });
  });

  socket.on(EVENTS.BIRD_STATUS, (data) => {
    isBirdOnline = Boolean(data && data.online);
    if (isBirdOnline) {
      setStatus('online', 'bird is online');
    } else {
      setStatus('offline', 'bird offline - messages will wait');
    }
  });

  socket.on(EVENTS.MESSAGE_STATUS, (data) => {
    if (data && data.id && data.status) {
      updateMessageStatus(data.id, data.status);
    }
  });

  socket.on('connect_error', () => {
    setStatus('reconnecting', 'reconnecting to server...');
  });

  socket.on('disconnect', () => {
    setStatus('reconnecting', 'disconnected, reconnecting...');
  });
}

// Send Message Handler
function handleSendMessage() {
  if (!currentRoomId || !socket || !socket.connected) {
    showError('Not connected to the server yet.');
    return;
  }

  if (isRateLimited) {
    return;
  }

  clearError();
  const text = messageTextInput.value.trim();
  const from = senderNameInput.value.trim();

  if (!text) {
    showError('Message cannot be empty.');
    return;
  }
  if (text.length > 120) {
    showError('Message exceeds 120 characters.');
    return;
  }

  // Save sender name preference
  if (from) {
    safeSetItem('deskbird_sender_name', from);
  }

  // Local optimistic message
  const localId = `local_${Date.now()}`;
  const localMsg = {
    id: localId,
    text,
    from: from || '',
    status: 'sending',
    ts: Date.now()
  };
  messages.set(localId, localMsg);
  renderMessageLog();

  sendButton.disabled = true;

  socket.emit(EVENTS.MESSAGE_SEND, { text, from }, (res) => {
    sendButton.disabled = false;

    if (res && res.ok) {
      // Replace optimistic message with confirmed id and status
      messages.delete(localId);
      messages.set(res.id, {
        id: res.id,
        text,
        from: from || '',
        status: res.status || MESSAGE_STATUS.DELIVERED,
        ts: localMsg.ts
      });
      renderMessageLog();
      messageTextInput.value = '';
      charCounter.textContent = '0 / 120';
      charCounter.classList.remove('counter-warning');
    } else {
      messages.delete(localId);
      renderMessageLog();

      const errCode = res ? res.code : 'server_error';
      if (errCode === ERROR_CODES.RATE_LIMITED) {
        const retryAfter = res.retryAfterMs || 2000;
        triggerRateLimit(retryAfter);
      } else if (errCode === ERROR_CODES.QUEUE_FULL) {
        showError('Bird message queue is full (max 20 unread). Please try again later.');
      } else {
        showError(`Failed to deliver: ${errCode}`);
      }
    }
  });
}

function triggerRateLimit(ms) {
  isRateLimited = true;
  sendButton.disabled = true;
  const seconds = Math.ceil(ms / 1000);
  showError(`Please wait ${seconds}s before sending another note.`);

  clearTimeout(rateLimitTimer);
  rateLimitTimer = setTimeout(() => {
    isRateLimited = false;
    sendButton.disabled = false;
    clearError();
  }, ms);
}

// Event Listeners
function initEventListeners() {
  // Room change
  changeRoomBtn.addEventListener('click', promptForRoom);

  // Room input submit
  roomInputForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = roomCodeInput.value.trim();
    if (code) {
      setRoom(code);
    }
  });

  // Char counter
  messageTextInput.addEventListener('input', () => {
    const len = messageTextInput.value.length;
    charCounter.textContent = `${len} / 120`;
    if (len >= 110) {
      charCounter.classList.add('counter-warning');
    } else {
      charCounter.classList.remove('counter-warning');
    }
  });

  // Enter sends, Shift+Enter makes newline
  messageTextInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // Form submit
  messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSendMessage();
  });

  // Hash changes in browser URL
  window.addEventListener('hashchange', () => {
    const newRoom = getInitialRoomId();
    if (newRoom && newRoom !== currentRoomId) {
      setRoom(newRoom);
    }
  });
}

// Initial Bootstrap
async function init() {
  initEventListeners();

  // Restore saved name
  const savedName = safeGetItem('deskbird_sender_name');
  if (savedName) {
    senderNameInput.value = savedName;
  }

  // Pre-warm backend
  wakeBackend();

  const initialRoom = getInitialRoomId();
  if (initialRoom) {
    setRoom(initialRoom);
  } else {
    promptForRoom();
  }
}

init();

