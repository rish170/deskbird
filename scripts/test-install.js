import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const BIRD_DIR = path.join(ROOT_DIR, 'bird');
const TEMP_DIR = path.join(ROOT_DIR, 'test-install-temp');

console.log('\n' + '='.repeat(70));
console.log('       DESKBIRD FRESH USER INSTALL SIMULATION');
console.log('='.repeat(70));

try {
  // 1. Run npm pack in bird/
  console.log('\n[1/4] Packing bird package into a tarball...');
  const packOutput = execSync('npm pack', { cwd: BIRD_DIR, encoding: 'utf8' }).trim();
  const tarballName = packOutput.split('\n').pop().trim();
  const tarballPath = path.join(BIRD_DIR, tarballName);
  console.log(`✓ Created tarball: ${tarballName}`);

  // 2. Setup clean temporary directory
  console.log('\n[2/4] Setting up clean temporary sandbox directory...');
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  const tempPkgJson = {
    name: 'deskbird-install-test',
    version: '1.0.0',
    private: true
  };
  fs.writeFileSync(path.join(TEMP_DIR, 'package.json'), JSON.stringify(tempPkgJson, null, 2));

  // 3. Install the packed tarball
  console.log('\n[3/4] Installing tarball in clean sandbox (like a fresh user)...');
  execSync(`npm install "${tarballPath}"`, { cwd: TEMP_DIR, stdio: 'inherit' });
  console.log('✓ Successfully installed deskbird tarball!');

  // 4. Launch with --fresh flag
  console.log('\n[4/4] Launching Deskbird in --fresh test mode...');
  console.log('Spawning deskbird with isolated temporary settings...');

  const binPath = path.join(TEMP_DIR, 'node_modules', '.bin', process.platform === 'win32' ? 'deskbird.cmd' : 'deskbird');

  const child = spawn(binPath, ['--fresh'], {
    cwd: TEMP_DIR,
    stdio: 'inherit',
    shell: true
  });

  child.on('exit', (code) => {
    console.log(`\nDeskbird process exited with code ${code}`);
    console.log(`Clean sandbox is located at: ${TEMP_DIR}`);
  });
} catch (err) {
  console.error('\n❌ Test install failed:', err.message);
  process.exit(1);
}

