#!/usr/bin/env node
/*
 * Boot smoke test.
 *
 * A passing `vite build` does not prove the app runs — a bad import, a
 * top-level throw, or a broken bundle all build fine and then white-screen
 * in the browser. This test builds (if needed), serves dist/, loads it in a
 * real Chromium, and fails if:
 *   - any uncaught exception fires while the app boots (pageerror), or
 *   - the app shell (#login-screen) never renders.
 *
 * Network calls to Supabase are expected to fail in CI; those console errors
 * are reported but do not fail the test.
 */
const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PORT = 4183;
const URL = `http://localhost:${PORT}/`;
const viteCli = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => { res.resume(); resolve(); });
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error('preview server did not start'));
        else setTimeout(tick, 300);
      });
    };
    tick();
  });
}

(async () => {
  // Build if there is no dist yet.
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    console.log('· building (no dist found)…');
    if (fs.existsSync(viteCli)) {
      execSync(`"${process.execPath}" "${viteCli}" build`, { cwd: ROOT, stdio: 'inherit' });
    } else {
      execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
    }
  }

  console.log('· starting preview server…');
  const previewCmd = fs.existsSync(viteCli) ? process.execPath : 'npx';
  const previewArgs = fs.existsSync(viteCli)
    ? [viteCli, 'preview', '--port', String(PORT), '--strictPort']
    : ['vite', 'preview', '--port', String(PORT), '--strictPort'];
  const server = spawn(previewCmd, previewArgs, {
    cwd: ROOT, stdio: 'ignore',
  });

  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch { console.error('FAIL  playwright is not installed'); server.kill(); process.exit(1); }

  let browser;
  const cleanup = async () => {
    if (browser) await browser.close().catch(() => {});
    server.kill();
  };

  try {
    await waitForServer(URL, 30000);

    // Use a pre-installed Chromium if present (dev container); otherwise let
    // Playwright resolve its own downloaded browser (CI after `playwright install`).
    const execCandidates = [process.env.PLAYWRIGHT_EXECUTABLE_PATH, '/opt/pw-browsers/chromium'];
    const executablePath = execCandidates.find((p) => p && fs.existsSync(p));
    browser = await chromium.launch(executablePath ? { executablePath } : {});
    const page = await browser.newPage();

    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // App shell must render.
    let shellOk = true;
    try {
      await page.waitForSelector('#login-screen', { state: 'attached', timeout: 15000 });
    } catch {
      shellOk = false;
    }

    if (consoleErrors.length) {
      console.log(`· note: ${consoleErrors.length} console error(s) (network/Supabase expected offline)`);
    }

    let ok = true;
    if (pageErrors.length) {
      console.error('FAIL  uncaught exception(s) during boot:');
      pageErrors.forEach((e) => console.error('        ' + e));
      ok = false;
    }
    if (!shellOk) {
      console.error('FAIL  app shell (#login-screen) did not render');
      ok = false;
    }

    await cleanup();
    if (!ok) process.exit(1);
    console.log('PASS  app boots, shell renders, no uncaught errors');
  } catch (err) {
    console.error('FAIL  ' + (err && err.message || err));
    await cleanup();
    process.exit(1);
  }
})();
