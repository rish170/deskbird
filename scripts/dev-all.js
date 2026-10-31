import concurrently from 'concurrently';

console.log('\n' + '='.repeat(80));
console.log('                    DESKBIRD LOCAL DEVELOPMENT ENVIRONMENT');
console.log('  Server: http://localhost:3001');
console.log('  Web:    http://localhost:5173/#/LCLTEST2');
console.log('  Bird:   Running in --local --debug mode (connected to LCLTEST2)');
console.log('');
console.log('  👉 Open http://localhost:5173/#/LCLTEST2 in your browser and type a note!');
console.log('  Press Ctrl+C to terminate all services cleanly.');
console.log('='.repeat(80) + '\n');

const { result } = concurrently(
  [
    {
      command: 'npm run start -w server',
      name: 'server',
      prefixColor: 'cyan'
    },
    {
      command: 'npm run dev -w web',
      name: 'web',
      prefixColor: 'magenta'
    },
    {
      command: 'npm run dev -w bird',
      name: 'bird',
      prefixColor: 'green'
    }
  ],
  {
    prefix: '[{name}]',
    killOthers: ['failure', 'success'],
    restartTries: 0
  }
);

result.catch(() => {
  // Graceful exit
  process.exit(0);
});

