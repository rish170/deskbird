const path = require('path');
const { BrowserWindow, screen, ipcMain } = require('electron');

class WindowManager {
  constructor(options = {}) {
    this.config = options.config;
    this.isDebug = Boolean(options.isDebug);
    this.openDevtools = Boolean(options.devtools);
    this.isPaused = false;
    this.isPerched = Boolean(this.config.get('isPerched'));
    this.windows = new Map(); // displayId -> BrowserWindow
    this.cursorPollInterval = null;
    this.onSeenMessage = options.onSeenMessage || (() => {});
    this.onSettingsChange = options.onSettingsChange || (() => {});

    this.initIpc();
    this.initScreenEvents();
  }

  initIpc() {
    // 1. Interactive hit test changes from renderer
    ipcMain.on('overlay:interactive', (event, payload) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return;
      const interactive = Boolean(payload && payload.interactive);
      // If interactive is true, ignoreMouseEvents is false (allow clicks)
      win.setIgnoreMouseEvents(!interactive, { forward: true });
    });

    // 2. Message seen receipt from renderer
    ipcMain.on('bird:message-seen', (_event, payload) => {
      if (payload && payload.id) {
        this.onSeenMessage(payload.id);
      }
    });

    // 3. Settings updates from renderer (e.g. perch toggled)
    ipcMain.on('bird:update-setting', (_event, payload) => {
      if (payload && payload.key) {
        this.config.set(payload.key, payload.value);
        if (payload.key === 'isPerched') {
          this.isPerched = Boolean(payload.value);
          this.broadcast('bird:perch-state-changed', { isPerched: this.isPerched });
        }
        this.onSettingsChange(payload.key, payload.value);
      }
    });
  }

  initScreenEvents() {
    const handleDisplayChange = () => {
      console.log('[WindowManager] Displays changed. Rebuilding overlay windows...');
      this.rebuildWindows();
    };

    screen.on('display-added', handleDisplayChange);
    screen.on('display-removed', handleDisplayChange);
    screen.on('display-metrics-changed', handleDisplayChange);
  }

  rebuildWindows() {
    this.destroyWindows();
    this.createWindows();
  }

  createWindows() {
    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();

    displays.forEach((disp) => {
      const bounds = disp.bounds;

      // On Windows, trimming overlay height by 1px prevents fullscreen classification
      const height = process.platform === 'win32' ? bounds.height - 1 : bounds.height;

      const win = new BrowserWindow({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height,
        transparent: true,
        frame: false,
        resizable: false,
        movable: false,
        hasShadow: false,
        skipTaskbar: true,
        focusable: false,
        show: false,
        alwaysOnTop: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          preload: path.join(__dirname, '../preload/preload.cjs'),
          backgroundThrottling: false
        }
      });

      win.setAlwaysOnTop(true, 'screen-saver');
      try {
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      } catch {}

      // Default to click-through
      win.setIgnoreMouseEvents(true, { forward: true });

      // Forward renderer console messages to terminal for instant visibility
      win.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
        console.log(`[Deskbird Renderer] ${message} (${sourceId}:${line})`);
      });

      win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        console.error(`[Deskbird Window] Failed to load renderer: ${errorDescription} (${errorCode})`);
      });

      const sendInitData = () => {
        const isPrimary = disp.id === primaryDisplay.id;
        win.webContents.send('bird:init', {
          isPrimary,
          displayId: disp.id,
          bounds: disp.bounds,
          settings: this.config.settings,
          roomId: this.config.get('roomId'),
          isDebug: Boolean(this.config.cliFlags.debugHitboxes),
          isDemo: this.config.isDemo,
          firstRun: Boolean(this.config.get('firstRun')),
          isPerched: this.isPerched
        });

        if (this.openDevtools) {
          win.webContents.openDevTools({ mode: 'detach' });
        }
      };

      let showed = false;
      const showWindow = () => {
        if (showed) return;
        showed = true;
        if (!this.isPaused) {
          win.showInactive();
        }
        sendInitData();
      };

      win.once('ready-to-show', showWindow);
      win.webContents.once('did-finish-load', () => {
        // Fallback in case ready-to-show was delayed
        setTimeout(showWindow, 100);
      });

      win.loadFile(path.join(__dirname, '../renderer/index.html'));

      this.windows.set(disp.id, win);
    });

    this.startCursorPolling();
  }

  startCursorPolling() {
    if (this.cursorPollInterval) return;

    // Poll cursor position at ~60 Hz (16ms)
    this.cursorPollInterval = setInterval(() => {
      if (this.isPaused || this.windows.size === 0) return;

      const cursorPoint = screen.getCursorScreenPoint();
      const primaryDisplay = screen.getPrimaryDisplay();
      const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);

      this.windows.forEach((win, displayId) => {
        if (!win || win.isDestroyed()) return;
        const isPrimary = displayId === primaryDisplay.id;

        if (this.isPerched) {
          // When perched, bird sits ONLY on the primary display.
          // Secondary displays NEVER have an active or visible bird.
          if (isPrimary) {
            const relX = cursorPoint.x - primaryDisplay.bounds.x;
            const relY = cursorPoint.y - primaryDisplay.bounds.y;
            const cursorOnPrimary = displayId === activeDisplay.id;
            win.webContents.send('bird:cursor', {
              x: relX,
              y: relY,
              isPrimary: true,
              active: cursorOnPrimary,
              isPerched: true
            });
          } else {
            win.webContents.send('bird:cursor', {
              active: false,
              isPrimary: false,
              isPerched: true
            });
          }
        } else {
          // Normal follow mode:
          if (displayId === activeDisplay.id) {
            const relX = cursorPoint.x - activeDisplay.bounds.x;
            const relY = cursorPoint.y - activeDisplay.bounds.y;

            win.webContents.send('bird:cursor', {
              x: relX,
              y: relY,
              isPrimary,
              active: true,
              isPerched: false
            });
          } else {
            win.webContents.send('bird:cursor', {
              active: false,
              isPrimary,
              isPerched: false
            });
          }
        }
      });
    }, 16);
  }

  stopCursorPolling() {
    if (this.cursorPollInterval) {
      clearInterval(this.cursorPollInterval);
      this.cursorPollInterval = null;
    }
  }

  broadcast(channel, data) {
    this.windows.forEach((win) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    });
  }

  getActiveBirdWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    if (this.isPerched) {
      return this.windows.get(primaryDisplay.id);
    }
    try {
      const cursorPoint = screen.getCursorScreenPoint();
      const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
      return this.windows.get(activeDisplay.id) || this.windows.get(primaryDisplay.id);
    } catch {
      return this.windows.get(primaryDisplay.id);
    }
  }

  deliverMessage(message) {
    if (this.isPerched) {
      // When perched: deliver ONLY to primary display where perch & bird live!
      const primaryDisplay = screen.getPrimaryDisplay();
      const primaryWin = this.windows.get(primaryDisplay.id);
      if (primaryWin && !primaryWin.isDestroyed()) {
        primaryWin.webContents.send('bird:message', message);
      }
      return;
    }

    // Follow mode: broadcast to windows so the message can follow cursor seamlessly
    this.broadcast('bird:message', message);
  }

  showAnnouncement(text) {
    if (this.isPerched) {
      const primaryDisplay = screen.getPrimaryDisplay();
      const primaryWin = this.windows.get(primaryDisplay.id);
      if (primaryWin && !primaryWin.isDestroyed()) {
        primaryWin.webContents.send('bird:announcement', { text });
      }
      return;
    }

    this.broadcast('bird:announcement', { text });
  }

  togglePerch(isPerched) {
    this.isPerched = Boolean(isPerched);
    this.broadcast('bird:perch-state-changed', { isPerched: this.isPerched });
    this.broadcast('bird:toggle-perch', { isPerched: this.isPerched });
  }

  setPaused(paused) {
    this.isPaused = paused;
    this.windows.forEach((win) => {
      if (win && !win.isDestroyed()) {
        if (paused) {
          win.hide();
        } else {
          win.showInactive();
        }
      }
    });
  }

  destroyWindows() {
    this.stopCursorPolling();
    this.windows.forEach((win) => {
      if (win && !win.isDestroyed()) {
        win.destroy();
      }
    });
    this.windows.clear();
  }
}

module.exports = {
  WindowManager
};
