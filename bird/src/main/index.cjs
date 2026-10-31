const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { ConfigManager } = require('./config.cjs');
const { WindowManager } = require('./window-manager.cjs');
const { TrayManager } = require('./tray.cjs');
const { BirdSocketClient } = require('./socket.cjs');
const { formatRoomId } = require('./protocol.cjs');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(1);
  const flags = {
    local: args.includes('--local'),
    fresh: args.includes('--fresh'),
    debug: args.includes('--debug') || args.includes('--debug-mode'),
    devtools: args.includes('--devtools'),
    debugHitboxes: args.includes('--debug-hitboxes'),
    demo: args.includes('--demo'),
    scale: null,
    perchY: null,
    server: null
  };

  const scaleIdx = args.indexOf('--scale');
  if (scaleIdx !== -1 && args[scaleIdx + 1]) {
    flags.scale = parseInt(args[scaleIdx + 1], 10);
  }

  const perchYIdx = args.indexOf('--perch-y');
  if (perchYIdx !== -1 && args[perchYIdx + 1]) {
    flags.perchY = parseInt(args[perchYIdx + 1], 10);
  }

  const serverIdx = args.indexOf('--server');
  if (serverIdx !== -1 && args[serverIdx + 1]) {
    flags.server = args[serverIdx + 1];
  }

  return flags;
}

// Global crash handlers with log rotation
function setupLogging() {
  const logDir = path.join(app.getPath('userData'), 'logs');
  const logFile = path.join(logDir, 'deskbird.log');

  try {
    fs.mkdirSync(logDir, { recursive: true });
    // Rotate log if exceeds 1MB
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 1024 * 1024) {
      const oldLog = path.join(logDir, 'deskbird.old.log');
      if (fs.existsSync(oldLog)) fs.unlinkSync(oldLog);
      fs.renameSync(logFile, oldLog);
    }
  } catch {}

  const logToFile = (type, err) => {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] [${type}] ${err?.stack || err}\n`;
    try {
      fs.appendFileSync(logFile, entry);
    } catch {}
    console.error(`[Deskbird Error] ${entry}`);
  };

  process.on('uncaughtException', (err) => logToFile('UNCAUGHT_EXCEPTION', err));
  process.on('unhandledRejection', (reason) => logToFile('UNHANDLED_REJECTION', reason));
}

// Single instance enforcement
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[Deskbird] Another instance is already running. Exiting.');
  app.quit();
} else {
  let configManager;
  let windowManager;
  let trayManager;
  let socketClient;

  const cliFlags = parseArgs();

  app.on('second-instance', () => {
    console.log('[Deskbird] Second instance detected. Restoring bird to follow mode.');
    if (windowManager) {
      windowManager.setPaused(false);
      windowManager.togglePerch(false);
      configManager.set('isPerched', false);
      if (trayManager) trayManager.updateMenu();
    }
  });

  app.whenReady().then(() => {
    setupLogging();

    console.log('[Deskbird] App ready. Initializing with flags:', cliFlags);

    configManager = new ConfigManager(cliFlags);

    windowManager = new WindowManager({
      config: configManager,
      isDebug: cliFlags.debug,
      devtools: cliFlags.devtools,
      onSeenMessage: (msgId) => {
        if (socketClient) {
          socketClient.sendSeenReceipt(msgId);
        }
      },
      onSettingsChange: (key, _value) => {
        if (key === 'isPerched' && trayManager) {
          trayManager.updateMenu();
        }
      }
    });

    trayManager = new TrayManager({
      config: configManager,
      windowManager,
      onTogglePerch: (isPerched) => {
        configManager.set('isPerched', isPerched);
        windowManager.togglePerch(isPerched);
        trayManager.updateMenu();
      },
      onToggleSound: (enabled) => {
        configManager.set('soundEnabled', enabled);
        windowManager.broadcast('bird:setting-updated', { key: 'soundEnabled', value: enabled });
        trayManager.updateMenu();
      },
      onTogglePause: (paused) => {
        windowManager.setPaused(paused);
        trayManager.updateMenu();
      }
    });

    trayManager.init();
    windowManager.createWindows();

    // If demo mode, don't start the real socket client
    if (cliFlags.demo) {
      trayManager.setConnectionStatus('demo mode (offline)');
    } else {
      socketClient = new BirdSocketClient({
        serverUrl: configManager.serverUrl,
        secret: configManager.get('secret'),
        heartbeatIntervalMs: configManager.get('heartbeatIntervalMs'),
        onMessage: (msg) => {
          windowManager.deliverMessage(msg);
        },
        onRoomConfirmed: (confirmedRoomId) => {
          configManager.set('roomId', confirmedRoomId);
          if (trayManager) {
            trayManager.updateTooltip();
            trayManager.updateMenu();
          }
        },
        onStateChange: (state) => {
          trayManager.setConnectionStatus(state);
        }
      });

      socketClient.connect();
    }

    // First run greeting announcement
    const roomId = configManager.get('roomId');
    const formattedCode = formatRoomId(roomId);
    if (configManager.get('firstRun')) {
      setTimeout(() => {
        windowManager.showAnnouncement(
          `Hi! Tell your friend this code: ${formattedCode}`,
          20000 // 20 seconds duration
        );
        configManager.set('firstRun', false);
      }, 1500);
    }
  });

  app.on('window-all-closed', () => {
    // Keep running in tray (menu bar)
  });

  app.on('before-quit', () => {
    if (socketClient) {
      socketClient.disconnect();
    }
    if (windowManager) {
      windowManager.destroyWindows();
    }
    if (trayManager) {
      trayManager.destroy();
    }
  });
}
