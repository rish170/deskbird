import {
  calculateFollowTarget,
  updateExponentialSmoothing,
  calculateFacing,
  calculateFlightArc,
  isPointInRect
} from './physics.js';
import { BirdStateMachine, BIRD_STATES } from './state-machine.js';
import {
  wrapBubbleText,
  calculateDisplayTime,
  LIMITS
} from './protocol-helpers.js';

// DOM Elements
const perchContainer = document.getElementById('perch-container');
const perchTail = document.getElementById('perch-tail');
const birdContainer = document.getElementById('bird-container');
const birdSprite = document.getElementById('bird-sprite');
const speechBubble = document.getElementById('speech-bubble');
const bubbleSender = document.getElementById('bubble-sender');
const bubbleText = document.getElementById('bubble-text');
const bubbleQueueBadge = document.getElementById('bubble-queue-badge');
const queueCountEl = document.getElementById('queue-count');
const debugOverlay = document.getElementById('debug-overlay');

// Application Configuration and State
let isPrimary = false;
let displayWidth = window.innerWidth;
let displayHeight = window.innerHeight;
let settings = {};
let isDemo = false;
let birdScale = 2;

// Sprite dimensions based on scale
let flyW = 32 * birdScale;
let flyH = 32 * birdScale;
let perchBirdW = 36 * birdScale;
let perchBirdH = 43 * birdScale;
let perchW = 56 * birdScale;
let perchH = 8 * birdScale;

// Perch placement (primary display only)
// top: 160px ensures the bird head has 100px+ clearance below the top of the monitor
let perchRect = {
  x: displayWidth - 24 - perchW,
  y: 160,
  width: perchW,
  height: perchH
};

// Perched bird placement:
// Bird width 36 on 56 bar -> offset = (56 - 36)/2 = 10 art pixels.
// Feet at row 32, wood bar top at row 2 -> offset = -(32 - 2) = -30 art pixels.
let perchBirdPos = {
  x: perchRect.x + 10 * birdScale,
  y: perchRect.y - 30 * birdScale
};

// Physics state
let birdX = perchBirdPos.x;
let birdY = perchBirdPos.y;
let birdVelX = 0;
let birdVelY = 0;
let currentFacing = 'right';
let followState = { currentOffsetX: 50 };
let cursorActive = false;
let lastCursor = { x: 300, y: 300 };
let hasReceivedFirstCursor = false;

// Flight arc state
let flightStart = { x: 0, y: 0 };
let flightEnd = { x: 0, y: 0 };
let flightProgress = 0;
const flightDuration = 0.8; // seconds

function recalculateDimensions() {
  flyW = 32 * birdScale;
  flyH = 32 * birdScale;
  perchBirdW = 36 * birdScale;
  perchBirdH = 43 * birdScale;
  perchW = 56 * birdScale;
  perchH = 8 * birdScale;

  const perchY = settings.perchOffsetY !== undefined ? settings.perchOffsetY : 160;
  const perchOffsetX = settings.perchOffsetX || 24;

  perchRect = {
    x: displayWidth - perchOffsetX - perchW,
    y: perchY,
    width: perchW,
    height: perchH
  };

  perchBirdPos = {
    x: perchRect.x + 10 * birdScale,
    y: perchRect.y - 30 * birdScale
  };

  perchContainer.style.top = `${perchY}px`;
  perchContainer.style.right = `${perchOffsetX}px`;
}

// State Machine
let stateMachine = new BirdStateMachine(BIRD_STATES.PERCHED_IDLE);

// Messages & Queue
const messageQueue = []; // Array<{ id, text, from, duration }>
let currentMessage = null;
let typewriterTimer = null;
let dismissTimer = null;
let isTypewriting = false;
let displayedCharCount = 0;
let targetFullText = '';

// Hit testing & interactivity
let lastInteractive = false;
let hitBoxes = [];

// Audio synthesizer for retro character blip
let audioCtx = null;
function playCharBlip() {
  if (!settings.soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(580 + Math.random() * 50, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.03, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.035);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.04);
  } catch {}
}

// ----------------------------------------------------------------------------
// Speech Bubble Logic
// ----------------------------------------------------------------------------
function showNextMessage() {
  if (currentMessage || messageQueue.length === 0) return;

  const isPerched = stateMachine.state === BIRD_STATES.PERCHED_IDLE;
  if (!isPrimary && isPerched) {
    // Secondary displays never show speech bubbles when perched
    messageQueue.length = 0;
    return;
  }

  currentMessage = messageQueue.shift();
  updateQueueBadge();

  if (window.deskbirdApi && currentMessage.id) {
    if (isPrimary || cursorActive) {
      window.deskbirdApi.notifySeen(currentMessage.id);
    }
  }

  // Set sender header
  if (currentMessage.from) {
    bubbleSender.textContent = `from ${currentMessage.from}`;
    bubbleSender.classList.remove('hidden');
  } else {
    bubbleSender.classList.add('hidden');
  }

  // Wrap text
  const lines = wrapBubbleText(currentMessage.text, LIMITS.LINE_WRAP_CHARS);
  targetFullText = lines.join('\n');
  bubbleText.textContent = '';

  // Only show speech bubble if the bird is actually visible on this display
  if (isPrimary || cursorActive) {
    speechBubble.classList.remove('hidden');
  } else {
    speechBubble.classList.add('hidden');
  }

  displayedCharCount = 0;
  isTypewriting = true;

  clearInterval(typewriterTimer);
  clearTimeout(dismissTimer);

  const msPerChar = 1000 / LIMITS.TYPEWRITER_CHARS_PER_SEC; // ~25ms
  typewriterTimer = setInterval(() => {
    if (displayedCharCount < targetFullText.length) {
      const nextChar = targetFullText[displayedCharCount];
      bubbleText.textContent += nextChar;
      displayedCharCount++;
      if (nextChar !== ' ' && nextChar !== '\n') {
        playCharBlip();
      }
    } else {
      clearInterval(typewriterTimer);
      isTypewriting = false;

      // Auto dismiss after duration
      const duration = currentMessage.duration || calculateDisplayTime(currentMessage.text);
      dismissTimer = setTimeout(dismissCurrentMessage, duration);
    }
  }, msPerChar);

  updateBubblePosition();
}

function dismissCurrentMessage() {
  clearInterval(typewriterTimer);
  clearTimeout(dismissTimer);
  isTypewriting = false;
  currentMessage = null;
  speechBubble.classList.add('hidden');
  speechBubble.classList.remove('tail-right');
  speechBubble.classList.remove('tail-flip');

  updateQueueBadge();

  if (messageQueue.length > 0) {
    setTimeout(showNextMessage, 300);
  }
}

function updateQueueBadge() {
  const count = messageQueue.length;
  if (count > 0) {
    queueCountEl.textContent = `+${count}`;
    bubbleQueueBadge.classList.remove('hidden');
  } else {
    bubbleQueueBadge.classList.add('hidden');
  }
}

function enqueueMessage(msg, customDuration) {
  messageQueue.push({
    id: msg.id,
    text: msg.text,
    from: msg.from,
    duration: customDuration
  });
  updateQueueBadge();
  if (!currentMessage) {
    showNextMessage();
  }
}

function updateBubblePosition() {
  if (!currentMessage || speechBubble.classList.contains('hidden')) return;

  const bubbleW = speechBubble.offsetWidth || 180;
  const bubbleH = speechBubble.offsetHeight || 70;
  const isPerched = stateMachine.state === BIRD_STATES.PERCHED_IDLE;

  if (isPerched) {
    // When perched at top-right of screen, bubble MUST appear to the LEFT of the bird:
    let bubbleX = birdX - bubbleW - 14;
    let bubbleY = birdY + 4;

    // Clamping to screen boundaries
    if (bubbleX < 12) bubbleX = 12;
    if (bubbleY < 12) bubbleY = 12;
    else if (bubbleY + bubbleH > displayHeight - 12) bubbleY = displayHeight - bubbleH - 12;

    speechBubble.classList.remove('tail-flip');
    speechBubble.classList.add('tail-right');
    speechBubble.style.transform = `translate3d(${Math.round(bubbleX)}px, ${Math.round(bubbleY)}px, 0)`;
    return;
  }

  // Follow mode: tail points down toward the flying bird
  speechBubble.classList.remove('tail-right');
  const currentBirdW = flyW;

  // Position relative to bird
  let bubbleX = birdX + (currentFacing === 'right' ? (currentBirdW - 10) : -bubbleW + 10);
  let bubbleY = birdY - bubbleH - 10;

  // Screen clamping
  if (bubbleX < 12) {
    bubbleX = 12;
    speechBubble.classList.remove('tail-flip');
  } else if (bubbleX + bubbleW > displayWidth - 12) {
    bubbleX = displayWidth - bubbleW - 12;
    speechBubble.classList.add('tail-flip');
  } else {
    if (currentFacing === 'left') {
      speechBubble.classList.add('tail-flip');
    } else {
      speechBubble.classList.remove('tail-flip');
    }
  }

  if (bubbleY < 12) {
    // If would overflow top, show below bird
    bubbleY = birdY + flyH + 10;
  }

  speechBubble.style.transform = `translate3d(${Math.round(bubbleX)}px, ${Math.round(bubbleY)}px, 0)`;
}

// ----------------------------------------------------------------------------
// Multi-Monitor Perched State Management
// ----------------------------------------------------------------------------
function applyPerchedMode(isPerched) {
  if (isPerched) {
    stateMachine.transitionTo(BIRD_STATES.PERCHED_IDLE);
    if (isPrimary) {
      // Primary display: show the perched bird sitting on the perch
      birdContainer.style.display = 'block';
      birdContainer.classList.add('mode-perched');
      birdContainer.classList.remove('mode-flying');
      birdContainer.classList.add('perched-clickable');
      perchTail.classList.remove('hidden');
      birdX = perchBirdPos.x;
      birdY = perchBirdPos.y;
      currentFacing = 'right';
    } else {
      // Secondary display: NEVER show bird when perched!
      birdContainer.style.display = 'none';
      birdContainer.classList.remove('mode-flying');
      birdContainer.classList.add('mode-perched');
      birdContainer.classList.remove('perched-clickable');
      perchTail.classList.add('hidden');
    }
  } else {
    // Release from perch back to following
    birdContainer.classList.remove('mode-perched');
    birdContainer.classList.remove('perched-clickable');
    birdContainer.classList.add('mode-flying');
    perchTail.classList.add('hidden');
    if (stateMachine.state === BIRD_STATES.PERCHED_IDLE) {
      stateMachine.transitionTo(BIRD_STATES.FOLLOWING);
    }
    if (!cursorActive) {
      birdContainer.style.display = 'none';
    }
  }
}

function startFlyingToPerch() {
  if (stateMachine.state === BIRD_STATES.PERCHED_IDLE || stateMachine.state === BIRD_STATES.FLYING_TO_PERCH) return;

  if (!isPrimary) {
    // Perch is on primary display; notify main process
    if (window.deskbirdApi) {
      window.deskbirdApi.updateSetting('isPerched', true);
    }
    return;
  }

  birdContainer.style.display = 'block';
  flightStart = { x: birdX, y: birdY };
  flightEnd = { ...perchBirdPos };
  flightProgress = 0;
  stateMachine.transitionTo(BIRD_STATES.FLYING_TO_PERCH);

  birdContainer.classList.remove('perched-clickable');
  if (window.deskbirdApi) {
    window.deskbirdApi.updateSetting('isPerched', true);
  }
}

function startTakeoff() {
  if (stateMachine.state !== BIRD_STATES.PERCHED_IDLE) return;

  stateMachine.transitionTo(BIRD_STATES.TAKEOFF);
  birdContainer.classList.remove('perched-clickable');

  if (window.deskbirdApi) {
    window.deskbirdApi.updateSetting('isPerched', false);
  }
}

// ----------------------------------------------------------------------------
// Click & Hit Region Handlers
// ----------------------------------------------------------------------------
function setupHitListeners() {
  // Click perch bar -> fly to perch
  perchContainer.addEventListener('click', () => {
    if (stateMachine.state === BIRD_STATES.FOLLOWING) {
      startFlyingToPerch();
    }
  });

  // Click perched bird -> takeoff
  birdContainer.addEventListener('click', () => {
    if (stateMachine.state === BIRD_STATES.PERCHED_IDLE) {
      startTakeoff();
    }
  });

  // Click bubble -> dismiss immediately
  speechBubble.addEventListener('click', () => {
    dismissCurrentMessage();
  });
}

function checkHitRegions(cursor) {
  hitBoxes = [];

  // 1. Perch bar (primary display only, and when bird is not perched)
  if (isPrimary && stateMachine.state === BIRD_STATES.FOLLOWING) {
    hitBoxes.push({
      rect: perchRect,
      type: 'perch'
    });
  }

  // 2. Perched bird (when sitting on perch on primary display)
  const isPerched = isPrimary && stateMachine.state === BIRD_STATES.PERCHED_IDLE;
  if (isPerched) {
    hitBoxes.push({
      rect: { x: birdX, y: birdY, width: perchBirdW, height: perchBirdH },
      type: 'perched_bird'
    });
  }

  // 3. Speech bubble (when visible)
  if (currentMessage && !speechBubble.classList.contains('hidden')) {
    const bRect = speechBubble.getBoundingClientRect();
    hitBoxes.push({
      rect: { x: bRect.left, y: bRect.top, width: bRect.width, height: bRect.height },
      type: 'bubble'
    });
  }

  // Evaluate if cursor point falls into any active region
  const isInteractive = hitBoxes.some((box) => isPointInRect(cursor, box.rect, 4));

  if (isInteractive !== lastInteractive) {
    lastInteractive = isInteractive;
    if (window.deskbirdApi) {
      window.deskbirdApi.setInteractive(isInteractive);
    }
  }

  // No red debug outlines rendered to keep the desktop visual clean
  debugOverlay.innerHTML = '';
}

// ----------------------------------------------------------------------------
// Animation Frame Loop
// ----------------------------------------------------------------------------
let lastTimestamp = performance.now();

function animationTick(now) {
  requestAnimationFrame(animationTick);

  const dt = Math.min(0.1, (now - lastTimestamp) / 1000);
  lastTimestamp = now;

  const currentState = stateMachine.state;

  if (currentState === BIRD_STATES.FOLLOWING) {
    birdContainer.classList.add('mode-flying');
    birdContainer.classList.remove('mode-perched');
    birdContainer.classList.remove('perched-clickable');
    perchTail.classList.add('hidden');

    if (cursorActive) {
      birdContainer.style.display = 'block';
      const followRes = calculateFollowTarget(
        lastCursor,
        displayWidth,
        displayHeight,
        followState,
        {
          followOffsetX: settings.followOffsetX || 50,
          followOffsetY: settings.followOffsetY || -4,
          birdWidth: flyW,
          time: now / 1000,
          dt
        }
      );
      followState.currentOffsetX = followRes.currentOffsetX;

      // Exponential smoothing towards target
      const smoothX = updateExponentialSmoothing(birdX, followRes.targetX, dt, 7, 900);
      const smoothY = updateExponentialSmoothing(birdY, followRes.targetY, dt, 7, 900);

      birdVelX = smoothX.velocity;
      birdVelY = smoothY.velocity;
      birdX = smoothX.position;
      birdY = smoothY.position;

      currentFacing = calculateFacing(currentFacing, birdVelX, 15);
    } else {
      birdContainer.style.display = 'none';
    }
  } else if (currentState === BIRD_STATES.FLYING_TO_PERCH) {
    if (isPrimary) {
      birdContainer.style.display = 'block';
      birdContainer.classList.add('mode-flying');
      birdContainer.classList.remove('mode-perched');
      birdContainer.classList.remove('perched-clickable');
      perchTail.classList.add('hidden');

      flightProgress += dt / flightDuration;
      if (flightProgress >= 1) {
        flightProgress = 1;
        birdX = flightEnd.x;
        birdY = flightEnd.y;
        stateMachine.transitionTo(BIRD_STATES.LANDING);
      } else {
        const arcPos = calculateFlightArc(flightStart, flightEnd, flightProgress);
        birdVelX = (arcPos.x - birdX) / dt;
        birdX = arcPos.x;
        birdY = arcPos.y;
        currentFacing = 'right';
      }
    } else {
      birdContainer.style.display = 'none';
    }
  } else if (currentState === BIRD_STATES.LANDING) {
    if (isPrimary) {
      birdContainer.style.display = 'block';
      birdX = perchBirdPos.x;
      birdY = perchBirdPos.y;
      currentFacing = 'right';
    } else {
      birdContainer.style.display = 'none';
    }
  } else if (currentState === BIRD_STATES.PERCHED_IDLE) {
    if (isPrimary) {
      // Primary display: Perched bird is ALWAYS visible sitting on the branch
      birdContainer.style.display = 'block';
      birdContainer.classList.add('mode-perched');
      birdContainer.classList.remove('mode-flying');
      birdContainer.classList.add('perched-clickable');
      perchTail.classList.remove('hidden');

      birdX = perchBirdPos.x;
      birdY = perchBirdPos.y;
      currentFacing = 'right'; // Perched bird is front-facing
    } else {
      // Secondary display: NEVER show bird when perched!
      birdContainer.style.display = 'none';
      perchTail.classList.add('hidden');
    }
  } else if (currentState === BIRD_STATES.TAKEOFF) {
    birdContainer.classList.add('mode-flying');
    birdContainer.classList.remove('mode-perched');
    birdContainer.classList.remove('perched-clickable');
    perchTail.classList.add('hidden');

    // Small vertical hop
    birdY -= 60 * dt;
    currentFacing = 'right';
  }

  // Update animation frame from state machine
  const currentSpeed = Math.hypot(birdVelX, birdVelY);
  const frameClass = stateMachine.update(dt, isTypewriting, currentSpeed);

  // Apply CSS sprite frame and facing classes
  const isPerched = currentState === BIRD_STATES.PERCHED_IDLE;
  const isFacingLeft = !isPerched && currentFacing === 'left';
  birdSprite.className = `bird-sprite frame-${frameClass} ${isFacingLeft ? 'facing-left' : ''}`;
  birdContainer.style.transform = `translate3d(${Math.round(birdX)}px, ${Math.round(birdY)}px, 0)`;

  // Update speech bubble position if open
  updateBubblePosition();

  // Test hit regions with cursor
  if (cursorActive) {
    checkHitRegions(lastCursor);
  }
}

// ----------------------------------------------------------------------------
// Demo Mode Sequencer
// ----------------------------------------------------------------------------
function startDemoSequencer() {
  const demoMessages = [
    { text: 'Chirp! I am your little desktop bird friend.', from: 'Deskbird' },
    { text: 'Click my perch up top to let me rest on the branch!', from: 'Deskbird' },
    { text: 'I love following you around while you work!', from: 'Deskbird' },
    { text: 'Click my speech bubbles anytime to dismiss them.', from: 'Deskbird' }
  ];

  let msgIndex = 0;
  setInterval(() => {
    if (messageQueue.length < 2) {
      const msg = demoMessages[msgIndex % demoMessages.length];
      enqueueMessage({ id: `demo_${Date.now()}`, text: msg.text, from: msg.from });
      msgIndex++;
    }
  }, 9000);

  // Auto perch and takeoff cycles
  setInterval(() => {
    if (stateMachine.state === BIRD_STATES.FOLLOWING) {
      startFlyingToPerch();
    } else if (stateMachine.state === BIRD_STATES.PERCHED_IDLE) {
      startTakeoff();
    }
  }, 16000);
}

// ----------------------------------------------------------------------------
// IPC Listeners from Electron Preload
// ----------------------------------------------------------------------------
if (window.deskbirdApi) {
  window.deskbirdApi.onInit((data) => {
    isPrimary = Boolean(data.isPrimary);
    displayWidth = data.bounds ? data.bounds.width : window.innerWidth;
    displayHeight = data.bounds ? data.bounds.height : window.innerHeight;
    settings = data.settings || {};
    birdScale = settings.birdScale || 2;
    isDemo = Boolean(data.isDemo);

    document.documentElement.style.setProperty('--bird-scale', birdScale);
    recalculateDimensions();

    if (isPrimary) {
      perchContainer.classList.remove('hidden');
    } else {
      perchContainer.classList.add('hidden');
    }

    // Apply perched state on init
    const isPerchedInitial = Boolean(data.isPerched || settings.isPerched);
    if (isPerchedInitial) {
      applyPerchedMode(true);
    } else if (!isPrimary) {
      birdContainer.style.display = 'none';
    }

    if (isDemo) {
      startDemoSequencer();
    }
  });

  window.deskbirdApi.onCursor((data) => {
    const isPerchedState = stateMachine.state === BIRD_STATES.PERCHED_IDLE || Boolean(data.isPerched);

    if (isPerchedState) {
      if (isPrimary) {
        // Primary display: always keep bird visible on perch!
        birdContainer.style.display = 'block';
        cursorActive = Boolean(data.active);
        if (data.active) {
          lastCursor = { x: data.x, y: data.y };
        }
        if (currentMessage) {
          speechBubble.classList.remove('hidden');
          updateBubblePosition();
        }
      } else {
        // Secondary display: NEVER show bird or bubble when perched!
        cursorActive = false;
        birdContainer.style.display = 'none';
        speechBubble.classList.add('hidden');
      }
      return;
    }

    // Follow mode
    if (data.active) {
      cursorActive = true;
      lastCursor = { x: data.x, y: data.y };

      // Snap to cursor vicinity immediately on initial frame
      if (!hasReceivedFirstCursor && stateMachine.state === BIRD_STATES.FOLLOWING) {
        birdX = data.x + (settings.followOffsetX || 50);
        birdY = data.y + (settings.followOffsetY || -4);
        hasReceivedFirstCursor = true;
      }

      birdContainer.style.display = 'block';
      if (currentMessage) {
        speechBubble.classList.remove('hidden');
        updateBubblePosition();
      }
    } else {
      cursorActive = false;
      birdContainer.style.display = 'none';
      speechBubble.classList.add('hidden');
    }
  });

  window.deskbirdApi.onPerchStateChanged((data) => {
    const perched = Boolean(data && data.isPerched);
    applyPerchedMode(perched);
  });

  window.deskbirdApi.onTogglePerch((data) => {
    const perched = Boolean(data && data.isPerched);
    if (perched) {
      startFlyingToPerch();
    } else {
      startTakeoff();
    }
  });

  window.deskbirdApi.onMessage((msg) => {
    if (!isPrimary && stateMachine.state === BIRD_STATES.PERCHED_IDLE) {
      return;
    }
    enqueueMessage(msg);
  });

  window.deskbirdApi.onAnnouncement((data) => {
    if (data && data.text) {
      if (!isPrimary && stateMachine.state === BIRD_STATES.PERCHED_IDLE) {
        return;
      }
      enqueueMessage({ id: `ann_${Date.now()}`, text: data.text, from: 'Deskbird' }, 20000);
    }
  });

  window.deskbirdApi.onSettingUpdated((data) => {
    if (data && data.key) {
      settings[data.key] = data.value;
      if (data.key === 'birdScale') {
        birdScale = data.value;
        document.documentElement.style.setProperty('--bird-scale', birdScale);
        recalculateDimensions();
      }
    }
  });
}

// Initialize
setupHitListeners();
requestAnimationFrame(animationTick);
