const { spawn } = require('child_process');

const port = process.env.PORT || '3000';
const host = process.env.HOSTNAME || 'localhost';

console.log('');
console.log(`[frontend] Open this in your browser: http://${host}:${port}`);
console.log('[frontend] Starting Next.js dev server...');
console.log('');

const child = spawn('npx', ['next', 'dev', '--port', port], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

child.on('error', (error) => {
  console.error(`[frontend] Failed to start dev server: ${error.message}`);
  process.exit(1);
});
