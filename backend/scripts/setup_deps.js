const { spawnSync } = require('child_process');
const { mkdirSync } = require('fs');
const { resolve } = require('path');

function run(command, args, cwd) {
  const localCache = resolve(cwd, '.npm-cache');
  mkdirSync(localCache, { recursive: true });

  const env = { ...process.env };
  delete env.NPM_CONFIG_OFFLINE;
  delete env.npm_config_offline;
  delete env.HTTP_PROXY;
  delete env.HTTPS_PROXY;
  delete env.ALL_PROXY;
  delete env.http_proxy;
  delete env.https_proxy;
  delete env.all_proxy;
  delete env.npm_config_proxy;
  delete env.npm_config_https_proxy;
  delete env.GIT_HTTP_PROXY;
  delete env.GIT_HTTPS_PROXY;

  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...env,
      NPM_CONFIG_OFFLINE: 'false',
      npm_config_offline: 'false',
      npm_config_prefer_online: 'true',
      npm_config_proxy: '',
      npm_config_https_proxy: '',
      npm_config_cache: localCache,
      npm_config_fetch_retries: '5',
      npm_config_fetch_retry_factor: '2',
      npm_config_fetch_retry_mintimeout: '10000',
      npm_config_fetch_retry_maxtimeout: '120000'
    }
  });

  return result.status || 0;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function runWithRetries(command, args, cwd, attempts) {
  for (let i = 1; i <= attempts; i += 1) {
    console.log(`[setup:deps] npm install attempt ${i}/${attempts}`);
    const code = run(command, args, cwd);
    if (code === 0) {
      return;
    }
    if (i < attempts) {
      const delay = i * 5000;
      console.log(`[setup:deps] install failed, retrying in ${delay / 1000}s...`);
      await sleep(delay);
    } else {
      process.exit(code);
    }
  }
}

async function main() {
  await runWithRetries(
    'npm',
    ['install', '--prefer-online', '--no-audit', '--no-fund', '--loglevel=warn'],
    process.cwd(),
    3
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
