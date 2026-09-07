import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);

test('Vite is reachable on loopback and not on a LAN interface', async t => {
  const port = await freePort();
  const root = resolve(import.meta.dirname, '..');
  const vitePackagePath = require.resolve('vite/package.json');
  const vitePackage = require(vitePackagePath) as { bin: { vite: string } };
  const viteBin = join(dirname(vitePackagePath), vitePackage.bin.vite);
  const child = spawn(process.execPath, [viteBin, '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
    env: {
      ...process.env,
      OPENXIANGDA_WEB_PORT: String(port),
      OPENXIANGDA_DEV_PROXY: 'http://127.0.0.1:7001',
    },
  });
  try {
    await waitFor(`http://127.0.0.1:${port}`);
    const lan = Object.values(networkInterfaces())
      .flat()
      .find(address => address?.family === 'IPv4' && !address.internal)?.address;
    if (!lan) {
      t.diagnostic('No non-loopback IPv4 interface; loopback reachability verified.');
      return;
    }
    await assert.rejects(
      fetch(`http://${lan}:${port}`, {
        signal: AbortSignal.timeout(500),
      })
    );
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
  }
});

async function freePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(error => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitFor(url: string) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`VITE_READINESS_TIMEOUT:${url}`);
}
