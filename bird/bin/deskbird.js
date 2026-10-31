#!/usr/bin/env node

/**
 * Deskbird CLI Launcher
 * Spawns Electron detached with stdio ignored so the user terminal is released immediately.
 */

const { spawn } = require('child_process');
const path = require('path');

try {
  const electron = require('electron');
  const appRoot = path.resolve(__dirname, '..');
  const userArgs = process.argv.slice(2);
  const spawnArgs = [appRoot, ...userArgs];

  const child = spawn(electron, spawnArgs, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  });

  child.unref();

  console.log('Deskbird is starting... look for the bird!');
  process.exit(0);
} catch (err) {
  console.error('Failed to launch Deskbird:', err.message);
  console.error('Please make sure Electron is properly installed or check docs/TROUBLESHOOTING.md');
  process.exit(1);
}

