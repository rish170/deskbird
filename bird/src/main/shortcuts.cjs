const path = require('path');
const fs = require('fs');
const { shell, app } = require('electron');

function getIconPath() {
  const ico = path.join(__dirname, 'assets', 'icon.ico');
  if (fs.existsSync(ico)) return ico;
  return path.join(__dirname, 'assets', 'tray-32.png');
}

function getAppTarget() {
  if (app.isPackaged) {
    return {
      target: process.execPath,
      args: '',
      cwd: path.dirname(process.execPath)
    };
  }
  return {
    target: process.execPath,
    args: `"${app.getAppPath()}"`,
    cwd: app.getAppPath()
  };
}

/**
 * Always creates or updates the Windows Start Menu shortcut.
 * This guarantees that typing 'Deskbird' in the Windows Start search will always find it.
 */
function createStartMenuShortcut() {
  if (process.platform !== 'win32') return null;
  try {
    const startMenuDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    fs.mkdirSync(startMenuDir, { recursive: true });
    const shortcutPath = path.join(startMenuDir, 'Deskbird.lnk');
    const iconPath = getIconPath();
    const { target, args, cwd } = getAppTarget();
    const op = fs.existsSync(shortcutPath) ? 'replace' : 'create';

    const ok = shell.writeShortcutLink(shortcutPath, op, {
      target,
      args,
      cwd,
      icon: iconPath,
      iconIndex: 0,
      description: 'Deskbird - Desktop Pixel Bird Companion',
      appUserModelId: 'com.deskbird.app'
    });
    console.log(`[Shortcuts] Start Menu shortcut written (${ok}): ${shortcutPath}`);
    return ok ? shortcutPath : null;
  } catch (err) {
    console.warn('[Shortcuts] Could not write Start Menu shortcut:', err.message);
    return null;
  }
}

/**
 * Creates or updates the Desktop shortcut.
 */
function createDesktopShortcut() {
  if (process.platform !== 'win32') return null;
  try {
    const desktopDir = app.getPath('desktop');
    const shortcutPath = path.join(desktopDir, 'Deskbird.lnk');
    const iconPath = getIconPath();
    const { target, args, cwd } = getAppTarget();
    const op = fs.existsSync(shortcutPath) ? 'replace' : 'create';

    const ok = shell.writeShortcutLink(shortcutPath, op, {
      target,
      args,
      cwd,
      icon: iconPath,
      iconIndex: 0,
      description: 'Deskbird - Desktop Pixel Bird Companion',
      appUserModelId: 'com.deskbird.app'
    });
    console.log(`[Shortcuts] Desktop shortcut written (${ok}): ${shortcutPath}`);
    return ok ? shortcutPath : null;
  } catch (err) {
    console.warn('[Shortcuts] Could not write Desktop shortcut:', err.message);
    return null;
  }
}

/**
 * Creates shortcut in Windows Quick Launch / TaskBar pinned directory if available.
 */
function createQuickLaunchShortcut() {
  if (process.platform !== 'win32') return null;
  try {
    const taskbarDir = path.join(
      app.getPath('appData'),
      'Microsoft',
      'Internet Explorer',
      'Quick Launch',
      'User Pinned',
      'TaskBar'
    );
    if (!fs.existsSync(taskbarDir)) {
      fs.mkdirSync(taskbarDir, { recursive: true });
    }
    const shortcutPath = path.join(taskbarDir, 'Deskbird.lnk');
    const iconPath = getIconPath();
    const { target, args, cwd } = getAppTarget();
    const op = fs.existsSync(shortcutPath) ? 'replace' : 'create';

    const ok = shell.writeShortcutLink(shortcutPath, op, {
      target,
      args,
      cwd,
      icon: iconPath,
      iconIndex: 0,
      description: 'Deskbird - Desktop Pixel Bird Companion',
      appUserModelId: 'com.deskbird.app'
    });
    console.log(`[Shortcuts] Taskbar shortcut written (${ok}): ${shortcutPath}`);
    return ok ? shortcutPath : null;
  } catch (err) {
    console.warn('[Shortcuts] Could not write Taskbar shortcut:', err.message);
    return null;
  }
}

module.exports = {
  createStartMenuShortcut,
  createDesktopShortcut,
  createQuickLaunchShortcut,
  getIconPath
};
