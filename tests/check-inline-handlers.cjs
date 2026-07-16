#!/usr/bin/env node
/*
 * Inline event-handler ratchet (supports the H6 / CSP hardening effort).
 *
 * Removing `script-src 'unsafe-inline'` from the CSP requires eliminating every
 * inline on*= handler first (nonces/hashes do NOT cover inline handlers). That
 * migration is large, so this gate makes it a one-way ratchet: the count may
 * shrink but must never grow. When you migrate handlers to delegated listeners,
 * lower BASELINE to the new count. When it reaches 0, the CSP can drop
 * 'unsafe-inline' from script-src.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = ['index.html', 'src/main.ts', 'src/dv5.ts'];
const HANDLER_RE = /\son(click|change|input|submit|keydown|keyup|keypress|mouseenter|mouseleave|mousemove|mouseover|mousedown|mouseup|focus|blur|load|error|scroll|wheel|touchstart|touchend|paste|dragover|drop)\s*=/gi;

// Current baseline. Lower this (never raise it) as handlers are migrated.
const BASELINE = 252;

let total = 0;
const perFile = {};
for (const rel of FILES) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) continue;
  const n = (fs.readFileSync(p, 'utf8').match(HANDLER_RE) || []).length;
  perFile[rel] = n;
  total += n;
}

console.log('Inline event handlers:', total, '(baseline', BASELINE + ')');
for (const [f, n] of Object.entries(perFile)) console.log('  ' + f + ': ' + n);

if (total > BASELINE) {
  console.error(`\nFAIL  inline handler count increased (${total} > ${BASELINE}).`);
  console.error('Use a delegated listener (data-action) instead of a new on*= attribute,');
  console.error('or if this is intended, justify it and raise BASELINE deliberately.');
  process.exit(1);
}
if (total < BASELINE) {
  console.log(`\nNote: count dropped below baseline (${total} < ${BASELINE}). Lower BASELINE to ${total} to lock in the progress.`);
}
console.log('PASS  inline handler count did not grow.');
