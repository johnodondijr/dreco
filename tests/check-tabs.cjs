#!/usr/bin/env node
/*
 * Static consistency check for the DV5 navigation.
 *
 * The "Jobs tab silently missing" bug happened because a section was added
 * to the renderers/nav in one place but left out of the sidebar tab list in
 * another. This test parses src/dv5.ts and enforces the invariants that keep
 * the sidebar, tab list, titles and icons in sync — no browser required.
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'dv5.ts');
const src = fs.readFileSync(file, 'utf8');

const fail = (msg) => { console.error('FAIL  ' + msg); process.exitCode = 1; };
const parseList = (inner) =>
  [...inner.matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] || m[2]);
const setEq = (a, b) =>
  a.size === b.size && [...a].every((x) => b.has(x));

// 1) TABS array
const tabsMatch = src.match(/const\s+TABS\s*=\s*\[([^\]]*)\]/);
if (!tabsMatch) { fail('could not find the TABS array in dv5.ts'); dump(); }
const TABS = parseList(tabsMatch[1]);
const tabsSet = new Set(TABS);

// 2) Sidebar nav items — every [...].map(navItem) group
const navGroups = [...src.matchAll(/\[([^\]]*)\]\.map\(navItem\)/g)];
if (!navGroups.length) fail('could not find any [...].map(navItem) sidebar groups');
const sidebar = navGroups.flatMap((m) => parseList(m[1]));
const sidebarSet = new Set(sidebar);

// 3) TITLES / ICONS keys
const keysOf = (name) => {
  const m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*\\{([\\s\\S]*?)\\}'));
  if (!m) { fail('could not find ' + name); return new Set(); }
  return new Set([...m[1].matchAll(/(\w+)\s*:/g)].map((x) => x[1]));
};
const titleKeys = keysOf('TITLES');
const iconKeys = keysOf('ICONS');

// ── Assertions ────────────────────────────────────────────────────────────
if (!setEq(tabsSet, sidebarSet)) {
  const onlyTabs = [...tabsSet].filter((t) => !sidebarSet.has(t));
  const onlyNav = [...sidebarSet].filter((t) => !tabsSet.has(t));
  if (onlyTabs.length) fail('in TABS but missing from the sidebar nav: ' + onlyTabs.join(', '));
  if (onlyNav.length) fail('in the sidebar nav but missing from TABS: ' + onlyNav.join(', '));
}
for (const t of TABS) {
  if (!titleKeys.has(t)) fail('tab "' + t + '" has no entry in TITLES (nav label would be blank)');
  if (!iconKeys.has(t)) fail('tab "' + t + '" has no entry in ICONS (nav icon would be missing)');
}

function dump() {
  console.error('  TABS:', typeof TABS !== 'undefined' ? TABS : '(unparsed)');
}

if (process.exitCode) {
  console.error('\nNavigation consistency check failed. Keep TABS, the sidebar');
  console.error('nav groups, TITLES and ICONS in sync in src/dv5.ts.');
  process.exit(1);
}
console.log('PASS  nav consistent — ' + TABS.length + ' tabs: ' + TABS.join(', '));
