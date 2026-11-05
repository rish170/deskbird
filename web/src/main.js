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

// Top-level Room DOM Elements
const roomActiveContainer = document.getElementById('room-active-container');
const roomCodeDisplay = document.getElementById('room-code-display');
const changeRoomBtn = document.getElementById('change-room-btn');
const roomInputForm = document.getElementById('room-input-form');
const roomCodeInput = document.getElementById('room-code-input');

// View Containers
const mainView = document.getElementById('main-view');
const statusView = document.getElementById('status-view');
const historyView = document.getElementById('history-view');

// Main View DOM Elements
const statusPill = document.getElementById('status-pill');
const statusText = document.getElementById('status-text');
const messageForm = document.getElementById('message-form');
const senderNameInput = document.getElementById('sender-name-input');
const messageTextInput = document.getElementById('message-text-input');
const charCounter = document.getElementById('char-counter');
const sendButton = document.getElementById('send-button');
const formErrorAlert = document.getElementById('form-error-alert');
const messageLog = document.getElementById('message-log');

// Status View DOM Elements
const statusViewPill = document.getElementById('status-view-pill');
const statusViewStateText = document.getElementById('status-view-state-text');
const smsForm = document.getElementById('sms-form');
const smsPhoneInput = document.getElementById('sms-phone-input');
const smsFeedbackAlert = document.getElementById('sms-feedback-alert');
const smsActiveContainer = document.getElementById('sms-active-container');
const smsActiveNumber = document.getElementById('sms-active-number');
const smsTestBtn = document.getElementById('sms-test-btn');
const smsRemoveBtn = document.getElementById('sms-remove-btn');

// History View DOM Elements
const historyViewLog = document.getElementById('history-view-log');
const historyRefreshBtn = document.getElementById('history-refresh-btn');

// State
let currentRoomId = null;
let _currentView = 'main'; // 'main' | 'status' | 'history'
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
  if (statusPill && statusText) {
    statusPill.className = `status-pill status-${type}`;
    statusText.textContent = message;
  }
  updateStatusViewPill(type === 'online');
}

function updateStatusViewPill(online) {
  if (!statusViewPill || !statusViewStateText) return;
  if (online) {
    statusViewPill.className = 'status-pill status-online';
    statusViewStateText.textContent = 'bird is currently online';
  } else {
    statusViewPill.className = 'status-pill status-offline';
    statusViewStateText.textContent = 'bird is currently offline / asleep';
  }
}

function showError(msg) {
  if (formErrorAlert) {
    formErrorAlert.textContent = msg;
    formErrorAlert.classList.remove('hidden');
  }
}

function clearError() {
  if (formErrorAlert) {
    formErrorAlert.textContent = '';
    formErrorAlert.classList.add('hidden');
  }
}

// URL Hash Parser
// #/abcd-1234 -> { roomId: 'ABCD1234', view: 'main' }
// #/abcd-1234/status -> { roomId: 'ABCD1234', view: 'status' }
// #/abcd-1234/history -> { roomId: 'ABCD1234', view: 'history' }
function parseHashRoute() {
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  if (!raw) {
    return { roomId: null, view: 'main' };
  }
  const parts = raw.split('/').filter(Boolean);
  const norm = normalizeRoomId(parts[0]);
  const subView = parts[1] ? parts[1].toLowerCase() : 'main';
  return {
    roomId: isValidRoomId(norm) ? norm : null,
    view: ['status', 'history'].includes(subView) ? subView : 'main'
  };
}

// View Switcher
function switchView(viewName) {
  _currentView = viewName;

  mainView.classList.add('hidden');
  statusView.classList.add('hidden');
  historyView.classList.add('hidden');

  if (viewName === 'status') {
    statusView.classList.remove('hidden');
    loadStatusView();
  } else if (viewName === 'history') {
    historyView.classList.remove('hidden');
    loadHistoryView();
  } else {
    mainView.classList.remove('hidden');
  }
}

// Route Handler
function handleRoute() {
  const route = parseHashRoute();
  if (route.roomId) {
    if (route.roomId !== currentRoomId) {
      currentRoomId = route.roomId;
      safeSetItem('deskbird_last_room', route.roomId);
      roomCodeDisplay.textContent = formatRoomId(route.roomId);
      roomActiveContainer.classList.remove('hidden');
      roomInputForm.classList.add('hidden');
      connectSocket();
    }
    switchView(route.view);
  } else {
    // If no valid room in hash, check localStorage
    const saved = safeGetItem('deskbird_last_room');
    if (saved && isValidRoomId(saved)) {
      window.location.hash = `#/${saved}`;
    } else {
      promptForRoom();
    }
  }
}

// Room UI Management
function setRoom(roomId) {
  const norm = normalizeRoomId(roomId);
  if (!isValidRoomId(norm)) {
    showError('Invalid code. Please enter an 8-character bird code.');
    return;
  }

  clearError();
  safeSetItem('deskbird_last_room', norm);
  window.location.hash = `#/${norm}`;
}

function promptForRoom() {
  currentRoomId = null;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  safeSetItem('deskbird_last_room', '');
  try {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname);
    } else {
      window.location.hash = '';
    }
  } catch {
    window.location.hash = '';
  }
  roomActiveContainer.classList.add('hidden');
  roomInputForm.classList.remove('hidden');
  roomCodeInput.value = '';
  roomCodeInput.focus();
  setStatus('offline', 'enter a bird code to connect');
  switchView('main');
}

// Message Rendering in Main Log
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
  updateHistoryItemStatus(id, newStatus);
}

// ============================================================================
// Feature 1: Status & SMS Notifications (/#/<code>/status)
// ============================================================================
function showSmsAlert(text, type = 'info') {
  smsFeedbackAlert.textContent = text;
  smsFeedbackAlert.className = `sms-alert sms-alert-${type}`;
  smsFeedbackAlert.classList.remove('hidden');
}

function hideSmsAlert() {
  smsFeedbackAlert.textContent = '';
  smsFeedbackAlert.classList.add('hidden');
}

async function loadStatusView() {
  if (!currentRoomId) return;
  updateStatusViewPill(isBirdOnline);
  hideSmsAlert();

  try {
    const res = await fetch(`${SERVER_URL}/api/rooms/${currentRoomId}/status`);
    if (res.ok) {
      const data = await res.json();
      updateStatusViewPill(data.online);
      if (data.smsSubscribed && data.maskedPhone) {
        smsActiveContainer.classList.remove('hidden');
        smsActiveNumber.textContent = data.maskedPhone;
        smsForm.classList.add('hidden');
      } else {
        smsActiveContainer.classList.add('hidden');
        smsForm.classList.remove('hidden');
      }
    }
  } catch (err) {
    console.warn('[Deskbird Web] Failed to fetch room status:', err.message);
  }
}

async function handleSaveSms(e) {
  e.preventDefault();
  if (!currentRoomId) return;
  const phone = smsPhoneInput.value.trim();
  if (!phone) return;

  showSmsAlert('Saving notification number...', 'info');

  try {
    const res = await fetch(`${SERVER_URL}/api/rooms/${currentRoomId}/sms-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      showSmsAlert('Phone number saved! You will receive an SMS when this bird is online.', 'success');
      smsActiveContainer.classList.remove('hidden');
      smsActiveNumber.textContent = data.maskedPhone || phone;
      smsForm.classList.add('hidden');
      smsPhoneInput.value = '';
    } else {
      showSmsAlert(data.error || 'Failed to save phone number.', 'error');
    }
  } catch (err) {
    showSmsAlert(`Network error: ${err.message}`, 'error');
  }
}

async function handleRemoveSms() {
  if (!currentRoomId) return;
  showSmsAlert('Removing notification alerts...', 'info');

  try {
    const res = await fetch(`${SERVER_URL}/api/rooms/${currentRoomId}/sms-subscription`, {
      method: 'DELETE'
    });
    if (res.ok) {
      showSmsAlert('SMS alerts turned off for this room.', 'info');
      smsActiveContainer.classList.add('hidden');
      smsForm.classList.remove('hidden');
    } else {
      showSmsAlert('Failed to remove phone number.', 'error');
    }
  } catch (err) {
    showSmsAlert(`Network error: ${err.message}`, 'error');
  }
}

async function handleTestSms() {
  if (!currentRoomId) return;
  showSmsAlert('Sending test SMS...', 'info');

  try {
    const res = await fetch(`${SERVER_URL}/api/rooms/${currentRoomId}/sms-test`, {
      method: 'POST'
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      let note = '';
      if (data.simulated) {
        note = ' (Simulated in server logs)';
      } else if (data.trialMode) {
        note = ' (Delivered via Twilio trial template)';
      }
      showSmsAlert(`Test SMS sent successfully!${note}`, 'success');
    } else {
      showSmsAlert(data.error || 'Failed to send test SMS.', 'error');
    }
  } catch (err) {
    showSmsAlert(`Network error: ${err.message}`, 'error');
  }
}

// ============================================================================
// Feature 2: Message History (/#/<code>/history)
// ============================================================================
async function loadHistoryView() {
  if (!currentRoomId) return;
  historyViewLog.innerHTML = '<div class="empty-log-hint">Loading archived messages...</div>';

  try {
    const res = await fetch(`${SERVER_URL}/api/rooms/${currentRoomId}/history`);
    if (res.ok) {
      const data = await res.json();
      renderHistoryList(data.history || []);
    } else {
      historyViewLog.innerHTML = '<div class="empty-log-hint">Failed to load history.</div>';
    }
  } catch (err) {
    historyViewLog.innerHTML = `<div class="empty-log-hint">Error: ${err.message}</div>`;
  }
}

function renderHistoryList(historyItems) {
  if (!historyItems || historyItems.length === 0) {
    historyViewLog.innerHTML = '<div class="empty-log-hint">No message history found for this room.</div>';
    return;
  }

  const sorted = [...historyItems].sort((a, b) => b.ts - a.ts);
  historyViewLog.innerHTML = '';

  for (const msg of sorted) {
    const item = document.createElement('div');
    item.className = 'message-item';
    item.id = `hist-item-${msg.id}`;

    const header = document.createElement('div');
    header.className = 'message-item-header';

    const senderSpan = document.createElement('span');
    senderSpan.className = 'message-sender-name';
    senderSpan.textContent = msg.from ? `From ${msg.from}` : 'Anonymous';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'history-timestamp';
    try {
      timeSpan.textContent = new Date(msg.ts).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      timeSpan.textContent = '';
    }

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
    }
    statusBadge.textContent = `${statusLabel}${tick}`;

    header.appendChild(senderSpan);
    header.appendChild(timeSpan);
    header.appendChild(statusBadge);

    const body = document.createElement('div');
    body.className = 'message-text';
    body.textContent = msg.text;

    item.appendChild(header);
    item.appendChild(body);
    historyViewLog.appendChild(item);
  }
}

function updateHistoryItemStatus(id, newStatus) {
  const item = document.getElementById(`hist-item-${id}`);
  if (!item) return;
  const badge = item.querySelector('.message-status-badge');
  if (badge) {
    badge.className = `message-status-badge badge-${newStatus}`;
    let statusLabel = newStatus;
    let tick = '';
    if (newStatus === MESSAGE_STATUS.DELIVERED) {
      tick = ' ✓';
      statusLabel = 'delivered';
    } else if (newStatus === MESSAGE_STATUS.SEEN) {
      tick = ' ✓✓';
      statusLabel = 'seen by bird';
    } else if (newStatus === MESSAGE_STATUS.QUEUED) {
      statusLabel = 'queued';
    }
    badge.textContent = `${statusLabel}${tick}`;
  }
}

// ============================================================================
// Backend Wakeup & Socket Management
// ============================================================================
async function wakeBackend() {
  setStatus('waking', 'waking the server (may take ~30s)...');
  try {
    const res = await fetch(`${SERVER_URL}/healthz`, { mode: 'cors' });
    if (res.ok) {
      setStatus('waking', 'server awake, connecting...');
    }
  } catch (err) {
    console.warn('Initial server ping error:', err.message);
  }
}

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

  socket.on('disconnect', () => {
    setStatus('offline', 'disconnected - reconnecting...');
  });

  socket.on('connect_error', () => {
    setStatus('offline', 'connection error');
  });
}

// Send Message Flow
function handleSendMessage() {
  if (!currentRoomId) {
    showError('Please connect to a bird room first.');
    return;
  }

  const text = messageTextInput.value.trim();
  const from = senderNameInput.value.trim() || undefined;

  if (!text) {
    showError('Message cannot be empty.');
    return;
  }

  if (isRateLimited) {
    showError('Please wait before sending another message.');
    return;
  }

  if (from) {
    safeSetItem('deskbird_sender_name', from);
  }

  clearError();

  const tempId = `temp_${Date.now()}`;
  const messageData = {
    id: tempId,
    text,
    from,
    status: 'sending',
    ts: Date.now()
  };

  messages.set(tempId, messageData);
  renderMessageLog();

  sendButton.disabled = true;
  messageTextInput.value = '';
  charCounter.textContent = '0 / 120';
  charCounter.classList.remove('counter-warning');

  socket.emit(EVENTS.MESSAGE_SEND, { text, from }, (res) => {
    sendButton.disabled = false;

    if (res && res.ok) {
      messages.delete(tempId);
      messages.set(res.id, {
        id: res.id,
        text,
        from,
        status: res.status,
        ts: Date.now()
      });
      renderMessageLog();

      // Trigger 2-second rate limit cooldown
      startRateLimitCooldown(2000);
    } else {
      messages.delete(tempId);
      renderMessageLog();

      if (res && res.code === ERROR_CODES.RATE_LIMITED) {
        const retryMs = res.retryAfterMs || 2000;
        showError(`Slow down! You can send another message in a moment.`);
        startRateLimitCooldown(retryMs);
      } else if (res && res.code === ERROR_CODES.QUEUE_FULL) {
        showError('The bird is offline and its queue is full. Try again soon!');
      } else {
        showError(res ? `Error: ${res.code}` : 'Failed to send message.');
      }
    }
  });
}

function startRateLimitCooldown(durationMs) {
  isRateLimited = true;
  sendButton.disabled = true;
  sendButton.classList.add('btn-disabled');

  clearTimeout(rateLimitTimer);
  rateLimitTimer = setTimeout(() => {
    isRateLimited = false;
    sendButton.disabled = false;
    sendButton.classList.remove('btn-disabled');
  }, durationMs);
}

// Event Listeners
function initEventListeners() {
  changeRoomBtn.addEventListener('click', promptForRoom);

  roomInputForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = roomCodeInput.value.trim();
    if (code) {
      setRoom(code);
    }
  });

  messageTextInput.addEventListener('input', () => {
    const len = messageTextInput.value.length;
    charCounter.textContent = `${len} / 120`;
    if (len >= 110) {
      charCounter.classList.add('counter-warning');
    } else {
      charCounter.classList.remove('counter-warning');
    }
  });

  messageTextInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSendMessage();
  });

  // Feature 1 Listeners (Status & SMS)
  smsForm.addEventListener('submit', handleSaveSms);
  smsRemoveBtn.addEventListener('click', handleRemoveSms);
  smsTestBtn.addEventListener('click', handleTestSms);

  // Feature 2 Listeners (History)
  historyRefreshBtn.addEventListener('click', loadHistoryView);

  // URL Hash Navigation
  window.addEventListener('hashchange', handleRoute);
}

// Initial Bootstrap
async function init() {
  initEventListeners();

  const savedName = safeGetItem('deskbird_sender_name');
  if (savedName) {
    senderNameInput.value = savedName;
  }

  wakeBackend();
  handleRoute();
}

init();
