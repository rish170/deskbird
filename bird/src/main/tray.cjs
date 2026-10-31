const path = require('path');
const { Tray, Menu, clipboard, nativeImage, app } = require('electron');
const { formatRoomId } = require('./protocol.cjs');

class TrayManager {
  constructor(options = {}) {
    this.config = options.config;
    this.windowManager = options.windowManager;
    this.onTogglePerch = options.onTogglePerch || (() => {});
    this.onToggleSound = options.onToggleSound || (() => {});
    this.onTogglePause = options.onTogglePause || (() => {});
    this.onShowSetup = options.onShowSetup || (() => {});
    this.onCreateDesktopShortcut = options.onCreateDesktopShortcut || (() => {});
    this.tray = null;
    this.connectionStatus = 'connecting';
  }

  init() {
    const icon16 = path.join(__dirname, 'assets', 'tray-16.png');
    const icon32 = path.join(__dirname, 'assets', 'tray-32.png');

    let image;
    try {
      image = nativeImage.createFromPath(icon32);
      image.setTemplateImage(false);
    } catch {
      image = nativeImage.createFromPath(icon16);
    }

    this.tray = new Tray(image);
    this.updateTooltip();
    this.updateMenu();
  }

  setConnectionStatus(status) {
    this.connectionStatus = status;
    this.updateTooltip();
    this.updateMenu();
  }

  updateTooltip() {
    if (!this.tray) return;
    const roomId = this.config.get('roomId');
    const code = roomId ? formatRoomId(roomId) : '....';
    this.tray.setToolTip(`Deskbird [${code}] - ${this.connectionStatus}`);
  }

  updateMenu() {
    if (!this.tray) return;

    const roomId = this.config.get('roomId');
    const formattedCode = roomId ? formatRoomId(roomId) : 'Unknown';
    const isPerched = Boolean(this.config.get('isPerched'));
    const soundEnabled = Boolean(this.config.get('soundEnabled'));
    const isPaused = Boolean(this.windowManager.isPaused);
    const startOnLogin = Boolean(this.config.get('startOnLogin'));
    const birdScale = Number(this.config.get('birdScale')) || 2;

    const webBaseUrl = this.config.webUrl;
    const messageLink = `${webBaseUrl}/#/${roomId}`;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `Deskbird (${formattedCode})`,
        enabled: false
      },
      {
        label: `Status: ${this.connectionStatus}`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Copy Message Link',
        click: () => {
          clipboard.writeText(messageLink);
          console.log(`[Deskbird Tray] Copied message link to clipboard: ${messageLink}`);
        }
      },
      {
        label: 'Show My Code',
        click: () => {
          this.windowManager.showAnnouncement(`Hi! Tell your friend this code: ${formattedCode}`);
        }
      },
      {
        label: 'Create Desktop Shortcut',
        click: () => {
          this.onCreateDesktopShortcut();
        }
      },
      {
        label: 'Shortcut Setup...',
        click: () => {
          this.onShowSetup();
        }
      },
      { type: 'separator' },
      {
        label: isPerched ? 'Release Bird (Follow Mouse)' : 'Perch Bird (Rest on Branch)',
        click: () => {
          this.onTogglePerch(!isPerched);
        }
      },
      {
        label: 'Bird Size',
        submenu: [
          {
            label: 'Small (2x - 64px) [Default]',
            type: 'radio',
            checked: birdScale === 2,
            click: () => {
              this.config.set('birdScale', 2);
              this.windowManager.broadcast('bird:setting-updated', { key: 'birdScale', value: 2 });
              this.updateMenu();
            }
          },
          {
            label: 'Medium (3x - 96px)',
            type: 'radio',
            checked: birdScale === 3,
            click: () => {
              this.config.set('birdScale', 3);
              this.windowManager.broadcast('bird:setting-updated', { key: 'birdScale', value: 3 });
              this.updateMenu();
            }
          },
          {
            label: 'Large (4x - 128px)',
            type: 'radio',
            checked: birdScale === 4,
            click: () => {
              this.config.set('birdScale', 4);
              this.windowManager.broadcast('bird:setting-updated', { key: 'birdScale', value: 4 });
              this.updateMenu();
            }
          }
        ]
      },
      {
        label: soundEnabled ? 'Mute Sounds' : 'Enable Sounds (Typewriter Blips)',
        type: 'checkbox',
        checked: soundEnabled,
        click: () => {
          this.onToggleSound(!soundEnabled);
        }
      },
      {
        label: 'Start with System',
        type: 'checkbox',
        checked: startOnLogin,
        click: () => {
          const nextVal = !startOnLogin;
          this.config.set('startOnLogin', nextVal);
          app.setLoginItemSettings({
            openAtLogin: nextVal,
            path: process.execPath
          });
          this.updateMenu();
        }
      },
      {
        label: isPaused ? 'Resume Deskbird' : 'Pause (Hide Overlay)',
        click: () => {
          this.onTogglePause(!isPaused);
        }
      },
      { type: 'separator' },
      {
        label: 'Quit Deskbird',
        click: () => {
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

module.exports = {
  TrayManager
};

