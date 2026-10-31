import { execSync } from 'node:child_process';
import concurrently from 'concurrently';

console.log('--- Building Web Production Assets ---');
execSync('npm run build -w web', { stdio: 'inherit' });

console.log('\n' + '='.repeat(80));
console.log('            DESKBIRD PRODUCTION SIMULATION ENVIRONMENT');
console.log('  Server: http://localhost:3001 (NODE_ENV=production)');
console.log('  Web:    http://localhost:4173 (Vite production preview)');
console.log('');
console.log('  👉 Open http://localhost:4173 in your browser to test production behavior.');
console.log('  Press Ctrl+C to terminate all services cleanly.');
console.log('='.repeat(80) + '\n');

process.env.NODE_ENV = 'production';
process.env.PORT = '3001';
process.env.ALLOWED_ORIGINS = 'http://localhost:4173,http://localhost:5173';

const { result } = concurrently(
  [
    {
      command: 'node server/src/index.js',
      name: 'server-prod',
      prefixColor: 'cyan',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
        ALLOWED_ORIGINS: 'http://localhost:4173,http://localhost:5173'
      }
    },
    {
      command: 'npm run preview -w web -- --port 4173',
      name: 'web-prod',
      prefixColor: 'magenta'
    }
  ],
  {
    prefix: '[{name}]',
    killOthers: ['failure', 'success']
  }
);

result.catch(() => {
  process.exit(0);
});

