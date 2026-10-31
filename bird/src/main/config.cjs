const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const {
  deriveRoomId,
  LOCAL_TEST_SECRET,
  LOCAL_TEST_ROOM_ID
} = require('./protocol.cjs');

// ============================================================================
// Production Deployment URLs
// TODO: Replace with your deployed Render server URL before release
const DEFAULT_SERVER_URL = 'https://deskbird-server.onrender.com';
// TODO: Replace with your deployed Vercel web app URL before release
const DEFAULT_WEB_URL = 'https://deskbird.vercel.app';
// ============================================================================

const DEFAULT_SETTINGS = {
  birdScale: 2, // integer scale 2 (64 DIP flying, 72x86 DIP perched: cute, compact, unobtrusive)
  followOffsetX: 50, // DIP
  followOffsetY: -4, // DIP
  perchOffsetX: 0, // DIP from right edge of primary display
  perchOffsetY: 100, // DIP from top edge (well below screen boundary, head never clipped!)
  soundEnabled: false,
  isPerched: true, // App starts with bird perched on the branch
  startOnLogin: false,
  heartbeatIntervalMs: 240000 // 4 minutes
};

class ConfigManager {
  constructor(cliFlags = {}) {
    this.cliFlags = cliFlags;
    this.isFresh = Boolean(cliFlags.fresh);
    this.isLocal = Boolean(cliFlags.local);
    this.isDemo = Boolean(cliFlags.demo);
    this.isDebug = Boolean(cliFlags.debug);

    this.serverUrl =
      cliFlags.server ||
      process.env.DESKBIRD_SERVER ||
      (this.isLocal ? 'http://localhost:3001' : DEFAULT_SERVER_URL);

    this.webUrl = this.isLocal ? 'http://localhost:5173' : DEFAULT_WEB_URL;

    this.settingsPath = path.join(app.getPath('userData'), 'deskbird-settings.json');
    this.settings = this.loadSettings();
  }

  loadSettings() {
    if (this.isFresh) {
      // In fresh mode, ignore existing disk settings
      return this.initNewSettings();
    }

    let loaded = null;
    try {
      if (fs.existsSync(this.settingsPath)) {
        const raw = fs.readFileSync(this.settingsPath, 'utf8');
        loaded = JSON.parse(raw);
      }
    } catch (err) {
      console.warn('[Config] Failed to read settings, generating fresh:', err.message);
    }

    const settings = {
      ...DEFAULT_SETTINGS,
      ...(loaded || this.initNewSettings())
    };

    // If --scale or --perch-y CLI flag was passed, prioritize it
    if (this.cliFlags.scale) {
      settings.birdScale = parseInt(this.cliFlags.scale, 10);
    } else if (this.isLocal || this.isDemo || !loaded || loaded.birdScale > 2) {
      // Apply compact 2x default for local/demo runs or migrate older larger settings
      settings.birdScale = DEFAULT_SETTINGS.birdScale;
    }

    if (this.cliFlags.perchY) {
      settings.perchOffsetY = parseInt(this.cliFlags.perchY, 10);
    } else if (this.isLocal || this.isDemo || !loaded || !settings.perchOffsetY) {
      settings.perchOffsetY = DEFAULT_SETTINGS.perchOffsetY;
    }

    // When running in local mode, ALWAYS bind to the fixed local test room
    if (this.isLocal) {
      settings.secret = LOCAL_TEST_SECRET;
      settings.roomId = LOCAL_TEST_ROOM_ID;
    } else if (!settings.secret || settings.secret === LOCAL_TEST_SECRET) {
      // Transitioning from local test mode to production: generate real persistent secret
      settings.secret = crypto.randomBytes(32).toString('hex');
      settings.roomId = deriveRoomId(settings.secret, 'production');
      this.saveSettings(settings);
    }

    // Bird always starts perched on application launch
    settings.isPerched = true;

    return settings;
  }

  initNewSettings() {
    let secret;
    let roomId;

    if (this.isLocal && !this.isFresh) {
      secret = LOCAL_TEST_SECRET;
      roomId = LOCAL_TEST_ROOM_ID;
    } else {
      // Generate 32 bytes random hex
      secret = crypto.randomBytes(32).toString('hex');
      roomId = deriveRoomId(secret);
    }

    const initial = {
      ...DEFAULT_SETTINGS,
      secret,
      roomId,
      firstRun: true
    };

    if (!this.isFresh) {
      this.saveSettings(initial);
    }

    return initial;
  }

  saveSettings(newSettings = this.settings) {
    this.settings = { ...this.settings, ...newSettings };
    if (this.isFresh) {
      return; // Do not persist in fresh test mode
    }

    try {
      fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true });
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf8');
    } catch (err) {
      console.error('[Config] Failed to save settings to disk:', err.message);
    }
  }

  get(key) {
    return this.settings[key];
  }

  set(key, value) {
    this.settings[key] = value;
    this.saveSettings();
  }
}

module.exports = {
  DEFAULT_SERVER_URL,
  DEFAULT_WEB_URL,
  DEFAULT_SETTINGS,
  ConfigManager
};
