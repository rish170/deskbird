import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { FRAMES, PALETTE, COLOR_MAP, META, perchBar } from './bird.sprites.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function hexToRgba(hex) {
  if (!hex) return { r: 0, g: 0, b: 0, a: 0 };
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return { r, g, b, a: 255 };
}

function setPixel(png, x, y, rgba) {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = rgba.r;
  png.data[idx + 1] = rgba.g;
  png.data[idx + 2] = rgba.b;
  png.data[idx + 3] = rgba.a;
}

function renderGrid(png, grid, offsetX = 0, offsetY = 0, scale = 1) {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      const char = row[c];
      const hex = COLOR_MAP[char];
      if (hex) {
        const rgba = hexToRgba(hex);
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            setPixel(png, offsetX + c * scale + sx, offsetY + r * scale + sy, rgba);
          }
        }
      }
    }
  }
}

function savePng(png, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const buffer = PNG.sync.write(png);
  fs.writeFileSync(targetPath, buffer);
  console.log(`Saved: ${path.relative(ROOT_DIR, targetPath)} (${png.width}x${png.height})`);
}

// 1. Export Flying Spritesheet (6 frames: flyUp, flyMid, flyDown, flyUpTalk, flyMidTalk, flyDownTalk)
export function exportFlyingSpritesheet() {
  const flyFrames = ['flyUp', 'flyMid', 'flyDown', 'flyUpTalk', 'flyMidTalk', 'flyDownTalk'];
  const frameW = META.side.width; // 32
  const frameH = META.side.height; // 32
  const totalW = frameW * flyFrames.length; // 192

  const png = new PNG({ width: totalW, height: frameH });
  flyFrames.forEach((name, i) => {
    renderGrid(png, FRAMES[name], i * frameW, 0, 1);
  });

  savePng(png, path.join(ROOT_DIR, 'bird', 'src', 'renderer', 'assets', 'bird-fly.png'));
}

// 2. Export Perched Spritesheet (3 frames: perchIdle, perchBlink, perchTalk)
export function exportPerchedSpritesheet() {
  const perchFrames = ['perchIdle', 'perchBlink', 'perchTalk'];
  const frameW = META.perched.width; // 36
  const frameH = META.perched.height; // 43
  const totalW = frameW * perchFrames.length; // 108

  const png = new PNG({ width: totalW, height: frameH });
  perchFrames.forEach((name, i) => {
    renderGrid(png, FRAMES[name], i * frameW, 0, 1);
  });

  savePng(png, path.join(ROOT_DIR, 'bird', 'src', 'renderer', 'assets', 'bird-perched.png'));
}

// 3. Export Perch Tail Layer (36x43)
export function exportPerchTail() {
  const png = new PNG({ width: META.perched.width, height: META.perched.height });
  renderGrid(png, FRAMES.perchTail, 0, 0, 1);
  savePng(png, path.join(ROOT_DIR, 'bird', 'src', 'renderer', 'assets', 'bird-perch-tail.png'));
}

// 4. Export Perch Bar (56 x 6 art pixels) with grass tufts
export function exportPerchBar() {
  const barGrid = perchBar(56);
  // Add 2 rows on top for the grass tufts as shown in Panel 1
  const height = 8;
  const width = 56;
  const png = new PNG({ width, height });

  // Render grass tufts:
  // Left tuft at x=6..8:
  // Row 0: . G .
  // Row 1: G L G
  const grassLeft = [
    [6, 1, PALETTE.G], [7, 0, PALETTE.G], [7, 1, PALETTE.L], [8, 1, PALETTE.G]
  ];
  // Right tuft at x=47..49:
  const grassRight = [
    [47, 1, PALETTE.G], [48, 0, PALETTE.G], [48, 1, PALETTE.L], [49, 1, PALETTE.G]
  ];
  for (const [gx, gy, col] of [...grassLeft, ...grassRight]) {
    setPixel(png, gx, gy, hexToRgba(col));
  }

  // Render the bar starting at row 2
  for (let r = 0; r < barGrid.length; r++) {
    const row = barGrid[r];
    for (let c = 0; c < row.length; c++) {
      const hex = COLOR_MAP[row[c]];
      if (hex) {
        setPixel(png, c, r + 2, hexToRgba(hex));
      }
    }
  }

  savePng(png, path.join(ROOT_DIR, 'bird', 'src', 'renderer', 'assets', 'perch.png'));
}

// 5. Export Tray Icons and Web Icons
export function exportIcons() {
  // Composite front-facing perched bird at 1x
  const compW = 36;
  const compH = 43;
  const compPng = new PNG({ width: compW, height: compH });
  // Tail behind
  renderGrid(compPng, FRAMES.perchTail, 0, 0, 1);
  // Body on top
  renderGrid(compPng, FRAMES.perchIdle, 0, 0, 1);

  // Web Header (96x96 or 108x129)
  const webPng = new PNG({ width: 108, height: 129 });
  renderGrid(webPng, FRAMES.perchTail, 0, 0, 3);
  renderGrid(webPng, FRAMES.perchIdle, 0, 0, 3);
  savePng(webPng, path.join(ROOT_DIR, 'web', 'public', 'bird.png'));

  // Favicon (32x32 from flyUp cropped)
  const favicon = new PNG({ width: 32, height: 32 });
  renderGrid(favicon, FRAMES.flyMid, 0, 0, 1);
  savePng(favicon, path.join(ROOT_DIR, 'web', 'public', 'favicon.png'));

  // Tray 16x16 (scaled down from 32x32 flyMid)
  const tray16 = new PNG({ width: 16, height: 16 });
  const mid = FRAMES.flyMid;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      // Pick representative pixel from 2x2 block
      const c = mid[y * 2][x * 2] !== '.' ? mid[y * 2][x * 2] : mid[y * 2 + 1][x * 2 + 1];
      if (c && COLOR_MAP[c]) {
        setPixel(tray16, x, y, hexToRgba(COLOR_MAP[c]));
      }
    }
  }
  savePng(tray16, path.join(ROOT_DIR, 'bird', 'src', 'main', 'assets', 'tray-16.png'));

  // Tray 32x32 (direct flyMid)
  const tray32 = new PNG({ width: 32, height: 32 });
  renderGrid(tray32, FRAMES.flyMid, 0, 0, 1);
  savePng(tray32, path.join(ROOT_DIR, 'bird', 'src', 'main', 'assets', 'tray-32.png'));
}

export function exportAll() {
  console.log('--- Exporting Deskbird Art Assets ---');
  exportFlyingSpritesheet();
  exportPerchedSpritesheet();
  exportPerchTail();
  exportPerchBar();
  exportIcons();
  console.log('--- Art Assets Successfully Exported ---');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  exportAll();
}
