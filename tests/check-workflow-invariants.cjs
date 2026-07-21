#!/usr/bin/env node
/*
 * Static workflow guardrails for the highest-risk Dreco UX paths.
 * These checks are intentionally narrow: they catch regressions where a UI
 * looks available but is unreachable, or where finance/save flows drift back
 * to stale legacy fields.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(ROOT, 'src', 'main.ts'), 'utf8');
const dv5 = fs.readFileSync(path.join(ROOT, 'src', 'dv5.ts'), 'utf8');

let failed = false;
const fail = (msg) => {
  failed = true;
  console.error('FAIL  ' + msg);
};
const pass = (msg) => console.log('PASS  ' + msg);

const has = (src, pattern) => pattern.test(src);

if (!has(dv5, /const\s+TABS\s*=\s*\[[^\]]*'notifications'/)) {
  fail('Notifications must be a first-class DV5 tab.');
} else if (!has(dv5, /\['finance','payments','documents','jobs','reports','notifications','settings'\]\.map\(navItem\)/)) {
  fail('Notifications must appear in the sidebar nav group.');
} else {
  pass('notifications tab is reachable from the sidebar');
}

if (!has(main, /const saved = await saveProRecord\(rec, proWasEditing\);[\s\S]*?closeModal\('pro-modal'\)/)) {
  fail('Professional candidate save should await persistence before closing the modal.');
} else {
  pass('professional save awaits before closing');
}

if (!has(main, /const saved = await saveLBRecord\(rec, lbWasEditing\);[\s\S]*?closeModal\('lb-modal'\)/)) {
  fail('General Jobs candidate save should await persistence before closing the modal.');
} else {
  pass('general save awaits before closing');
}

if (!has(main, /await deleteProRecord\(id\);[\s\S]*?setProDB\(proDB\.filter/) ||
    !has(main, /await deleteLBRecord\(id\);[\s\S]*?setLbDB\(lbDB\.filter/)) {
  fail('Candidate delete should await artifact/cloud deletion before removing rows from the UI.');
} else {
  pass('candidate delete awaits persistence before removing rows');
}

if (!has(dv5, /function proInstallments/) ||
    !has(dv5, /const pays = proInstallments\(r\)/) ||
    !has(dv5, /proInstallments\(r\)\.forEach/)) {
  fail('Payments and finance views should use proInstallments instead of reading only legacy fields.');
} else {
  pass('payment views use the normalized installment helper');
}

if (!has(dv5, /confirm\(`Delete \$\{rows\.length\} selected candidate/)) {
  fail('Bulk delete must keep the explicit irreversible confirmation.');
} else {
  pass('bulk delete confirmation remains in place');
}

if (has(main, /username !== DEFAULT_ADMIN_USERNAME/) ||
    !has(main, /RETIRED_USERNAMES\.includes\(username\) \|\| isBlockedAdminAlias/)) {
  fail('Staff cleanup must not delete normal team users in the default workspace.');
} else {
  pass('staff cleanup preserves normal team users');
}

if (!has(dv5, /for \(const r of rows\) \{[\s\S]*?dbDelete[\s\S]*?\}[\s\S]*?setProDB\(proDB\.filter/) ||
    !has(dv5, /for \(const r of rows\) \{[\s\S]*?dbDelete[\s\S]*?\}[\s\S]*?setLbDB\(lbDB\.filter/)) {
  fail('Bulk delete should remove rows from the UI only after artifact/cloud deletion completes.');
} else {
  pass('bulk delete waits before removing rows');
}

if (failed) process.exit(1);
