// @ts-nocheck
import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import '@fontsource-variable/geist';
import { createClient } from '@supabase/supabase-js';
import { PRO_SEED, LB_SEED } from './data';
import {
  currentUser, proDB, lbDB, allDocs, allTimelines, allChecklists, employers, jobOrders,
  proStages, lbStages, generalWorkflows,
  setCurrentUser, setProDB, setLbDB, setAllDocs, setAllTimelines,
  setAllChecklists, setEmployers, setJobOrders,
  setProStages, setLbStages, setGeneralWorkflows,
} from './state';
import { injectDepsToD5 } from './dv5';

// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
// SUPABASE CONFIG - loaded at runtime from /api/dreco-config
// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
let db = null;
const LOCAL_STORE_KEY = 'dreco_local_store_v1';
const LOCAL_STAFF_KEY = 'dreco_staff_accounts_v1';
const CLOUD_ACCOUNTS_KEY = 'dreco_accounts_v2';
const AUTH_API_PATH = '/api/dreco-auth';
const AUTH_EMAIL_DOMAIN = 'dreco.local';
let DEFAULT_COMPANY = {
  id: 'dreco-workspace',
  name: 'Recruitflow Workspace',
  generalJobsCountries: ['General'],
};
let DEFAULT_ADMIN_USERNAME = 'admin';
let RETIRED_USERNAMES = [];
let BLOCKED_ADMIN_ALIASES = [];

// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
// STAFF ACCOUNTS
// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
const STAFF_ACCOUNTS = {};
// Frozen snapshot of hardcoded accounts â€” used by doLogin to verify admin
// credentials without touching cloud or localStorage. Never mutated.
const _HARDCODED_SNAPSHOT = Object.freeze(
  Object.fromEntries(Object.entries(STAFF_ACCOUNTS).map(([u, a]) => [u, Object.freeze({ ...a })]))
);
// Recovery via shared code removed â€” password resets go through admin only.

function normalizeAccount(username, account = {}) {
  let companyName = (account.companyName || DEFAULT_COMPANY.name).trim();
  const companyId = account.companyId || slugify(companyName) || DEFAULT_COMPANY.id;
  if (companyId === DEFAULT_COMPANY.id) companyName = DEFAULT_COMPANY.name;
  const legacyCountry = account.generalJobsCountry || String(account.generalJobsLabel || '').replace(/\s+Jobs$/i,'');
  const generalJobsCountries = Array.isArray(account.generalJobsCountries) && account.generalJobsCountries.length
    ? account.generalJobsCountries
    : (legacyCountry ? [legacyCountry] : DEFAULT_COMPANY.generalJobsCountries);
  const normalized = {
    role: account.role || 'staff',
    display: account.display || username,
    companyId,
    companyName,
    authUserId: account.authUserId || '',
    email: account.email || account.account_email || '',
    emailVerified: account.emailVerified === true || account.account_email_verified === true,
    passwordHash: account.passwordHash || '',
    passwordSalt: account.passwordSalt || '',
    generalJobsCountries: [...new Set(generalJobsCountries.map(c => String(c || '').trim()).filter(Boolean))],
  };
  // Preserve hashVersion â€” critical for PBKDF2 detection in verifyAccountPassword.
  // Without this, every normalizeAccount call strips the field and forces a
  // legacy SHA-256 verification path, which fails for PBKDF2-hashed passwords.
  if (account.hashVersion) normalized.hashVersion = account.hashVersion;
  if (account.password && !normalized.passwordHash) normalized.password = account.password;
  return normalized;
}
function normalizeAllAccounts() {
  Object.keys(STAFF_ACCOUNTS).forEach(username => {
    STAFF_ACCOUNTS[username] = normalizeAccount(username, STAFF_ACCOUNTS[username]);
  });
}
function cleanupLegacyDestinyUsers() {
  [...new Set([...RETIRED_USERNAMES, ...BLOCKED_ADMIN_ALIASES])].forEach(username => {
    const account = STAFF_ACCOUNTS[username];
    const isDefaultCompany = account && (account.companyId || DEFAULT_COMPANY.id) === DEFAULT_COMPANY.id;
    const isBlockedAdminAlias = BLOCKED_ADMIN_ALIASES.includes(username);
    if (isDefaultCompany && (RETIRED_USERNAMES.includes(username) || isBlockedAdminAlias)) delete STAFF_ACCOUNTS[username];
  });
  if (STAFF_ACCOUNTS[DEFAULT_ADMIN_USERNAME]) {
    STAFF_ACCOUNTS[DEFAULT_ADMIN_USERNAME] = normalizeAccount(DEFAULT_ADMIN_USERNAME, {
      ...STAFF_ACCOUNTS[DEFAULT_ADMIN_USERNAME],
      role: 'admin',
      display: STAFF_ACCOUNTS[DEFAULT_ADMIN_USERNAME].display || DEFAULT_ADMIN_USERNAME,
      companyId: DEFAULT_COMPANY.id,
      companyName: STAFF_ACCOUNTS[DEFAULT_ADMIN_USERNAME].companyName || DEFAULT_COMPANY.name,
    });
  }
}
function slugify(value) {
  return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64);
}
function getAuthEmail(username) {
  return `${String(username || '').trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}
function applyRuntimeConfig(config = {}) {
  if (config.defaultCompany) {
    DEFAULT_COMPANY = {
      id: config.defaultCompany.id || DEFAULT_COMPANY.id,
      name: config.defaultCompany.name || DEFAULT_COMPANY.name,
      generalJobsCountries: Array.isArray(config.defaultCompany.generalJobsCountries) && config.defaultCompany.generalJobsCountries.length
        ? config.defaultCompany.generalJobsCountries
        : DEFAULT_COMPANY.generalJobsCountries,
    };
    if (typeof currentCompany !== 'undefined') currentCompany = { ...DEFAULT_COMPANY };
  }
  if (config.defaultAdminUsername) DEFAULT_ADMIN_USERNAME = String(config.defaultAdminUsername).trim().toLowerCase();
  if (Array.isArray(config.retiredUsernames)) {
    RETIRED_USERNAMES = config.retiredUsernames.map(name => String(name || '').trim().toLowerCase()).filter(Boolean);
  }
  if (Array.isArray(config.blockedAdminAliases)) {
    BLOCKED_ADMIN_ALIASES = config.blockedAdminAliases.map(name => String(name || '').trim().toLowerCase()).filter(Boolean);
  }
  const url = config.supabase?.url || '';
  const anonKey = config.supabase?.anonKey || '';
  if (url && anonKey) {
    db = createClient(url, anonKey);
    appStorageMode = 'cloud';
  }
}
async function loadRuntimeConfig() {
  try {
    const response = await fetch('/api/dreco-config', { cache: 'no-store' });
    if (!response.ok) throw new Error('Config endpoint unavailable.');
    applyRuntimeConfig(await response.json());
  } catch (err) {
    console.warn('Runtime config unavailable; using local defaults:', err);
  }
}
function accountFromAuthUser(user, fallbackUsername = '') {
  const meta = user?.app_metadata || {};
  return normalizeAccount(meta.username || fallbackUsername || String(user?.email || '').replace(/@.*/,''), {
    authUserId: user?.id,
    role: meta.role || 'staff',
    display: meta.display || meta.username || fallbackUsername,
    companyId: meta.company_id,
    companyName: meta.company_name,
    email: meta.account_email || '',
    emailVerified: meta.account_email_verified === true,
    generalJobsCountries: meta.general_jobs_countries,
  });
}
async function postAuthAction(payload, accessToken = '') {
  const response = await fetch(AUTH_API_PATH, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (response.status === 404 || !data) {
    throw new Error('Auth API is unavailable. Using local workspace mode.');
  }
  if (!response.ok) throw new Error(data.error || 'Auth service request failed.');
  return data;
}
async function signInWithSupabaseAuth(username, password) {
  if (!db?.auth) return null;
  const { data, error } = await db.auth.signInWithPassword({
    email: getAuthEmail(username),
    password,
  });
  if (error || !data?.user) return null;
  const account = accountFromAuthUser(data.user, username);
  return { account, session: data.session };
}

async function authToken() {
  if (!db?.auth) return '';
  const { data } = await db.auth.getSession();
  return data?.session?.access_token || '';
}
function makePasswordSalt() {
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
// PBKDF2 with 200,000 iterations â€“ deliberately slow to resist offline brute-force.
// SHA-256 (used previously) is a fast hash and unsuitable for passwords.
// Legacy SHA-256 hashes are detected and transparently upgraded on next successful login.
const PBKDF2_ITERATIONS = 200000;
async function pbkdf2Hex(salt, password) {
  if (!window.crypto?.subtle) throw new Error('Secure password hashing requires HTTPS or localhost.');
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await window.crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
}
// Kept only for detecting and migrating old SHA-256 hashes.
async function _legacySha256Hex(value) {
  if (!window.crypto?.subtle) return '';
  const data = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
async function setAccountPassword(account, password) {
  const salt = makePasswordSalt();
  account.passwordSalt = salt;
  account.passwordHash = await pbkdf2Hex(salt, password);
  account.hashVersion = 'pbkdf2-sha256-200k';
  delete account.password;
}
async function verifyAccountPassword(account, password) {
  if (!account) return { ok: false, migrated: false };
  if (account.passwordHash && account.passwordSalt) {
    // Detect legacy SHA-256 hashes (no hashVersion tag) and upgrade them on login.
    if (!account.hashVersion) {
      const legacyHash = await _legacySha256Hex(`${account.passwordSalt}:${password}`);
      if (legacyHash !== account.passwordHash) return { ok: false, migrated: false };
      // Password correct â€” re-hash with PBKDF2 and save upgraded hash.
      await setAccountPassword(account, password);
      return { ok: true, migrated: true };
    }
    const hash = await pbkdf2Hex(account.passwordSalt, password);
    return { ok: hash === account.passwordHash, migrated: false };
  }
  // Plaintext password (very old accounts) â€” upgrade immediately.
  if (account.password && account.password === password) {
    await setAccountPassword(account, password);
    return { ok: true, migrated: true };
  }
  return { ok: false, migrated: false };
}
async function loadStaffAccounts() {
  // Snapshot the hardcoded defaults so cloud/local cannot corrupt them.
  const hardcodedDefaults = {};
  Object.entries(STAFF_ACCOUNTS).forEach(([u, a]) => {
    if (a.passwordHash && a.passwordSalt) hardcodedDefaults[u] = { ...a };
  });

  // Step 1: Load local accounts
  let localAccounts = {};
  try {
    const saved = safeLocalGet(LOCAL_STAFF_KEY);
    if (saved) localAccounts = JSON.parse(saved);
  } catch (err) {
    console.warn('Saved staff accounts could not be loaded:', err);
  }

  // Step 2: Load cloud accounts (if available)
  let cloudAccounts = {};
  if (db) {
    try {
      const { data, error } = await db.from('app_settings').select('value').eq('key', CLOUD_ACCOUNTS_KEY).maybeSingle();
      if (error) throw error;
      if (data?.value && typeof data.value === 'object') cloudAccounts = data.value;
    } catch (err) {
      console.warn('Cloud staff accounts could not be loaded:', err);
    }
  }

  // Step 3: Merge â€” cloud first as the base, then local on top.
  Object.assign(STAFF_ACCOUNTS, cloudAccounts);
  Object.keys(localAccounts).forEach(username => {
    const local = localAccounts[username];
    const existing = STAFF_ACCOUNTS[username];
    if (existing && local.passwordHash && local.passwordSalt) {
      STAFF_ACCOUNTS[username] = { ...existing, ...local };
    } else if (local) {
      STAFF_ACCOUNTS[username] = { ...(existing || {}), ...local };
    }
  });

  // Step 4: Re-apply hardcoded password hashes.
  // They are the canonical source of truth UNLESS the user has deliberately
  // changed their password (detected by local hash differing from the hardcoded one).
  // A hash that matches the hardcoded default or is empty/missing means the
  // local copy is stale/corrupted and the hardcoded value should win.
  Object.entries(hardcodedDefaults).forEach(([u, defaults]) => {
    const current = STAFF_ACCOUNTS[u];
    const localHash = localAccounts[u]?.passwordHash;
    // "Custom" means the user changed their password to something other than the default
    const localIsCustom = localHash && localHash !== defaults.passwordHash;
    if (localIsCustom) return; // deliberate password change â€” keep it
    if (current) {
      STAFF_ACCOUNTS[u] = { ...current, passwordHash: defaults.passwordHash, passwordSalt: defaults.passwordSalt, hashVersion: defaults.hashVersion };
    } else {
      STAFF_ACCOUNTS[u] = { ...defaults };
    }
  });

  // Step 5: Persist the merged result locally for next time
  safeLocalSet(LOCAL_STAFF_KEY, JSON.stringify(STAFF_ACCOUNTS));

  // Step 6: Normalise and clean up exactly once
  normalizeAllAccounts();
  cleanupLegacyDestinyUsers();

  // Step 7: Push corrected accounts back to cloud so stale hashes don't persist
  if (db) {
    try {
      await db.from('app_settings').upsert({ key: CLOUD_ACCOUNTS_KEY, value: cloudSafeAccounts() }, { onConflict: 'key' });
    } catch (_) {}
  }
}
// Password material (PBKDF2 hash/salt) backs the offline/local-fallback login
// and must never leave the device. Strip it from anything synced to the cloud
// app_settings row so hashes are not persisted in a shared table.
function cloudSafeAccounts() {
  const out = {};
  for (const [u, a] of Object.entries(STAFF_ACCOUNTS)) {
    const { passwordHash, passwordSalt, hashVersion, password, ...rest } = a || {};
    out[u] = rest;
  }
  return out;
}
async function saveStaffAccounts() {
  normalizeAllAccounts();
  cleanupLegacyDestinyUsers();
  safeLocalSet(LOCAL_STAFF_KEY, JSON.stringify(STAFF_ACCOUNTS));
  if (db) {
    try {
      await db.from('app_settings').upsert({ key: CLOUD_ACCOUNTS_KEY, value: cloudSafeAccounts() }, { onConflict: 'key' });
    } catch (err) {
      console.warn('Cloud staff accounts could not be saved:', err);
    }
  }
}

function safeLocalGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeLocalSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* file pages may block storage */ }
}
function safeSessionGet(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function safeSessionSet(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* login still works without session restore */ }
}
function safeSessionRemove(key) {
  try { sessionStorage.removeItem(key); } catch { /* ignore */ }
}
function safeLocalRemove(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
// STATE
// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
let currentCompany = { ...DEFAULT_COMPANY };
const PRO_PIPELINE_STAGES = ['INTERVIEW','OFFER LETTER','MEDICAL & ATTESTATION','WORK PERMIT','VISA','TICKET BOOKED','TRAVELLED'];
const LB_PIPELINE_STAGES = ['SUBMITTED','PROFILE SENT','SELECTED','PASSPORT APPLIED','VISA PROCESSING','TRAVELLED','REFUND PENDING','REFUND COMPLETE'];
const PRO_WORKFLOW_TEMPLATES = [
  {
    key: 'professional-standard',
    name: 'Professional standard',
    description: 'Interview through offer letter, medical and attestation, work permit, visa, ticket, and travel.',
    stages: ['INTERVIEW','OFFER LETTER','MEDICAL & ATTESTATION','WORK PERMIT','VISA','TICKET BOOKED','TRAVELLED'],
  },
  {
    key: 'professional-full',
    name: 'Professional full recruitment',
    description: 'Adds submitted, profile sent, interview, and selected before processing starts.',
    stages: ['SUBMITTED','PROFILE SENT','INTERVIEW','SELECTED','OFFER LETTER','MEDICAL & ATTESTATION','WORK PERMIT','VISA','TICKET BOOKED','TRAVELLED'],
  },
];
const LB_WORKFLOW_TEMPLATES = [
  {
    key: 'general-simple',
    name: 'General simple',
    description: 'Short pipeline for agencies that only need submitted, selected, and travelled.',
    stages: ['SUBMITTED','PROFILE SENT','SELECTED','TRAVELLED'],
  },
  {
    key: 'saudi-domestic',
    name: 'Saudi domestic worker',
    description: 'Training, good conduct, Musaned, contract, medical, VFS, embassy, ticket, travel.',
    stages: ['SUBMITTED','TRAINING','TRANSCRIPT','GOOD CONDUCT','MUSANED UPLOAD','CONTRACT ISSUED','MEDICAL','VFS BIOMETRICS','EMBASSY','TICKET BOOKED','TRAVELLED'],
  },
  {
    key: 'lebanon-domestic',
    name: 'Lebanon domestic worker',
    description: 'Lightweight flow where employer handles most processing after selection.',
    stages: ['SUBMITTED','PROFILE SENT','SELECTED','VISA PROCESSING','PENDING TRAVEL','TRAVELLED'],
  },
];
const GENERAL_COUNTRY_WORKFLOW_PRESETS = {
  DEFAULT: {
    name: 'General default',
    description: 'Uses the workspace General Jobs stages for countries without a dedicated process.',
    stages: null,
  },
  SAUDI: {
    name: 'Saudi domestic worker',
    description: 'Documents, training, certificates, Musaned, contract, medical, biometrics, embassy, ticket, travel.',
    stages: ['SUBMITTED','TRAINING','TRANSCRIPT','GOOD CONDUCT','MUSANED UPLOAD','CONTRACT ISSUED','MEDICAL','VFS BIOMETRICS','EMBASSY','TICKET BOOKED','TRAVELLED'],
  },
  LEBANON: {
    name: 'Lebanon domestic worker',
    description: 'Documents, profile sent, employer selection, visa processing, ticket booking, travel.',
    stages: ['SUBMITTED','PROFILE SENT','SELECTED','VISA PROCESSING','TICKET BOOKED','TRAVELLED'],
  },
  OMAN: {
    name: 'Oman general worker',
    description: 'General Gulf processing with selection, medical/clearance, visa, ticket, and travel.',
    stages: ['SUBMITTED','PROFILE SENT','SELECTED','MEDICAL','VISA PROCESSING','TICKET BOOKED','TRAVELLED'],
  },
};
const PAYMENT_RULE_PRESETS = [
  {
    key: 'split-offer-visa',
    name: '50% offer letter, 50% visa',
    description: 'Destiny-style collection: first half after offer letter, balance after visa.',
    rules: [
      { stage: 'OFFER LETTER', percent: 50 },
      { stage: 'VISA', percent: 100 },
    ],
  },
  {
    key: 'full-before-processing',
    name: 'Full before processing',
    description: 'The full commission is expected at the first active processing stage.',
    rules: [
      { stage: 'PENDING OFFER LETTER', percent: 100 },
    ],
  },
  {
    key: 'full-after-offer',
    name: 'Full after offer letter',
    description: 'The full commission becomes due once the offer letter is received.',
    rules: [
      { stage: 'OFFER LETTER', percent: 100 },
    ],
  },
  {
    key: 'full-after-visa',
    name: 'Full after visa',
    description: 'The full commission becomes due only after visa approval.',
    rules: [
      { stage: 'VISA', percent: 100 },
    ],
  },
];
function getDefaultPaymentRules(){
  return { proPreset: 'split-offer-visa', proRules: PAYMENT_RULE_PRESETS[0].rules.map(r=>({...r})) };
}
let drecoExpenses = JSON.parse(safeLocalGet('dreco_expenses') || '[]');
window.drecoExpenses = drecoExpenses;
let drecoEvents   = JSON.parse(safeLocalGet('dreco_events') || '[]');
let drecoAudit    = JSON.parse(safeLocalGet('dreco_audit') || '[]');
let paymentRules  = getDefaultPaymentRules();
const DEFAULT_DOC_REQUIREMENTS = {
  pro: ['Passport copy','CV / Resume','Medical certificate','Police clearance','Work permit docs','Visa copy','Interview letter'],
  lb: ['National ID','Passport application','Medical report','Embassy attestation','Travel ticket'],
};
let docRequirements = { pro: [...DEFAULT_DOC_REQUIREMENTS.pro], lb: [...DEFAULT_DOC_REQUIREMENTS.lb] };
let editingEventId = null;
let pendingStageType = null;
let pendingStageSelect = null;
let financePeriod = 'month';
let proPage       = 1;
let lbPage        = 1;
let editingProId  = null;
let editingLbId   = null;
const PER_PAGE    = 20;
const EXCEL_EPOCH = new Date(1899, 11, 30);

// pill filter state
window.proStagePillFilter = '';
window.lbTravelPillFilter = '';
window.lbPPFilter         = '';
window.generalCountryFilter = '';
let calSource = 'pro';
let calDate = new Date();
let appStorageMode = db ? 'cloud' : 'local';
let lastSyncError = '';

function getCompanyId() {
  return currentUser?.companyId || currentCompany.id || DEFAULT_COMPANY.id;
}
function getCompanyName() {
  return currentUser?.companyName || currentCompany.name || DEFAULT_COMPANY.name;
}
function getGeneralCountries() {
  return currentUser?.generalJobsCountries || currentCompany.generalJobsCountries || DEFAULT_COMPANY.generalJobsCountries;
}
function getActiveGeneralCountry() {
  const countries = getGeneralCountries();
  if (!window.generalCountryFilter || !countries.includes(window.generalCountryFilter)) {
    window.generalCountryFilter = countries[0] || 'General';
  }
  return window.generalCountryFilter;
}
function normalizeCountryKey(country) {
  const value = String(country || '').trim().toUpperCase();
  if (value.includes('SAUDI')) return 'SAUDI';
  if (value.includes('LEBANON')) return 'LEBANON';
  if (value.includes('OMAN')) return 'OMAN';
  return 'DEFAULT';
}
function getGeneralWorkflowPreset(country = getActiveGeneralCountry()) {
  return GENERAL_COUNTRY_WORKFLOW_PRESETS[normalizeCountryKey(country)] || GENERAL_COUNTRY_WORKFLOW_PRESETS.DEFAULT;
}
// Single source of truth for a country's General Jobs pipeline, resolved in one
// clear order (no silent merges):
//   1. a saved per-country override (generalWorkflows[country]) â€” set when a
//      user edits or applies a template for that country, else
//   2. the built-in country preset (Saudi/Lebanon/Oman), else
//   3. the workspace General default (lbStages).
function getGeneralWorkflowStages(country = getActiveGeneralCountry()) {
  const saved = generalWorkflows[country];
  if (Array.isArray(saved) && saved.length) {
    return [...new Set(saved.map(s => cleanStage(s)).filter(Boolean))];
  }
  const preset = getGeneralWorkflowPreset(country);
  const source = (Array.isArray(preset.stages) && preset.stages.length) ? preset.stages : lbStages;
  const cleaned = [...new Set((source || []).map(s => cleanStage(s)).filter(Boolean))];
  return cleaned.length ? cleaned : LB_PIPELINE_STAGES;
}
function getLBWorkflowStagesForRecord(row = {}) {
  return getGeneralWorkflowStages(row.country || getActiveGeneralCountry());
}
// Which General Jobs country the Settings workflow editor is currently editing.
function getSettingsGeneralCountry() {
  const countries = getGeneralCountries();
  if (!window.settingsGeneralCountry || !countries.includes(window.settingsGeneralCountry)) {
    window.settingsGeneralCountry = getActiveGeneralCountry();
  }
  return window.settingsGeneralCountry;
}
// Persist a country's pipeline as its per-country override (the one source).
// Editing the workspace "General" default still writes lbStages so untouched
// countries keep following it.
function setGeneralWorkflowForCountry(country, stages) {
  const clean = [...new Set((stages || []).map(s => cleanStage(s)).filter(Boolean))];
  if (!clean.length) return false;
  const next = { ...generalWorkflows, [country]: clean };
  setGeneralWorkflows(next);
  if (normalizeCountryKey(country) === 'DEFAULT') setLbStages(clean);
  return true;
}
function getCompanyScopedKey(key) {
  return `${getCompanyId()}:${key}`;
}
function stripCompanyScopedKey(key) {
  const prefix = `${getCompanyId()}:`;
  return String(key || '').startsWith(prefix) ? String(key).slice(prefix.length) : key;
}
function setCurrentWorkspace(account) {
  const normalized = normalizeAccount('', account || {});
  currentCompany = {
    id: normalized.companyId,
    name: normalized.companyName,
    generalJobsCountries: normalized.generalJobsCountries,
  };
  if (!currentCompany.generalJobsCountries.includes(window.generalCountryFilter)) {
    window.generalCountryFilter = currentCompany.generalJobsCountries[0] || '';
  }
}
function updateWorkspaceLabels() {
  const mappings = [
    ['#topbar-workspace-name', getCompanyName()],
    ['#topbar-user-sub', getCompanyName()],
    ['#sidebar-company-name', getCompanyName()],
    ['#nav-lb .nav-item-label', 'General Jobs'],
    ['#nav-lb', 'General Jobs', 'data-title'],
    ['#bnav-lb span', 'General'],
    ['#lb-section .panel-title', 'General Jobs candidates'],
    ['#lb-modal-title', 'Add General Jobs candidate'],
  ];
  mappings.forEach(([selector, value, attr]) => {
    const el = document.querySelector(selector);
    if (!el) return;
    if (attr) el.setAttribute(attr, value); else el.textContent = value;
  });
  renderGeneralCountryTabs();
  // Sidebar workspace badge
  const wsAv = document.getElementById('sidebar-ws-av');
  const wsName = document.getElementById('sidebar-ws-name');
  if (wsAv) {
    const cn = getCompanyName() || 'Workspace';
    wsAv.textContent = cn.split(/\s+/).filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase() || 'WS';
  }
  if (wsName) wsName.textContent = getCompanyName() || 'Workspace';
}
function renderGeneralCountryTabs() {
  const el = document.getElementById('general-country-tabs');
  if (!el) return;
  const active = getActiveGeneralCountry();
  el.innerHTML = getGeneralCountries().map(country =>
    `<button class="country-tab ${country===active?'active':''}" onclick="setGeneralCountry('${escJSString(country)}')">${escHTML(country)}</button>`
  ).join('') + `<button class="country-tab country-tab-add" onclick="addGeneralCountry()" title="Add country"><i class="ti ti-plus"></i></button>`;
}
function setGeneralCountry(country) {
  window.generalCountryFilter = country;
  lbPage = 1;
  rebuildStageSelects();
  renderGeneralCountryTabs();
  renderLB();
}
async function addGeneralCountry() {
  const input=document.getElementById('quick-country-name');
  const err=document.getElementById('quick-country-error');
  if(input) input.value='';
  if(err){ err.textContent=''; err.style.display='none'; }
  document.getElementById('quick-country-modal')?.classList.add('open');
}
async function submitQuickCountry(){
  const input=document.getElementById('quick-country-name');
  const err=document.getElementById('quick-country-error');
  const fail=msg=>{ if(err){ err.textContent=msg; err.style.display='block'; } };
  const name=(input?.value||'').trim();
  if(!name) return fail('Country name is required.');
  const countries=getGeneralCountries();
  if(!countries.some(c=>c.toLowerCase()===name.toLowerCase())) countries.push(name);
  window.generalCountryFilter=countries.find(c=>c.toLowerCase()===name.toLowerCase())||name;
  await persistWorkspaceCountries(countries);
  closeModal('quick-country-modal');
  renderGeneralCountryTabs(); renderSettingsCountries(); renderLB(); window.renderDash?.();
}
async function persistWorkspaceCountries(countries) {
  const clean = [...new Set(countries.map(c => String(c || '').trim()).filter(Boolean))];
  const companyId = getCompanyId();
  Object.keys(STAFF_ACCOUNTS).forEach(username => {
    if ((STAFF_ACCOUNTS[username].companyId || DEFAULT_COMPANY.id) === companyId) {
      STAFF_ACCOUNTS[username].generalJobsCountries = clean;
    }
  });
  setCurrentUser({...currentUser, generalJobsCountries: clean});
  setCurrentWorkspace(currentUser);
  _saveSession(currentUser);
  await saveStaffAccounts();
}

function getDefaultLocalStore() {
  const isDefaultCompany = getCompanyId() === DEFAULT_COMPANY.id;
  return {
    pro: isDefaultCompany ? JSON.parse(JSON.stringify(PRO_SEED)).map(normalizeProRecord) : [],
    lb: isDefaultCompany ? JSON.parse(JSON.stringify(LB_SEED)).map(normalizeLBRecord) : [],
    docs: {},
    timelines: {},
    checklists: {},
    docRequirements: { pro: [...DEFAULT_DOC_REQUIREMENTS.pro], lb: [...DEFAULT_DOC_REQUIREMENTS.lb] },
    proStages: [...proStages],
    lbStages: [...lbStages],
    generalWorkflows: {},
    paymentRules: getDefaultPaymentRules(),
  };
}
function toNumOrNull(v) {
  return v===''||v===null||v===undefined ? null : Number(v);
}
function cleanStage(value, fallback = '') {
  return String(value || fallback || '').trim().toUpperCase();
}
function normalizePaymentRules(value){
  const defaults = getDefaultPaymentRules();
  const source = value && typeof value === 'object' ? value : defaults;
  const preset = PAYMENT_RULE_PRESETS.find(p=>p.key===source.proPreset) ? source.proPreset : defaults.proPreset;
  const rules = Array.isArray(source.proRules) ? source.proRules : defaults.proRules;
  const cleanRules = rules
    .map(rule => ({ stage: canonicalProStage(rule.stage), percent: Math.max(0, Math.min(100, Number(rule.percent)||0)) }))
    .filter(rule => rule.stage && rule.percent > 0)
    .sort((a,b)=>a.percent-b.percent);
  return { proPreset: preset, proRules: cleanRules.length ? cleanRules : defaults.proRules.map(r=>({...r})) };
}
function setPaymentRules(value){
  paymentRules = normalizePaymentRules(value);
}
function canonicalProStage(stage) {
  const value = cleanStage(stage);
  const legacyMap = {
    'PENDING OFFER': 'PENDING OFFER LETTER',
    'PENDING OL': 'PENDING OFFER LETTER',
    'OFFER': 'OFFER LETTER',
    'OL': 'OFFER LETTER',
    'MEDICAL': 'MEDICAL & ATTESTATION',
    'MEDICAL ATTESTATION': 'MEDICAL & ATTESTATION',
    'PENDING MOL': 'WORK PERMIT',
    'MOL': 'WORK PERMIT',
    'WORK PERMIT': 'WORK PERMIT',
    'PENDING VISA': 'VISA',
    'PENDING TRAVEL': 'TICKET BOOKED',
    'TICKET BOOKED': 'TICKET BOOKED',
    'READY TO TRAVEL': 'TICKET BOOKED',
    'TRAVEL': 'TICKET BOOKED',
    'TRAVELING': 'TRAVELLED',
    'TRAVELLING': 'TRAVELLED',
    'TRAVELED': 'TRAVELLED',
  };
  return legacyMap[value] || value;
}
function normalizeProStageList(stages) {
  const cleaned = (Array.isArray(stages) && stages.length ? stages : PRO_PIPELINE_STAGES)
    .map(canonicalProStage)
    .filter(Boolean);
  const preferred = PRO_PIPELINE_STAGES.filter(stage => cleaned.includes(stage));
  const custom = cleaned.filter(stage => !PRO_PIPELINE_STAGES.includes(stage));
  return [...new Set([...preferred, ...custom])];
}
function proStageValue(row = {}) {
  return canonicalProStage(row.stage || proStages[0] || 'INTERVIEW');
}
function lbStageValue(row = {}) {
  const stages = getLBWorkflowStagesForRecord(row);
  return cleanStage(row.stage || row.travelStatus || row.travel_status, stages[0] || 'SUBMITTED');
}
function proPipelineStageValue(row = {}) {
  const raw = row.raw || row;
  const stage = canonicalProStage(raw.stage || row.stage);
  const configured = normalizeProStageList(proStages);
  const ORDER = Object.fromEntries(configured.map((s,i)=>[s,i]));
  const pick = (candidates, fallback = configured[0] || 'INTERVIEW') =>
    candidates.find(s => configured.includes(s)) || fallback;

  // Stage derived from the DB stage field
  let dbStage = configured[0] || 'INTERVIEW';
  if (configured.includes(stage)) dbStage = stage;
  else if (stage === 'TRAVELLED' && configured.includes('TRAVELLED')) dbStage = 'TRAVELLED';

  // Minimum stage inferred from milestone date fields
  let dateStage = configured[0] || 'INTERVIEW';
  if (toInput(raw.interview || row.interview)) dateStage = pick(['INTERVIEW'], dateStage);
  if (toInput(raw.ol || row.ol)) dateStage = pick(['OFFER LETTER'], dateStage);
  if (toInput(raw.medical || row.medical)) dateStage = pick(['MEDICAL & ATTESTATION'], dateStage);
  if (toInput(raw.mol || row.mol)) dateStage = pick(['WORK PERMIT'], dateStage);
  if (toInput(raw.visa || row.visa)) dateStage = pick(['VISA'], dateStage);
  if (stage === 'TICKET BOOKED') dateStage = pick(['TICKET BOOKED'], dateStage);
  if (toInput(raw.travel || row.travel)) dateStage = pick(['TRAVELLED'], dateStage);

  // Return whichever is further along the pipeline
  return (ORDER[dbStage] ?? 0) >= (ORDER[dateStage] ?? 0) ? dbStage : dateStage;
}
function lbPipelineStageValue(row = {}) {
  const raw = row.raw || row;
  const stage = cleanStage(raw.stage || raw.travelStatus || raw.travel_status || row.stage);
  const configured = getLBWorkflowStagesForRecord(raw);
  if (configured.includes(stage)) return stage;
  const SELECTED_STAGES = new Set(['SELECTED','PASSPORT APPLIED','TRAINING','TRANSCRIPT','GOOD CONDUCT','MUSANED UPLOAD','CONTRACT ISSUED','MEDICAL','VFS BIOMETRICS','EMBASSY','VISA PROCESSING']);
  const TRAVELLED_STAGES = new Set(['TRAVELLED','REFUND PENDING','REFUND COMPLETE']);
  if (stage === 'TICKET BOOKED' && configured.includes('TICKET BOOKED')) return 'TICKET BOOKED';
  if (TRAVELLED_STAGES.has(stage)) return 'TRAVELLED';
  if (SELECTED_STAGES.has(stage)) {
    if (configured.includes('SELECTED')) return 'SELECTED';
    if (configured.includes('CONTRACT ISSUED')) return 'CONTRACT ISSUED';
    if (configured.includes('VISA PROCESSING')) return 'VISA PROCESSING';
  }
  return configured[0] || 'SUBMITTED';
}
function stageListWithData(configured = [], rows = [], getter = row => row.stage, normalizer = cleanStage) {
  const seen = new Set();
  return [...configured, ...rows.map(getter)]
    .map(stage => normalizer(stage))
    .filter(stage => stage && !seen.has(stage) && seen.add(stage));
}
function proStageMatches(row, stages) {
  const stage = proPipelineStageValue(row);
  return [].concat(stages).map(canonicalProStage).includes(stage);
}
function proPaidAmount(row = {}) {
  // The commissionPayments array is the source of truth once present (supports
  // unlimited installments). Fall back to the legacy paid1/paid2/paid mirrors.
  if (Array.isArray(row.commissionPayments) && row.commissionPayments.length) {
    return row.commissionPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  }
  const splitPaid = (Number(row.paid1) || 0) + (Number(row.paid2) || 0);
  const directPaid = Number(row.paid) || 0;
  return Math.max(splitPaid, directPaid);
}
function proStageIndex(stage){
  const configured = normalizeProStageList(proStages);
  const idx = configured.indexOf(canonicalProStage(stage));
  return idx >= 0 ? idx : 0;
}
function proExpectedPaymentPercent(row = {}){
  const currentIdx = proStageIndex(proPipelineStageValue(row));
  return (paymentRules.proRules || []).reduce((max, rule) => {
    return currentIdx >= proStageIndex(rule.stage) ? Math.max(max, Number(rule.percent)||0) : max;
  }, 0);
}
function proPaymentStatus(row = {}){
  const commission = Number(row.commission) || 0;
  const paid = proPaidAmount(row);
  const expectedPercent = proExpectedPaymentPercent(row);
  const expected = Math.round(commission * expectedPercent / 100);
  const dueNow = Math.max(expected - paid, 0);
  const outstanding = Math.max(commission - paid, 0);
  return { commission, paid, expectedPercent, expected, dueNow, outstanding };
}
function lbRefundPaidAmount(row = {}) {
  const legacyPaid = (Number(row.r1Amt || row.r1_amt) || 0) + (Number(row.r2Amt || row.r2_amt) || 0);
  const newPaid = (Array.isArray(row.refundPayments) ? row.refundPayments : [])
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return legacyPaid + newPaid;
}
function lbOwnPassport(row = {}) {
  return !!row.own_passport || cleanStage(row.ppStatus || row.pp_status) === 'HAD PP';
}
function lbRefundReturned(row = {}) {
  return cleanStage(row.notes) === 'RETURNED';
}
function lbRefundPrincipal(row = {}) {
  if (lbOwnPassport(row) || lbRefundReturned(row)) return 0;
  return Number(row.toRefund || row.to_refund) || 0;
}
function lbRefundOutstanding(row = {}) {
  if (!['TRAVELLED','REFUND PENDING','REFUND COMPLETE'].includes(lbStageValue(row))) return 0;
  return Math.max(lbRefundPrincipal(row) - lbRefundPaidAmount(row), 0);
}
// Unlimited commission installments live in commissionPayments = [{amount,date}].
// It is the source of truth; paid/paid1/paid2 are kept as mirrors for legacy
// views and older schemas. Derive it from the legacy fields when a record has
// no array yet, so existing candidates show their installments with no manual
// migration.
// The date a payment-rule stage happened, for reconstructing legacy installments.
function stageMilestoneDate(r, stage) {
  const s = String(stage || '').toUpperCase();
  const map = {
    'INTERVIEW': r.interview,
    'OFFER LETTER': r.ol, 'PENDING OFFER LETTER': r.ol,
    'MEDICAL & ATTESTATION': r.medical, 'MEDICAL': r.medical,
    'WORK PERMIT': r.mol,
    'VISA': r.visa,
    'TICKET BOOKED': r.travel, 'TRAVELLED': r.travel,
  };
  return normalizeDateField(map[s]) || '';
}
// Split a lump commission total into installments using the workspace payment
// rule (e.g. 50% at offer letter, 50% at visa), each dated by that stage's
// milestone, capped at the amount actually paid. This reconstructs the real
// "half after offer, half after visa" flow for records that were saved as a
// single running total before installment tracking existed.
function reconstructInstallments(r, paidTotal) {
  const commission = Number(r.commission) || 0;
  const rules = (paymentRules?.proRules || []).slice().sort((a, b) => (Number(a.percent) || 0) - (Number(b.percent) || 0));
  if (!commission || !rules.length) {
    return [{ amount: paidTotal, date: stageMilestoneDate(r, r.stage) || normalizeDateField(r.submitted) || '' }];
  }
  const out = [];
  let prevCum = 0, remaining = paidTotal;
  for (const rule of rules) {
    if (remaining <= 0.5) break;
    const cum = Math.round(commission * (Number(rule.percent) || 0) / 100);
    const slice = Math.max(cum - prevCum, 0);
    prevCum = cum;
    if (slice <= 0) continue;
    const amt = Math.min(slice, remaining);
    out.push({ amount: amt, date: stageMilestoneDate(r, rule.stage) || normalizeDateField(r.submitted) || '' });
    remaining -= amt;
  }
  // Anything paid beyond the rule breakpoints (overpayment) â†’ a final installment.
  if (remaining > 0.5) out.push({ amount: remaining, date: stageMilestoneDate(r, r.stage) || normalizeDateField(r.submitted) || '' });
  return out.length ? out : [{ amount: paidTotal, date: normalizeDateField(r.submitted) || '' }];
}
function deriveCommissionPayments(r, paid1, paid2) {
  const raw = r.commissionPayments || r.commission_payments;
  if (Array.isArray(raw) && raw.length) {
    return raw
      .map(p => ({ amount: Number(p.amount) || 0, date: normalizeDateField(p.date) || '' }))
      .filter(p => p.amount > 0 || p.date);
  }
  const out = [];
  // Explicit 1st/2nd amounts â†’ keep them, dating missing ones by the offer-letter
  // (1st) and visa (2nd) milestones so "half after offer, half after visa" reads right.
  if (paid1 != null && Number(paid1) > 0) out.push({ amount: Number(paid1), date: normalizeDateField(r.paid1_date) || stageMilestoneDate(r, 'OFFER LETTER') || '' });
  if (paid2 != null && Number(paid2) > 0) out.push({ amount: Number(paid2), date: normalizeDateField(r.paid2_date) || stageMilestoneDate(r, 'VISA') || '' });
  const paidTotal = Number(r.paid) || 0;
  if (out.length) {
    // If the running total exceeds the recorded slots, the rest was paid as a
    // lump â€” add it as the visa-stage installment so the total stays correct.
    const fromSlots = out.reduce((s, p) => s + p.amount, 0);
    if (paidTotal > fromSlots + 0.5) {
      out.push({ amount: paidTotal - fromSlots, date: stageMilestoneDate(r, 'VISA') || stageMilestoneDate(r, r.stage) || normalizeDateField(r.submitted) || '' });
    }
    return out;
  }
  // No split recorded at all â€” reconstruct from the payment rule + milestone dates.
  if (paidTotal > 0) return reconstructInstallments(r, paidTotal);
  return [];
}
function normalizeProRecord(r={}) {
  const paid1 = toNumOrNull(r.paid1);
  const paid2 = toNumOrNull(r.paid2);
  return {
    id:r.id,
    company_id:r.company_id||r.companyId||getCompanyId(),
    name:(r.name||'').toString().toUpperCase(),
    pp:(r.pp||'').toString().toUpperCase(),
    phone:r.phone||'',
    position:(r.position||'').toString().toUpperCase(),
    company:(r.company||'').toString().toUpperCase(),
    country:r.country||'',
    stage:proPipelineStageValue(r),
    submitted:normalizeDateField(r.submitted),
    interview:normalizeDateField(r.interview),
    ol:normalizeDateField(r.ol),
    mol:normalizeDateField(r.mol),
    visa:normalizeDateField(r.visa),
    travel:normalizeDateField(r.travel),
    commission:toNumOrNull(r.commission),
    paid1,
    paid2,
    paid1_date:normalizeDateField(r.paid1_date),
    paid2_date:normalizeDateField(r.paid2_date),
    paid:toNumOrNull(r.paid),
    commissionPayments:deriveCommissionPayments(r, paid1, paid2),
    medical:normalizeDateField(r.medical),
    airline:r.airline||'',
    travelTime:r.travelTime||r.travel_time||'',
    travelNotes:r.travelNotes||r.travel_notes||'',
    followUp:normalizeDateField(r.followUp||r.follow_up),
  };
}
function normalizeLBRecord(r={}) {
  const travelStatus = lbStageValue(r);
  return {
    id:r.id,
    company_id:r.company_id||r.companyId||getCompanyId(),
    country:(r.country||r.destination_country||DEFAULT_COMPANY.generalJobsCountries[0]||'General').toString(),
    name:(r.name||'').toString().toUpperCase(),
    phone:r.phone||'',
    ppStatus:r.ppStatus||r.pp_status||'APPLIED',
    stage:travelStatus,
    travelStatus,
    travelDate:normalizeDateField(r.travelDate||r.travel_date),
    toRefund:Number(r.toRefund||r.to_refund)||0,
    r1Date:normalizeDateField(r.r1Date||r.r1_date),
    r1Amt:Number(r.r1Amt||r.r1_amt)||0,
    r2Date:normalizeDateField(r.r2Date||r.r2_date),
    r2Amt:Number(r.r2Amt||r.r2_amt)||0,
    refundPayments:Array.isArray(r.refundPayments)?r.refundPayments:[],
    own_passport:lbOwnPassport(r),
    notes:r.notes||'',
    airline:r.airline||'',
    travelTime:r.travelTime||r.travel_time||'',
    followUp:normalizeDateField(r.followUp||r.follow_up),
    submitted_date:normalizeDateField(r.submitted_date||r.submittedDate),
    selected_date:normalizeDateField(r.selected_date||r.selectedDate),
    passport_date:normalizeDateField(r.passport_date||r.passportDate),
    visa_date:normalizeDateField(r.visa_date||r.visaDate),
  };
}
function getStorageLabel() {
  if (appStorageMode === 'cloud') return 'Supabase cloud sync';
  return lastSyncError ? 'Local mode - cloud unavailable' : 'Local browser storage';
}
function loadLocalStore() {
  try {
    const raw = safeLocalGet(`${LOCAL_STORE_KEY}_${getCompanyId()}`);
    if (!raw) return getDefaultLocalStore();
    const parsed={ ...getDefaultLocalStore(), ...JSON.parse(raw) };
    parsed.pro=(parsed.pro||[]).map(normalizeProRecord);
    parsed.lb=(parsed.lb||[]).map(normalizeLBRecord);
    parsed.paymentRules=normalizePaymentRules(parsed.paymentRules);
    return parsed;
  } catch (err) {
    console.warn('Local store could not be read, using seed data:', err);
    return getDefaultLocalStore();
  }
}
function saveLocalStore() {
  safeLocalSet(`${LOCAL_STORE_KEY}_${getCompanyId()}`, JSON.stringify({
    pro: proDB,
    lb: lbDB,
    docs: allDocs,
    timelines: allTimelines,
    checklists: allChecklists,
    docRequirements,
    proStages,
    lbStages,
    generalWorkflows,
    paymentRules,
  }));
}
function nextLocalId(rows) {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
}

// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
// LOADING
// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
function showLoading(msg = 'Loading...') {
  const el = document.getElementById('loading-text'); if (el) el.textContent = msg;
  document.getElementById('loading-overlay').classList.add('show');
}
function hideLoading() { document.getElementById('loading-overlay').classList.remove('show'); }

// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
// SIDEBAR TOGGLE
// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  if (window.innerWidth <= 860) {
    sb.classList.contains('mobile-open') ? closeMobileSidebar() : openMobileSidebar();
  } else {
    sb.classList.toggle('collapsed');
    document.getElementById('app')?.classList.toggle('sidebar-collapsed', sb.classList.contains('collapsed'));
  }
}
function openMobileSidebar() {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  // Must use setProperty with 'important' priority â€” CSS display:none!important
  // beats normal inline styles, so we need inline !important to win the cascade.
  const sp = (prop, val) => sb.style.setProperty(prop, val, 'important');
  sp('display', 'flex');
  sp('flex-direction', 'column');
  sp('position', 'fixed');
  sp('top', '0');
  sp('left', '0');
  sp('bottom', '0');
  sp('width', 'min(280px, 85vw)');
  sp('height', '100%');
  sp('z-index', '400');
  sp('overflow-y', 'auto');
  sp('overflow-x', 'hidden');
  sp('background', '#1A1C2E');
  sp('box-shadow', '6px 0 40px rgba(0,0,0,.55)');
  sp('border-radius', '0');
  sp('border-right', 'none');
  sp('padding', '18px 12px 16px');
  sb.style.animation = 'drawerSlideIn .22s cubic-bezier(.4,0,.2,1) both';
  sb.classList.add('mobile-open');
  document.getElementById('sidebar-backdrop')?.classList.add('visible');
  document.body.style.overflow = 'hidden';
}
function closeMobileSidebar() {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  sb.removeAttribute('style');
  sb.classList.remove('mobile-open');
  document.getElementById('sidebar-backdrop')?.classList.remove('visible');
  document.body.style.overflow = '';
}

// Swipe-from-left-edge gesture
(function() {
  let touchStartX = 0, touchStartY = 0, dragging = false;
  const EDGE_THRESHOLD = 28; // px from left edge to start swipe
  const MIN_SWIPE = 60;      // px to trigger open

  document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    dragging = touchStartX <= EDGE_THRESHOLD;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!dragging) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
    if (dx > MIN_SWIPE && dy < 80 && window.innerWidth <= 860) openMobileSidebar();
    dragging = false;
  }, { passive: true });
})();

// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
// AUTH
// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
function togglePassword() {
  const inp = document.getElementById('pw-input');
  const btn = document.getElementById('pw-toggle');
  if (inp.type === 'password') { inp.type='text'; btn.innerHTML='<i class="ti ti-eye-off"></i>'; }
  else                         { inp.type='password'; btn.innerHTML='<i class="ti ti-eye"></i>'; }
}
function setLoginBusy(isBusy) {
  const btn = document.getElementById('login-submit');
  const label = btn?.querySelector('.lp-submit-label');
  ['username-input','pw-input'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = isBusy;
  });
  if (!btn) return;
  btn.disabled = isBusy;
  btn.classList.toggle('is-loading', isBusy);
  btn.classList.remove('is-success');
  if (label) label.textContent = isBusy ? 'Signing in...' : 'Sign in';
}
function setLoginSuccessState() {
  const btn = document.getElementById('login-submit');
  const label = btn?.querySelector('.lp-submit-label');
  if (!btn) return;
  btn.classList.remove('is-loading');
  btn.classList.add('is-success');
  if (label) label.textContent = 'Signed in';
}
function setRecoveryBusy(isBusy) {
  const btn = document.getElementById('recovery-submit');
  const label = btn?.querySelector('.lp-submit-label');
  ['recovery-username','recovery-code','recovery-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = isBusy;
  });
  if (!btn) return;
  btn.disabled = isBusy;
  btn.classList.toggle('is-loading', isBusy);
  if (label) label.textContent = isBusy ? 'Resetting...' : 'Reset password';
}
function initLoginInteractions() {
  const pw = document.getElementById('pw-input');
  const hint = document.getElementById('caps-lock-hint');
  if (pw && hint) {
    const updateCapsHint = e => {
      const isOn = !!e.getModifierState?.('CapsLock');
      hint.classList.toggle('show', isOn);
    };
    pw.addEventListener('keydown', updateCapsHint);
    pw.addEventListener('keyup', updateCapsHint);
    pw.addEventListener('blur', () => hint.classList.remove('show'));
  }
  document.getElementById('recovery-form')?.addEventListener('submit', e => {
    e.preventDefault();
    doRecoveryReset();
  });
  document.getElementById('send-recovery-email')?.addEventListener('click', () => {
    sendRecoveryCodeEmail();
  });
  const media = document.querySelector('.lp-media');
  const hero = document.querySelector('.lp-hero-object');
  if (media && hero) {
    media.addEventListener('mousemove', e => {
      const rect = media.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - .5) * 8;
      const y = ((e.clientY - rect.top) / rect.height - .5) * 8;
      hero.style.setProperty('--hero-x', `${x.toFixed(1)}px`);
      hero.style.setProperty('--hero-y', `${y.toFixed(1)}px`);
    });
    media.addEventListener('mouseleave', () => {
      hero.style.setProperty('--hero-x', '0px');
      hero.style.setProperty('--hero-y', '0px');
    });
  }
  document.querySelectorAll('.lp-preview-kpi strong').forEach(el => {
    const raw = (el.textContent || '').trim();
    const numeric = Number(raw.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(numeric) || !/^\d+(\.\d+)?[MK]?$/.test(raw)) return;
    const suffix = raw.replace(/[\d.]/g, '');
    const start = performance.now();
    const duration = 650;
    const render = now => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = numeric * eased;
      el.textContent = suffix ? `${value.toFixed(1)}${suffix}` : String(Math.round(value));
      if (progress < 1) requestAnimationFrame(render);
      else el.textContent = raw;
    };
    requestAnimationFrame(render);
  });
}
function setAuthMode(mode = 'login') {
  const screen = document.getElementById('login-screen');
  if (!screen) return;
  screen.classList.remove('auth-mode-login','auth-mode-signup','auth-mode-recovery');
  screen.classList.add(`auth-mode-${mode}`);
}
function showForgotPassword() {
  setAuthMode('recovery');
  document.getElementById('login-main').style.display='none';
  document.getElementById('signup-section').style.display='none';
  document.getElementById('forgot-section').style.display='block';
}
function hideForgotPassword() {
  setAuthMode('login');
  document.getElementById('forgot-section').style.display='none';
  document.getElementById('signup-section').style.display='none';
  document.getElementById('login-main').style.display='block';
}
function showSignup() {
  setAuthMode('signup');
  document.getElementById('login-main').style.display='none';
  document.getElementById('forgot-section').style.display='none';
  document.getElementById('signup-section').style.display='block';
  const err=document.getElementById('signup-error'); if(err) err.style.display='none';
}
function hideSignup() {
  setAuthMode('login');
  document.getElementById('signup-section').style.display='none';
  document.getElementById('forgot-section').style.display='none';
  document.getElementById('login-main').style.display='block';
}

async function doRecoveryReset() {
  const username=(document.getElementById('recovery-username')?.value||'').trim().toLowerCase();
  const code=(document.getElementById('recovery-code')?.value||'').trim();
  const password=(document.getElementById('recovery-password')?.value||'').trim();
  const errEl=document.getElementById('recovery-error');
  const fail=msg=>{ if(errEl){ errEl.textContent=msg; errEl.style.display='block'; } setRecoveryBusy(false); };
  if(errEl) errEl.style.display='none';
  if(!/^[a-z0-9._-]{3,32}$/.test(username)) return fail('Username must be 3-32 letters, numbers, dots, underscores, or hyphens.');
  if(!code) return fail('Recovery code is required.');
  if(password.length<8) return fail('Password must be at least 8 characters.');
  setRecoveryBusy(true);
  try {
    const result = await postAuthAction({ action:'reset_password', username, code, password });
    STAFF_ACCOUNTS[username]=normalizeAccount(username,result.account);
    await signInWithSupabaseAuth(username,password);
    await saveStaffAccounts();
    _clearLoginFailures(username);
    setRecoveryBusy(false);
    hideForgotPassword();
    setLoginSuccessState();
    enterApp({
      username,
      role: result.account.role,
      display: result.account.display,
      companyId: result.account.companyId,
      companyName: result.account.companyName,
      generalJobsCountries: result.account.generalJobsCountries,
      authUserId: result.account.authUserId,
    });
  } catch(e) {
    fail(e.message || 'Password reset failed.');
  }
}

async function sendRecoveryCodeEmail() {
  const username=(document.getElementById('recovery-username')?.value||'').trim().toLowerCase();
  const errEl=document.getElementById('recovery-error');
  const show = (msg, ok=false) => {
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.style.display = 'block';
    errEl.style.background = ok ? '#ECFDF5' : '#FFF1F3';
    errEl.style.color = ok ? '#047857' : '#A51232';
  };
  if(!/^[a-z0-9._-]{3,32}$/.test(username)) {
    show('Enter your username first.'); return;
  }
  try {
    await postAuthAction({ action:'send_recovery_email', username });
    show('If this account has a verified email, a recovery code has been sent.', true);
  } catch(e) {
    show(e.message || 'Could not send recovery email.');
  }
}

// â”€â”€ Centralised post-login entry point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Replaces three near-identical blocks that previously existed in doLogin,
// doSignup, and the DOMContentLoaded session-restore handler.
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function _saveSession(user) {
  safeSessionSet('dr_user', JSON.stringify({ ...user, _exp: Date.now() + SESSION_TTL_MS }));
}

function enterApp(user) {
  setCurrentUser(user);
  setCurrentWorkspace(currentUser);
  _saveSession(currentUser);
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('bottom-nav')?.classList.add('visible');
  setUserDisplay(currentUser.display, currentUser.role);
  appStorageMode = db ? 'cloud' : 'local';
  // Don't let a data-load failure surface as an unhandled rejection (which the
  // global handler would otherwise log as a scary generic error right after
  // sign-in). loadAllData handles cloud errors internally with a local
  // fallback; this catch covers any render/tail failure.
  loadAllData().catch(err => {
    console.error('Initial data load failed:', err);
    showToast('Some data could not be loaded. Tap refresh to retry.', 'error');
  });
}

// Refresh expiry on user activity (throttled to once per minute)
let _sessionTouchTimer = 0;
function _touchSession() {
  if (!currentUser) return;
  clearTimeout(_sessionTouchTimer);
  _sessionTouchTimer = setTimeout(() => _saveSession(currentUser), 60_000) as unknown as number;
}


async function doSignup() {
  await loadStaffAccounts();
  const companyName=(document.getElementById('signup-company').value||'').trim();
  const display=(document.getElementById('signup-name').value||'').trim();
  const username=(document.getElementById('signup-username').value||'').trim().toLowerCase();
  const password=(document.getElementById('signup-password').value||'').trim();
  const errEl=document.getElementById('signup-error');
  const fail=msg=>{ errEl.textContent=msg; errEl.style.display='block'; };
  if(!companyName) return fail('Company name is required.');
  if(!display) return fail('Your name is required.');
  if(!/^[a-z0-9._-]{3,32}$/.test(username)) return fail('Username must be 3-32 letters, numbers, dots, underscores, or hyphens.');
  const companyId=slugify(companyName);
  const generalJobsCountries=[...DEFAULT_COMPANY.generalJobsCountries];
  if(STAFF_ACCOUNTS[username]) return fail('That username is already taken.');
  if(password.length<8) return fail('Password must be at least 8 characters.');
  let authBacked = false;
  if (db?.auth) {
    try {
      const authResult = await postAuthAction({ action:'create_workspace', companyName, display, username, password });
      STAFF_ACCOUNTS[username]=normalizeAccount(username, authResult.account);
      await signInWithSupabaseAuth(username, password);
      authBacked = true;
    } catch (err) {
      console.warn('Supabase Auth workspace creation unavailable; using local account registry:', err);
    }
  }
  if (!authBacked) {
    STAFF_ACCOUNTS[username]=normalizeAccount(username,{role:'admin',display,companyId,companyName,generalJobsCountries});
    try {
      await setAccountPassword(STAFF_ACCOUNTS[username], password);
    } catch (err) {
      delete STAFF_ACCOUNTS[username];
      return fail(err.message || 'Password could not be secured. Use HTTPS and try again.');
    }
  }
  const signupAccount = normalizeAccount(username, {
    ...STAFF_ACCOUNTS[username],
    role: 'admin',
    display,
    companyId,
    companyName,
    generalJobsCountries,
  });
  STAFF_ACCOUNTS[username] = signupAccount;
  await saveStaffAccounts();
  errEl.style.display = 'none';
  enterApp({
    username,
    role: signupAccount.role,
    display: signupAccount.display,
    companyId: signupAccount.companyId,
    companyName: signupAccount.companyName,
    generalJobsCountries: signupAccount.generalJobsCountries,
    authUserId: signupAccount.authUserId,
  });
}

// â”€â”€ Login rate limiter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Persists failed attempts in localStorage so a page refresh does not reset
// the lockout. Lockout grows with successive violations (30s â†’ 5m â†’ 15m).
const MAX_FAILURES = 5;
const LOCKOUT_TIERS = [30_000, 5 * 60_000, 15 * 60_000]; // ms per violation tier

function _laKey(username) { return '_la_' + username; }
function _getAttempts(username) {
  try { return JSON.parse(safeLocalGet(_laKey(username)) || '{}'); } catch { return {}; }
}
function _saveAttempts(username, entry) {
  safeLocalSet(_laKey(username), JSON.stringify(entry));
}
function _recordLoginFailure(username) {
  const entry = _getAttempts(username);
  entry.count = (entry.count || 0) + 1;
  const tier = Math.min(entry.count - MAX_FAILURES, LOCKOUT_TIERS.length - 1);
  if (entry.count >= MAX_FAILURES) entry.lockedUntil = Date.now() + LOCKOUT_TIERS[Math.max(0, tier)];
  _saveAttempts(username, entry);
}
function _checkLoginLockout(username) {
  const entry = _getAttempts(username);
  if (!entry.lockedUntil || Date.now() >= entry.lockedUntil) return null;
  const secsLeft = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
  const minsLeft = Math.ceil(secsLeft / 60);
  return secsLeft > 90
    ? `Too many failed attempts. Try again in ${minsLeft} minute${minsLeft !== 1 ? 's' : ''}.`
    : `Too many failed attempts. Try again in ${secsLeft} seconds.`;
}
function _clearLoginFailures(username) {
  safeLocalRemove(_laKey(username));
}
function _remainingLoginAttempts(username) {
  const entry = _getAttempts(username);
  return Math.max(0, MAX_FAILURES - (entry.count || 0));
}

async function doLogin() {
  // Safety net: whatever goes wrong, never leave the button spinning forever.
  try {
    await _doLoginInner();
  } catch (err) {
    console.error('Login error:', err);
    const errEl = document.getElementById('login-error');
    if (errEl) { errEl.textContent = 'Sign-in failed. Please try again.'; errEl.style.display = 'block'; }
    setLoginBusy(false);
  }
}
async function _doLoginInner() {
  const username = (document.getElementById('username-input').value||'').trim().toLowerCase();
  const password = (document.getElementById('pw-input').value||'').trim();
  const errEl = document.getElementById('login-error');
  const fail = msg => { errEl.textContent = msg; errEl.style.display = 'block'; setLoginBusy(false); };
  setLoginBusy(true);
  errEl.style.display = 'none';

  const lockoutMsg = _checkLoginLockout(username);
  if (lockoutMsg) { fail(lockoutMsg); return; }

  if (BLOCKED_ADMIN_ALIASES.includes(username)) {
    fail(`Use ${DEFAULT_ADMIN_USERNAME} to sign in.`);
    return;
  }

  // â”€â”€ HARDCODED ACCOUNTS: verified directly, no cloud involved â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // These are defined at the top of this file and never touched by
  // loadStaffAccounts / saveStaffAccounts / Supabase Auth.
  // We read them from a frozen snapshot so runtime mutations cannot affect them.
  const hardcodedEntry = _HARDCODED_SNAPSHOT[username];
  if (hardcodedEntry) {
    let check = { ok: false };
    try {
      check = await verifyAccountPassword(hardcodedEntry, password);
    } catch (err) {
      fail(err.message || 'Login failed. Ensure you are on HTTPS.');
      return;
    }
    if (!check.ok) {
      _recordLoginFailure(username);
      const remaining = _remainingLoginAttempts(username);
      fail(`Incorrect username or password.${remaining > 0 ? ` (${remaining} attempt${remaining!==1?'s':''} left)` : ''}`);
      return;
    }
    _clearLoginFailures(username);
    // Kick off a background cloud load so staff data is available after login,
    // but don't block on it â€” the hardcoded account is already authoritative.
    loadStaffAccounts().catch(() => {});
    errEl.style.display = 'none';
    setLoginSuccessState();
    enterApp({ username, role: hardcodedEntry.role, display: hardcodedEntry.display, companyId: hardcodedEntry.companyId, companyName: hardcodedEntry.companyName, generalJobsCountries: hardcodedEntry.generalJobsCountries });
    return;
  }

  // â”€â”€ STAFF ACCOUNTS: loaded from cloud + localStorage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Best-effort: a failure here (e.g. RLS/network) must never block sign-in or
  // leave the button spinning â€” Supabase Auth below is the real credential check.
  try { await loadStaffAccounts(); } catch (e) { console.warn('loadStaffAccounts failed during login:', e); }

  // Try Supabase Auth first (gives us a live session token). Race against a
  // timeout so a hung network request can't leave the button spinning forever.
  try {
    const authLogin = await Promise.race([
      signInWithSupabaseAuth(username, password),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Sign-in timed out. Check your connection.')), 15000)),
    ]);
    if (authLogin?.account) {
      _clearLoginFailures(username);
      // Preserve password fields â€” Supabase Auth doesn't store them
      const prev = STAFF_ACCOUNTS[username] || {};
      STAFF_ACCOUNTS[username] = normalizeAccount(username, {
        ...authLogin.account,
        passwordHash: prev.passwordHash || '',
        passwordSalt: prev.passwordSalt || '',
        hashVersion:  prev.hashVersion  || '',
      });
      await saveStaffAccounts();
      errEl.style.display = 'none';
      setLoginSuccessState();
      enterApp({ username, role: authLogin.account.role, display: authLogin.account.display, companyId: authLogin.account.companyId, companyName: authLogin.account.companyName, generalJobsCountries: authLogin.account.generalJobsCountries, authUserId: authLogin.account.authUserId });
      return;
    }
  } catch (err) {
    console.warn('Supabase Auth unavailable; trying local registry:', err);
  }

  // Fall back to local STAFF_ACCOUNTS registry
  const account = STAFF_ACCOUNTS[username];
  if (!account) { fail('Account not found. Check your internet connection and try again.'); return; }
  let passwordCheck = { ok: false, migrated: false };
  try {
    passwordCheck = await verifyAccountPassword(account, password);
  } catch (err) {
    fail(err.message || 'Login failed.');
    return;
  }
  if (!passwordCheck.ok) {
    _recordLoginFailure(username);
    const remaining = _remainingLoginAttempts(username);
    fail(`Incorrect username or password.${remaining > 0 ? ` (${remaining} attempt${remaining!==1?'s':''} left)` : ''}`);
    return;
  }
  _clearLoginFailures(username);
  if (passwordCheck.migrated) await saveStaffAccounts();
  errEl.style.display = 'none';
  setLoginSuccessState();
  enterApp({ username, role: account.role, display: account.display, companyId: account.companyId, companyName: account.companyName, generalJobsCountries: account.generalJobsCountries });
}
function doLogout() {
  closeProfileDropdown();
  if (db?.auth) db.auth.signOut().catch(err => console.warn('Supabase sign out failed:', err));
  safeSessionRemove('dr_user'); setCurrentUser(null);
  history.replaceState(null, '', location.pathname);
  document.getElementById('app').style.display='none';
  document.getElementById('bottom-nav')?.classList.remove('visible');
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('pw-input').value='';
  document.getElementById('username-input').value='';
  document.getElementById('login-error').style.display='none';
  setLoginBusy(false);
  hideForgotPassword();
}

// Global safety net: log unexpected async failures so they aren't fully silent.
// We deliberately do NOT show a user-facing toast here â€” many background
// rejections (blocked writes, cancelled fetches) are benign, and a generic
// "something went wrong" on every one cries wolf. User-facing failures are
// reported by the specific code paths that own them (loadAllData, paymentsâ€¦).
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
});
window.addEventListener('error', (e) => {
  if (e?.error) console.error('Uncaught error:', e.error);
});

// â”€â”€ Accessible modal controller (dialog semantics, focus trap, Esc, restore) â”€â”€
let _modalReturnFocus = null;
function _openModals(){ return Array.from(document.querySelectorAll('.modal-bg.open')); }
function _focusablesIn(el){
  return Array.from(el.querySelectorAll(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
  )).filter(n => n.offsetWidth > 0 || n.offsetHeight > 0 || n === document.activeElement);
}
function _onModalOpen(el){
  _modalReturnFocus = document.activeElement;
  el.setAttribute('role','dialog');
  el.setAttribute('aria-modal','true');
  el.setAttribute('tabindex','-1');
  // Give the dialog an accessible name from its header if it has none.
  if (!el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
    const title = el.querySelector('.modal-header h1, .modal-header h2, .modal-header h3, .modal-header');
    const name = title?.textContent?.trim();
    if (name) el.setAttribute('aria-label', name);
  }
  const f = _focusablesIn(el);
  const target = f[0] || el;
  setTimeout(() => { try { target.focus(); } catch {} }, 0);
}
function _onModalClose(){
  const el = _modalReturnFocus;
  _modalReturnFocus = null;
  if (el && typeof el.focus === 'function') setTimeout(() => { try { el.focus(); } catch {} }, 0);
}
if (typeof MutationObserver !== 'undefined') {
  const obs = new MutationObserver(muts => {
    for (const m of muts) {
      const el = m.target;
      if (!el.classList || !el.classList.contains('modal-bg')) continue;
      const wasOpen = m.oldValue ? /\bopen\b/.test(m.oldValue) : false;
      const isOpen = el.classList.contains('open');
      if (isOpen && !wasOpen) _onModalOpen(el);
      else if (!isOpen && wasOpen) _onModalClose();
    }
  });
  window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.modal-bg').forEach(el => {
      obs.observe(el, { attributes:true, attributeFilter:['class'], attributeOldValue:true });
    });
  });
}
document.addEventListener('keydown', (e) => {
  const open = _openModals();
  if (!open.length) return;
  const top = open[open.length - 1];
  if (e.key === 'Escape') {
    e.preventDefault();
    if (typeof window.closeModal === 'function') window.closeModal(top.id); else top.classList.remove('open');
    return;
  }
  if (e.key === 'Tab') {
    const f = _focusablesIn(top);
    if (!f.length) { e.preventDefault(); top.focus(); return; }
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!top.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }
});

// â”€â”€ Delegated action dispatcher (H6: replacing inline on*= handlers) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Elements opt in with data-action="name" and read their own data-* args. Each
// handler migrated here removes an inline on*= attribute, ratcheting toward a
// CSP without script-src 'unsafe-inline'. Register new actions as modules move
// off inline handlers (see tests/check-inline-handlers.cjs).
const DRECO_ACTIONS = {
  'modal.close': (el) => {
    const id = el.getAttribute('data-modal') || el.closest('.modal-bg')?.id;
    if (id) closeModal(id);
  },
  'tab.switch': (el) => {
    const t = el.getAttribute('data-tab');
    if (t && typeof window.switchTab === 'function') window.switchTab(t);
  },
  'pipeline.retry': () => window.renderPipelinePage?.(),
  'doc.mark': (el) => {
    if (typeof window.drecoMarkDocComplete === 'function') {
      window.drecoMarkDocComplete(
        el.getAttribute('data-type'),
        el.getAttribute('data-id'),
        el.getAttribute('data-doc'),
        el.getAttribute('data-complete') === '1'
      );
    }
  },
  'account.email.request': () => requestAccountEmailVerification(),
  'account.email.verify': () => verifyAccountEmail(),
  'traveldate.close': () => window.closeTravelDatePrompt?.(),
  'traveldate.save': () => window.submitTravelDatePrompt?.(),
  'team.edit': (el) => window.openEditTeamMember?.(el.getAttribute('data-username')),
  'team.remove': (el) => window.removeTeamMember?.(el.getAttribute('data-username') || (document.getElementById('edit-team-username') as HTMLInputElement)?.value),
  'settings.general.country': (el) => {
    const c = el.getAttribute('data-country');
    if (c) { window.settingsGeneralCountry = c; renderSettingsPage?.(); }
  },
  // Finance page interactions (delegated so the finance render adds no new
  // inline on*= handlers â€” keeps the CSP handler ratchet flat).
  'finance.tab': (el) => window.setFinanceTab?.(el.getAttribute('data-fintab')),
  'finance.open': (el) => {
    const t = el.getAttribute('data-type'), id = Number(el.getAttribute('data-id'));
    if (t === 'pro') window.editPro?.(id); else window.editLB?.(id);
  },
  'finance.pay': (el) => window.openBalancePayment?.(el.getAttribute('data-type'), Number(el.getAttribute('data-id'))),
  'finance.pos': (el) => window.setFinancePosition?.(el.getAttribute('data-pos')),
  // Payments (commission installment ledger) interactions.
  'payments.tab': (el) => window.setPaymentsTab?.(el.getAttribute('data-ptab')),
  'installment.add': (el) => window.openAddPayment?.(Number(el.getAttribute('data-id'))),
  // Installment view/edit popup (the table cell just opens this).
  'installment.view': (el) => openInstallmentModal(Number(el.getAttribute('data-id')), Number(el.getAttribute('data-idx')), false),
  'inst.edit': () => { const m = document.getElementById('installment-modal'); if (m) openInstallmentModal(Number(m.dataset.id), Number(m.dataset.idx), true); },
  'inst.viewmode': () => { const m = document.getElementById('installment-modal'); if (m) openInstallmentModal(Number(m.dataset.id), Number(m.dataset.idx), false); },
  'inst.save': async () => {
    const m = document.getElementById('installment-modal'); if (!m) return;
    const amt = (document.getElementById('inst-e-amount') as HTMLInputElement)?.value;
    const date = (document.getElementById('inst-e-date') as HTMLInputElement)?.value;
    if (await saveInstallmentEdit(Number(m.dataset.id), Number(m.dataset.idx), amt, date)) closeModal('installment-modal');
  },
  'inst.remove': async () => {
    const m = document.getElementById('installment-modal'); if (!m) return;
    const id = Number(m.dataset.id), idx = Number(m.dataset.idx);
    closeModal('installment-modal');
    await removeCommissionInstallment(id, idx);
  },
};
window.DRECO_ACTIONS = DRECO_ACTIONS;
document.addEventListener('click', (e) => {
  const el = e.target?.closest?.('[data-action]');
  if (!el) return;
  const fn = DRECO_ACTIONS[el.getAttribute('data-action')];
  if (fn) fn(el, e);
});

window.addEventListener('DOMContentLoaded', async () => {
  await loadRuntimeConfig();
  await loadStaffAccounts();
  initLoginInteractions();
  safeLocalRemove('dr_user'); // migrate: clear any old localStorage session
  const saved=safeSessionGet('dr_user');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed._exp && Date.now() > parsed._exp) throw new Error('Session expired');
      const account = STAFF_ACCOUNTS[parsed.username] || parsed;
      enterApp({
        username: parsed.username,
        role: account.role || parsed.role || 'staff',
        display: account.display || parsed.display || parsed.username,
        companyId: account.companyId || parsed.companyId,
        companyName: account.companyName || parsed.companyName,
        generalJobsCountries: account.generalJobsCountries || parsed.generalJobsCountries,
        authUserId: account.authUserId || parsed.authUserId,
      });
    } catch { safeSessionRemove('dr_user'); }
  }
  // Extend session on activity; check expiry when tab becomes visible again
  ['click','keydown','touchstart'].forEach(ev =>
    document.addEventListener(ev, _touchSession, { passive: true })
  );
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !currentUser) return;
    try {
      const p = JSON.parse(safeSessionGet('dr_user') || '{}');
      if (p._exp && Date.now() > p._exp) doLogout();
    } catch { doLogout(); }
  });
  rebuildStageSelects();
  // Delegated listener for docs buttons â€“ avoids interpolating candidate names
  // into onclick attribute strings (XSS risk).
  document.addEventListener('click', e => {
    const btn = e.target.closest('.dreco-open-docs');
    if (!btn) return;
    e.stopPropagation();
    openDocs(btn.dataset.type, Number(btn.dataset.id), btn.dataset.name || '');
  });
  ['pro-modal','lb-modal','docs-modal','settings-modal','help-modal'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.addEventListener('click',e=>{ if(e.target===el) closeModal(id); });
  });
  document.getElementById('profile-dropdown')?.addEventListener('click',e=>e.stopPropagation());
  bindModalSummaries();
});

// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
// DATA LOADING
// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
async function loadAllData() {
  if (!useCloud()) {
    appStorageMode='local';
    const local = loadLocalStore();
    setProDB(local.pro);
    setLbDB(local.lb);
    setAllDocs(local.docs);
    setAllTimelines(local.timelines);
    setProStages(normalizeProStageList(local.proStages));
    setLbStages(local.lbStages);
    setGeneralWorkflows(local.generalWorkflows || {});
    setPaymentRules(local.paymentRules);
    rebuildStageSelects();
    restoreUserFilters();
    hideLoading();
    updateNotificationBadge();
    if (typeof window.dv5Init === 'function') window.dv5Init();
    switchTab(location.hash ? location.hash.slice(1) : 'dash', false);
    return;
  }
  showLoading('Loading candidates...');
  try {
    const companyId = getCompanyId();
    const proQuery = db.from('pro_candidates').select('*').order('id');
    const lbQuery = db.from('lb_candidates').select('*').order('id');
    const docsQuery = db.from('documents').select('*');
    const timelinesQuery = db.from('timelines').select('*');
    if (companyId === DEFAULT_COMPANY.id) {
      proQuery.or(`company_id.eq.${companyId},company_id.is.null`);
      lbQuery.or(`company_id.eq.${companyId},company_id.is.null`);
    } else {
      proQuery.eq('company_id', companyId);
      lbQuery.eq('company_id', companyId);
      docsQuery.like('key', `${companyId}:%`);
      timelinesQuery.like('key', `${companyId}:%`);
    }
    const [proRes,lbRes,docsRes,tlRes,stagesRes]=await Promise.all([
      proQuery,
      lbQuery,
      docsQuery,
      timelinesQuery,
      db.from('app_settings').select('*'),
    ]);
    appStorageMode='cloud';
    lastSyncError='';
    if (proRes.error) console.warn('pro_candidates query error:', proRes.error);
    if (lbRes.error)  console.warn('lb_candidates query error:', lbRes.error);
    if (proRes.data&&proRes.data.length>0) setProDB(proRes.data.map(normalizeProRecord)); else if(companyId===DEFAULT_COMPANY.id) await seedProData(); else setProDB([]);
    if (lbRes.data&&lbRes.data.length>0)   setLbDB(lbRes.data.map(normalizeLBRecord));   else if(companyId===DEFAULT_COMPANY.id) await seedLBData(); else setLbDB([]);
    setAllDocs({});
    setAllTimelines({});
    setAllChecklists({});
    if (docsRes.data) docsRes.data.forEach(r=>{
      const rawKey = (companyId===DEFAULT_COMPANY.id&&!String(r.key).includes(':')) ? r.key
        : (String(r.key).startsWith(`${companyId}:`) ? stripCompanyScopedKey(r.key) : null);
      if (!rawKey) return;
      if (rawKey.startsWith('checklist_')) allChecklists[rawKey] = r.data;
      else allDocs[rawKey] = r.data;
    });
    if (tlRes.data)     tlRes.data.forEach(r=>{ if(companyId===DEFAULT_COMPANY.id&&!String(r.key).includes(':')) allTimelines[r.key]=r.entries; else if(String(r.key).startsWith(`${companyId}:`)) allTimelines[stripCompanyScopedKey(r.key)]=r.entries; });
    if (stagesRes.data) {
      const ps=stagesRes.data.find(r=>r.key===getCompanyScopedKey('pro_stages')) || stagesRes.data.find(r=>r.key==='pro_stages'&&companyId===DEFAULT_COMPANY.id);
      const ls=stagesRes.data.find(r=>r.key===getCompanyScopedKey('lb_stages')) || stagesRes.data.find(r=>r.key==='lb_stages'&&companyId===DEFAULT_COMPANY.id);
      const gw=stagesRes.data.find(r=>r.key===getCompanyScopedKey('general_workflows')) || stagesRes.data.find(r=>r.key==='general_workflows'&&companyId===DEFAULT_COMPANY.id);
      const pr=stagesRes.data.find(r=>r.key===getCompanyScopedKey('payment_rules')) || stagesRes.data.find(r=>r.key==='payment_rules'&&companyId===DEFAULT_COMPANY.id);
      const dr=stagesRes.data.find(r=>r.key===getCompanyScopedKey('doc_requirements')) || stagesRes.data.find(r=>r.key==='doc_requirements'&&companyId===DEFAULT_COMPANY.id);
      const emp=stagesRes.data.find(r=>r.key===getCompanyScopedKey('employers'));
      const jo=stagesRes.data.find(r=>r.key===getCompanyScopedKey('job_orders'));
      if (ps) setProStages(normalizeProStageList(ps.value));
      if (ls) setLbStages(ls.value);
      setGeneralWorkflows(gw && gw.value && typeof gw.value==='object' && !Array.isArray(gw.value) ? gw.value : {});
      if (pr) setPaymentRules(pr.value); else setPaymentRules(getDefaultPaymentRules());
      if (dr) docRequirements = dr.value; else docRequirements = { pro: [...DEFAULT_DOC_REQUIREMENTS.pro], lb: [...DEFAULT_DOC_REQUIREMENTS.lb] };
      setEmployers(emp ? (Array.isArray(emp.value) ? emp.value : []) : []);
      setJobOrders(jo ? (Array.isArray(jo.value) ? jo.value : []) : []);
    }
  } catch(err) {
    console.warn('Supabase error, falling back to local data:',err);
    appStorageMode='local';
    lastSyncError=err.message||'Supabase connection failed';
    const local=loadLocalStore();
    setProDB(local.pro);
    setLbDB(local.lb);
    setAllDocs(local.docs);
    setAllTimelines(local.timelines);
    setAllChecklists(local.checklists || {});
    if (local.docRequirements) docRequirements = local.docRequirements;
    setProStages(normalizeProStageList(local.proStages));
    setLbStages(local.lbStages);
    setGeneralWorkflows(local.generalWorkflows || {});
    setPaymentRules(local.paymentRules);
    showToast('Cloud sync unavailable. Using local mode.','error');
  }
  rebuildStageSelects();
  restoreUserFilters();
  hideLoading();
  updateNotificationBadge();
  // Signal DV5 that data is ready - ensure sidebar and sections exist before render
  if (typeof window.dv5Init === 'function') window.dv5Init();
  switchTab(location.hash ? location.hash.slice(1) : 'dash', false);
}

window.refreshDrecoData = async function refreshDrecoData() {
  const btn = document.getElementById('topbar-refresh-btn');
  btn?.classList.add('is-spinning');
  try {
    await loadAllData();
    showToast('Workspace refreshed', 'success');
  } catch (err) {
    console.error('Refresh failed:', err);
    showToast('Refresh failed', 'error');
  } finally {
    btn?.classList.remove('is-spinning');
  }
};

function normalizeDateField(v) {
  if (v===''||v===null||v===undefined) return null;
  if (typeof v==='number') return xlToISO(v);
  return v;
}
async function seedProData() {
  const seed=JSON.parse(JSON.stringify(PRO_SEED)).map(r=>{
    ['submitted','interview','ol','mol','visa','travel'].forEach(f=>r[f]=normalizeDateField(r[f]));
    if(r.commission==='') r.commission=null; if(r.paid==='') r.paid=null; r.company_id=getCompanyId(); delete r.id; return r;
  });
  const {data,error}=await db.from('pro_candidates').insert(seed).select();
  if(data&&data.length) setProDB(data.map(normalizeProRecord)); else { console.warn('Seed insert failed',error); setProDB(JSON.parse(JSON.stringify(PRO_SEED)).map(normalizeProRecord)); }
}
async function seedLBData() {
  const seed=JSON.parse(JSON.stringify(LB_SEED)).map(r=>{
    ['travelDate','r1Date','r2Date'].forEach(f=>r[f]=normalizeDateField(r[f])); r.company_id=getCompanyId(); r.country=getGeneralJobsCountries()[0]||'General'; delete r.id; return r;
  });
  const {data,error}=await db.from('lb_candidates').insert(seed).select();
  if(data&&data.length) setLbDB(data.map(normalizeLBRecord)); else { console.warn('Seed insert failed',error); setLbDB(JSON.parse(JSON.stringify(LB_SEED)).map(normalizeLBRecord)); }
}

// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
// SAVE STATUS
// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
function setSaveStatus(s) {
  const dot=document.getElementById('save-dot');
  const lbl=document.getElementById('save-label');
  if (!dot||!lbl) return;
  dot.className='save-dot'+(s==='saving'?' saving':'');
  lbl.textContent=s==='saving'?'Saving...':`${appStorageMode==='cloud'?'Cloud saved':'Local saved'} ${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`;
}

// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
// SUPABASE WRITES
// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
function useCloud() { return db && appStorageMode==='cloud'; }

// Map in-memory pro record â†’ DB column names. Core fields match the original schema;
// extended fields use snake_case and require dreco-schema-v2-migration.sql to be run.
function toProDbPayload(rec) {
  return {
    company_id: rec.company_id,
    name: rec.name, pp: rec.pp, phone: rec.phone||null,
    position: rec.position, company: rec.company, country: rec.country||null,
    stage: rec.stage,
    submitted: rec.submitted||null, interview: rec.interview||null,
    ol: rec.ol||null, mol: rec.mol||null, visa: rec.visa||null, travel: rec.travel||null,
    commission: rec.commission, paid: rec.paid,
    paid1: rec.paid1??null, paid2: rec.paid2??null,
    paid1_date: rec.paid1_date||null, paid2_date: rec.paid2_date||null,
    commission_payments: Array.isArray(rec.commissionPayments) ? rec.commissionPayments : null,
    medical: rec.medical||null,
    airline: rec.airline||null,
    follow_up: rec.followUp||null,
    travel_time: rec.travelTime||null,
    travel_notes: rec.travelNotes||null,
  };
}
// Core-only pro payload â€” used as fallback when extended columns haven't been migrated yet.
function toProCorePayload(rec) {
  return {
    company_id: rec.company_id,
    name: rec.name, pp: rec.pp, phone: rec.phone||null,
    position: rec.position, company: rec.company, country: rec.country||null,
    stage: rec.stage,
    submitted: rec.submitted||null, interview: rec.interview||null,
    ol: rec.ol||null, mol: rec.mol||null, visa: rec.visa||null, travel: rec.travel||null,
    commission: rec.commission, paid: rec.paid,
  };
}

// Map in-memory lb record â†’ DB column names.
// lb_candidates uses quoted camelCase for original columns and snake_case for new ones.
function toLBDbPayload(rec) {
  return {
    company_id: rec.company_id, country: rec.country,
    name: rec.name, phone: rec.phone||null,
    ppStatus: rec.ppStatus||'APPLIED',
    travelStatus: rec.travelStatus||rec.stage||'DOCS SUBMITTED',
    stage: rec.stage||rec.travelStatus||'DOCS SUBMITTED',
    travelDate: rec.travelDate||null,
    toRefund: rec.toRefund??0,
    r1Date: rec.r1Date||null, r1Amt: rec.r1Amt??0,
    r2Date: rec.r2Date||null, r2Amt: rec.r2Amt??0,
    notes: rec.notes||null,
    own_passport: !!rec.own_passport,
    follow_up: rec.followUp||null,
    refundPayments: Array.isArray(rec.refundPayments) ? rec.refundPayments : [],
    submitted_date: rec.submitted_date||null,
    selected_date: rec.selected_date||null,
    passport_date: rec.passport_date||null,
    visa_date: rec.visa_date||null,
  };
}
// Core-only lb payload â€” used as fallback when extended columns haven't been migrated yet.
function toLBCorePayload(rec) {
  return {
    company_id: rec.company_id, country: rec.country,
    name: rec.name, phone: rec.phone||null,
    ppStatus: rec.ppStatus||'APPLIED',
    travelStatus: rec.travelStatus||rec.stage||'DOCS SUBMITTED',
    stage: rec.stage||rec.travelStatus||'DOCS SUBMITTED',
    travelDate: rec.travelDate||null,
    toRefund: rec.toRefund??0,
    r1Date: rec.r1Date||null, r1Amt: rec.r1Amt??0,
    r2Date: rec.r2Date||null, r2Amt: rec.r2Amt??0,
    notes: rec.notes||null,
  };
}
// Returns true for Supabase/PostgREST "column not found" errors.
function isMissingColumnError(e) {
  return e.code==='PGRST204' || e.code==='42703' ||
    (typeof e.message==='string' && (e.message.includes('column') || e.message.includes('does not exist')));
}
async function dbInsert(table, rec) {
  const ts={...rec, company_id:getCompanyId()}; delete ts.id;
  const {data,error}=await db.from(table).insert(ts).select().single();
  if(error) throw error;
  return data;
}
// Optimistic concurrency (M3): when opts.expectedUpdatedAt is provided AND the
// row's updated_at no longer matches, the update affects 0 rows and we raise a
// DRECO_CONFLICT so callers can prompt before clobbering someone else's edit.
// The guard is inert until the updated_at column exists (expected is undefined),
// so this is a no-op on databases that haven't run dreco-optimistic-locking.sql.
async function dbUpdate(table, id, rec, opts={}) {
  const ts={...rec, company_id:getCompanyId()}; delete ts.id; delete ts.updated_at;
  let q = db.from(table).update(ts).eq('id',id).eq('company_id',getCompanyId());
  if (opts.expectedUpdatedAt) q = q.eq('updated_at', opts.expectedUpdatedAt);
  const {data,error}=await q.select();
  if(error) throw error;
  if (opts.expectedUpdatedAt && (!data || !data.length)) {
    const err=new Error('This record was changed by someone else since you opened it.');
    err.code='DRECO_CONFLICT';
    throw err;
  }
  return (data && data[0]) || null;
}
async function dbDelete(table, id) {
  const {error}=await db.from(table).delete().eq('id',id).eq('company_id',getCompanyId());
  if(error) throw error;
}
async function deleteCandidateArtifacts(type, id) {
  const key = `${type}_${id}`;
  delete allDocs[key];
  delete allTimelines[key];
  if (useCloud()) {
    const scoped = getCompanyScopedKey(key);
    await Promise.allSettled([
      db.from('documents').delete().in('key', [key, scoped]),
      db.from('timelines').delete().in('key', [key, scoped]),
    ]);
  } else {
    saveLocalStore();
  }
}
function fallBackToLocal(err) {
  console.error(err);
  appStorageMode = 'local';
  lastSyncError = err.message || 'Supabase write failed';
  saveLocalStore();
  showToast('Cloud save failed. Saved locally instead.', 'error');
  // Keep a visible persistent indicator so users know they are in degraded mode
  const dot = document.getElementById('save-dot');
  const lbl = document.getElementById('save-label');
  if (dot) dot.className = 'save-dot save-dot-warn';
  if (lbl) lbl.textContent = 'Local only â€“ cloud unavailable';
}
async function saveProRecord(rec, isUpdate = false) {
  setSaveStatus('saving');
  if (!useCloud()) { saveLocalStore(); setSaveStatus('saved'); return true; }
  const tempId = rec.id;
  async function doProSave(payload, guarded=true) {
    if (isUpdate) {
      const cur = proDB.find(x=>String(x.id)===String(rec.id));
      const expected = guarded ? cur?.updated_at : null;
      const row = await dbUpdate('pro_candidates', rec.id, payload, { expectedUpdatedAt: expected });
      if (row?.updated_at && cur) cur.updated_at = row.updated_at;
    } else {
      const data = await dbInsert('pro_candidates', payload);
      if (data) {
        const oldId = rec.id; rec.id = data.id;
        const i = proDB.findIndex(x=>x.id==oldId); if(i>-1) proDB[i].id = data.id;
        if(allTimelines[`pro_${tempId}`]){allTimelines[`pro_${rec.id}`]=allTimelines[`pro_${tempId}`];delete allTimelines[`pro_${tempId}`];}
        renderPro();
      }
    }
  }
  const saveWith = async (payloadFn, guarded) => { await doProSave(payloadFn(rec), guarded); await saveTimeline(`pro_${rec.id}`); setSaveStatus('saved'); };
  try {
    await saveWith(toProDbPayload, true);
  } catch(e) {
    if (e?.code === 'DRECO_CONFLICT') {
      if (!confirm('This candidate was changed by someone else since you opened it. Overwrite their changes?')) {
        setSaveStatus('saved'); showToast('Save cancelled â€” reload to see the latest.', 'error'); return false;
      }
      try { await saveWith(toProDbPayload, false); }
      catch(e2) {
        if (isMissingColumnError(e2)) { try { await saveWith(toProCorePayload, false); } catch(e3){ fallBackToLocal(e3); setSaveStatus('saved'); } }
        else { fallBackToLocal(e2); setSaveStatus('saved'); }
      }
    } else if (isMissingColumnError(e)) {
      try { await saveWith(toProCorePayload, true); showToast('Saved (run dreco-schema-v2-migration.sql in Supabase to enable all fields)', 'error'); }
      catch(e2) { fallBackToLocal(e2); setSaveStatus('saved'); }
    } else { fallBackToLocal(e); setSaveStatus('saved'); }
  }
  return true;
}
async function saveLBRecord(rec, isUpdate = false) {
  setSaveStatus('saving');
  if (!useCloud()) { saveLocalStore(); setSaveStatus('saved'); return true; }
  const tempId = rec.id;
  async function doLBSave(payload, guarded=true) {
    if (isUpdate) {
      const cur = lbDB.find(x=>String(x.id)===String(rec.id));
      const expected = guarded ? cur?.updated_at : null;
      const row = await dbUpdate('lb_candidates', rec.id, payload, { expectedUpdatedAt: expected });
      if (row?.updated_at && cur) cur.updated_at = row.updated_at;
    } else {
      const data = await dbInsert('lb_candidates', payload);
      if (data) {
        const oldId = rec.id; rec.id = data.id;
        const i = lbDB.findIndex(x=>x.id==oldId); if(i>-1) lbDB[i].id = data.id;
        if(allTimelines[`lb_${tempId}`]){allTimelines[`lb_${rec.id}`]=allTimelines[`lb_${tempId}`];delete allTimelines[`lb_${tempId}`];}
        renderLB();
      }
    }
  }
  const saveWith = async (payloadFn, guarded) => { await doLBSave(payloadFn(rec), guarded); await saveTimeline(`lb_${rec.id}`); setSaveStatus('saved'); };
  try {
    await saveWith(toLBDbPayload, true);
  } catch(e) {
    if (e?.code === 'DRECO_CONFLICT') {
      if (!confirm('This candidate was changed by someone else since you opened it. Overwrite their changes?')) {
        setSaveStatus('saved'); showToast('Save cancelled â€” reload to see the latest.', 'error'); return false;
      }
      try { await saveWith(toLBDbPayload, false); }
      catch(e2) {
        if (isMissingColumnError(e2)) { try { await saveWith(toLBCorePayload, false); } catch(e3){ fallBackToLocal(e3); setSaveStatus('saved'); } }
        else { fallBackToLocal(e2); setSaveStatus('saved'); }
      }
    } else if (isMissingColumnError(e)) {
      try { await saveWith(toLBCorePayload, true); showToast('Saved (run dreco-schema-v2-migration.sql in Supabase to enable all fields)', 'error'); }
      catch(e2) { fallBackToLocal(e2); setSaveStatus('saved'); }
    } else { fallBackToLocal(e); setSaveStatus('saved'); }
  }
  return true;
}
async function deleteProRecord(id) {
  setSaveStatus('saving');
  try {
    await deleteCandidateArtifacts('pro', id);
    if (!useCloud()) { saveLocalStore(); setSaveStatus('saved'); return; }
    await dbDelete('pro_candidates', id);
    setSaveStatus('saved');
  } catch (e) { fallBackToLocal(e); setSaveStatus('saved'); }
}
async function deleteLBRecord(id) {
  setSaveStatus('saving');
  try {
    await deleteCandidateArtifacts('lb', id);
    if (!useCloud()) { saveLocalStore(); setSaveStatus('saved'); return; }
    await dbDelete('lb_candidates', id);
    setSaveStatus('saved');
  } catch (e) { fallBackToLocal(e); setSaveStatus('saved'); }
}
async function saveDocsToDB(key, data) {
  setSaveStatus('saving');
  if (!useCloud()) { saveLocalStore(); setSaveStatus('saved'); return; }
  try {
    const { error } = await db.from('documents').upsert(
      { key: getCompanyScopedKey(key), data, company_id: getCompanyId() },
      { onConflict: 'key' }
    );
    if (error) throw error;
    setSaveStatus('saved');
  } catch (e) { fallBackToLocal(e); setSaveStatus('saved'); }
}

// â”€â”€ Document Checklists â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The candidate "Docs" tab is now a lightweight VIEW over the single document
// system (dv5: DOC_DEFS + uploaded/marked items), so the checklist, the upload
// modal, and the readiness gauge always agree. Toggling a row marks a required
// document complete without a file (via the shared doc.mark action); a real
// uploaded file shows as "On file" and is managed in the upload panel.
function getDocProgress(type, id) {
  const c = (typeof window.drecoDocCompletion === 'function') ? window.drecoDocCompletion(type, id) : null;
  return c ? { done: c.done, total: c.total } : { done: 0, total: 0 };
}
function renderDocChecklist(type, id) {
  if (!id) return '<div class="tl-empty">Save the candidate first to manage documents.</div>';
  const defs = (typeof window.drecoDocDefs === 'function' ? window.drecoDocDefs(type) : []) || [];
  const items = (typeof window.drecoCandidateDocs === 'function' ? window.drecoCandidateDocs(type, id) : {}) || {};
  const { done, total } = getDocProgress(type, id);
  const rec = (type === 'pro' ? (window.proDB || proDB) : (window.lbDB || lbDB)).find(r => String(r.id) === String(id));
  const rows = defs.map(([key, label]) => {
    const it = items[key];
    const onFile = !!(it && !it.markedComplete);   // a real uploaded file
    const checked = !!it;
    // Real files are managed in the upload panel; marked/missing rows toggle
    // the completion mark via the shared doc.mark delegated action.
    const attrs = onFile ? '' : ` data-action="doc.mark" data-type="${type}" data-id="${id}" data-doc="${escHTML(key)}" data-complete="${checked ? '0' : '1'}"`;
    const icon = onFile ? 'ti-circle-check' : (checked ? 'ti-square-check' : 'ti-square');
    const tag = onFile ? '<span class="doc-check-tag">On file</span>' : (checked ? '<span class="doc-check-tag marked">Marked</span>' : '');
    return `<button type="button" class="doc-check-item${onFile ? ' on-file' : ''}"${attrs}>
      <i class="ti ${icon}"></i>
      <span class="doc-check-label${checked ? ' doc-check-done' : ''}">${escHTML(label)}</span>
      ${tag}
    </button>`;
  }).join('');
  return `<div class="doc-checklist">
    <div class="doc-checklist-head">
      <span class="doc-checklist-title">Required Documents</span>
      <span class="doc-checklist-progress${done===total&&total>0?' doc-check-all-done':''}">${done}/${total} collected</span>
    </div>
    ${rows}
    <div class="doc-checklist-foot">
      <button type="button" class="dreco-open-docs doc-checklist-upload" data-type="${type}" data-id="${id}" data-name="${escHTML(rec?.name || '')}"><i class="ti ti-upload"></i>Upload or view files</button>
    </div>
  </div>`;
}

// â”€â”€ Commission / Payment Status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderCommissionStatus(r) {
  const el = document.getElementById('pro-commission-status'); if (!el) return;
  if (!r || !r.commission) { el.innerHTML = ''; return; }
  const ps = proPaymentStatus(r);
  const pctColor = ps.dueNow > 0 ? '#b91c1c' : '#16a34a';
  el.innerHTML = `<div class="commission-status-card">
    <div class="cs-row"><span>Total Commission</span><strong>${moneyKES(ps.commission)}</strong></div>
    <div class="cs-row"><span>Expected at this stage (${ps.expectedPercent}%)</span><strong>${moneyKES(ps.expected)}</strong></div>
    <div class="cs-row"><span>Paid so far</span><strong style="color:#16a34a">${moneyKES(ps.paid)}</strong></div>
    <div class="cs-row cs-row-highlight" style="border-top:1px solid #e5e7eb;padding-top:8px;margin-top:4px">
      <span>Due now</span><strong style="color:${pctColor}">${moneyKES(ps.dueNow)}</strong>
    </div>
    <div class="cs-row"><span>Full outstanding</span><strong style="color:${ps.outstanding>0?'#b91c1c':'#6b7280'}">${moneyKES(ps.outstanding)}</strong></div>
  </div>`;
}

// â”€â”€ Per-Candidate P&L â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderCandidateCommissionInstallments(r) {
  const el = document.getElementById('pro-installments-section'); if (!el) return;
  if (!r?.id) {
    el.innerHTML = `<div class="commission-installments-card">
      <div class="commission-installments-head">
        <div><strong>Commission installments</strong><small>Save the candidate first, then record payments here.</small></div>
      </div>
      <div class="commission-installments-empty">No candidate selected.</div>
    </div>`;
    return;
  }
  const payments = Array.isArray(r.commissionPayments) ? r.commissionPayments : [];
  const paid = proPaidAmount(r);
  const outstanding = proBalance(r);
  el.innerHTML = `<div class="commission-installments-card">
    <div class="commission-installments-head">
      <div>
        <strong>Commission installments</strong>
        <small>${moneyKES(paid)} received Â· ${moneyKES(outstanding)} outstanding</small>
      </div>
      <button class="dv5-action-btn" data-action="installment.add" data-id="${r.id}"><i class="ti ti-plus"></i>Add installment</button>
    </div>
    ${payments.length ? payments.map((p,i)=>`
      <div class="commission-installment-row">
        <span class="commission-installment-index">${i + 1}</span>
        <span class="commission-installment-meta">
          <strong>${escHTML(i === 0 ? 'First installment' : i === 1 ? 'Second installment' : `Installment ${i + 1}`)}</strong>
          <span>${p.date ? `Paid ${escHTML(fmtDate(String(p.date).slice(0,10)))}` : 'Payment date not set'}</span>
        </span>
        <strong class="commission-installment-amount">${moneyKES(p.amount)}</strong>
        <button class="dv5-action-btn" data-action="installment.view" data-id="${r.id}" data-idx="${i}"><i class="ti ti-pencil"></i>Edit</button>
      </div>`).join('') : '<div class="commission-installments-empty">No installments recorded yet.</div>'}
  </div>`;
}

function refreshOpenProCommissionTab() {
  if (!editingProId) return;
  const modal = document.getElementById('pro-modal');
  const tab = document.getElementById('pro-tab-commission');
  if (!modal?.classList.contains('open') || !tab || tab.style.display === 'none') return;
  const r = proDB.find(x=>x.id==editingProId);
  if (!r) return;
  renderCommissionStatus(r);
  renderCandidateCommissionInstallments(r);
  renderCandidatePL('pro', editingProId);
}

function getCandidateExpenses(type, id) {
  return Array.isArray(allDocs[`expenses_${type}_${id}`]) ? allDocs[`expenses_${type}_${id}`] : [];
}
function renderCandidatePL(type, id) {
  const el = document.getElementById('pro-pl-section'); if (!el) return;
  if (!id) { el.innerHTML = ''; return; }
  const r = proDB.find(x=>x.id==id); if (!r) return;
  const commission = Number(r.commission)||0;
  const expenses = getCandidateExpenses(type, id);
  const totalExp = expenses.reduce((s,e)=>s+(Number(e.amount)||0),0);
  const net = commission - totalExp;
  el.innerHTML = `<div class="commission-status-card" style="margin-top:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong style="font-size:12px">P&amp;L â€” Candidate Expenses</strong>
      <button class="dv5-action-btn" onclick="openAddCandidateExpense('${type}',${id})">+ Add expense</button>
    </div>
    ${expenses.length ? expenses.map((e,i)=>`<div class="cs-row" style="font-size:11.5px">
      <span>${escHTML(e.label||'Expense')}</span>
      <span style="display:flex;align-items:center;gap:6px">
        <strong style="color:#b91c1c">${moneyKES(e.amount)}</strong>
        <button onclick="removeCandidateExpense('${type}',${id},${i})" style="font-size:10px;border:none;background:none;cursor:pointer;color:#9ca3af;padding:0">Ã—</button>
      </span>
    </div>`).join('') : '<div class="cs-row" style="color:var(--text-3);font-size:11.5px"><span>No expenses recorded</span></div>'}
    <div class="cs-row" style="border-top:1px solid #e5e7eb;padding-top:8px;margin-top:4px">
      <span>Total expenses</span><strong style="color:#b91c1c">${moneyKES(totalExp)}</strong>
    </div>
    <div class="cs-row">
      <span>Net (Commission âˆ’ Expenses)</span><strong style="color:${net>=0?'#16a34a':'#b91c1c'}">${moneyKES(net)}</strong>
    </div>
  </div>`;
}
function openAddCandidateExpense(type, id) {
  const label = prompt('Expense label (e.g. Medical test)');
  if (!label) return;
  const amount = prompt('Amount (KES)');
  if (!amount || isNaN(Number(amount))) { showToast('Invalid amount','error'); return; }
  addCandidateExpense(type, id, label.trim(), Number(amount));
}
async function addCandidateExpense(type, id, label, amount) {
  const key = `expenses_${type}_${id}`;
  const list = getCandidateExpenses(type, id);
  list.push({ label, amount, date: new Date().toISOString().slice(0,10) });
  allDocs[key] = list;
  renderCandidatePL(type, id);
  await saveDocsToDB(key, list);
}
async function removeCandidateExpense(type, id, index) {
  const key = `expenses_${type}_${id}`;
  const list = getCandidateExpenses(type, id);
  list.splice(index, 1);
  allDocs[key] = list;
  renderCandidatePL(type, id);
  await saveDocsToDB(key, list);
}

// â”€â”€ Employer / Job Order CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function saveEmployersData() {
  setSaveStatus('saving');
  if (!useCloud()) { saveLocalStore(); setSaveStatus('saved'); return; }
  try {
    const { error } = await db.from('app_settings').upsert(
      { key: getCompanyScopedKey('employers'), value: employers, company_id: getCompanyId() },
      { onConflict: 'key' }
    );
    if (error) throw error;
    setSaveStatus('saved');
  } catch(e) { fallBackToLocal(e); setSaveStatus('saved'); }
}
async function saveJobOrdersData() {
  setSaveStatus('saving');
  if (!useCloud()) { saveLocalStore(); setSaveStatus('saved'); return; }
  try {
    const { error } = await db.from('app_settings').upsert(
      { key: getCompanyScopedKey('job_orders'), value: jobOrders, company_id: getCompanyId() },
      { onConflict: 'key' }
    );
    if (error) throw error;
    setSaveStatus('saved');
  } catch(e) { fallBackToLocal(e); setSaveStatus('saved'); }
}
function nextEmployerId() {
  return (employers.reduce((m,e)=>Math.max(m,Number(e.id)||0),0))+1;
}
function nextJobOrderId() {
  return (jobOrders.reduce((m,j)=>Math.max(m,Number(j.id)||0),0))+1;
}
async function saveEmployer(data) {
  if (data.id) {
    const i = employers.findIndex(e=>e.id===data.id);
    if (i>=0) employers[i] = { ...employers[i], ...data };
    else employers.push(data);
  } else {
    employers.push({ ...data, id: nextEmployerId() });
  }
  setEmployers([...employers]);
  await saveEmployersData();
  if (typeof window.renderJobsPage === 'function') window.renderJobsPage();
  showToast('Employer saved âœ“','success');
}
async function deleteEmployer(id) {
  setEmployers(employers.filter(e=>e.id!==id));
  setJobOrders(jobOrders.filter(j=>j.employerId!==id));
  await saveEmployersData();
  await saveJobOrdersData();
  if (typeof window.renderJobsPage === 'function') window.renderJobsPage();
  showToast('Employer removed','success');
}
async function saveJobOrder(data) {
  if (data.id) {
    const i = jobOrders.findIndex(j=>j.id===data.id);
    if (i>=0) jobOrders[i] = { ...jobOrders[i], ...data };
    else jobOrders.push(data);
  } else {
    jobOrders.push({ ...data, id: nextJobOrderId() });
  }
  setJobOrders([...jobOrders]);
  await saveJobOrdersData();
  if (typeof window.renderJobsPage === 'function') window.renderJobsPage();
  showToast('Job order saved âœ“','success');
}
async function deleteJobOrder(id) {
  setJobOrders(jobOrders.filter(j=>j.id!==id));
  await saveJobOrdersData();
  if (typeof window.renderJobsPage === 'function') window.renderJobsPage();
  showToast('Job order removed','success');
}
function openEmployerForm(id) {
  const emp = id ? employers.find(e=>e.id===id) : null;
  const el = document.getElementById('employer-modal'); if (!el) return;
  document.getElementById('emp-modal-title').textContent = emp ? 'Edit Employer' : 'Add Employer';
  document.getElementById('emp-name').value = emp?.name || '';
  document.getElementById('emp-country').value = emp?.country || '';
  document.getElementById('emp-contact').value = emp?.contact || '';
  document.getElementById('emp-notes').value = emp?.notes || '';
  el.dataset.editId = emp ? String(emp.id) : '';
  el.classList.add('open');
}
async function submitEmployerForm() {
  const modal = document.getElementById('employer-modal'); if (!modal) return;
  const name = document.getElementById('emp-name').value.trim();
  if (!name) { showToast('Employer name is required','error'); return; }
  const data = {
    name, country: document.getElementById('emp-country').value.trim(),
    contact: document.getElementById('emp-contact').value.trim(),
    notes: document.getElementById('emp-notes').value.trim(),
  };
  if (modal.dataset.editId) data.id = Number(modal.dataset.editId);
  modal.classList.remove('open');
  await saveEmployer(data);
}
function openJobOrderForm(employerId, jobId) {
  const job = jobId ? jobOrders.find(j=>j.id===jobId) : null;
  const el = document.getElementById('joborder-modal'); if (!el) return;
  document.getElementById('jo-modal-title').textContent = job ? 'Edit Job Order' : 'New Job Order';
  document.getElementById('jo-title').value = job?.title || '';
  document.getElementById('jo-positions').value = job?.positions || '';
  document.getElementById('jo-deadline').value = job?.deadline || '';
  document.getElementById('jo-notes').value = job?.notes || '';
  el.dataset.employerId = String(employerId || job?.employerId || '');
  el.dataset.editId = job ? String(job.id) : '';
  el.classList.add('open');
}
async function submitJobOrderForm() {
  const modal = document.getElementById('joborder-modal'); if (!modal) return;
  const title = document.getElementById('jo-title').value.trim();
  if (!title) { showToast('Job title is required','error'); return; }
  const data = {
    title, employerId: Number(modal.dataset.employerId),
    positions: Number(document.getElementById('jo-positions').value)||1,
    deadline: document.getElementById('jo-deadline').value||null,
    notes: document.getElementById('jo-notes').value.trim(),
    status: 'open',
  };
  if (modal.dataset.editId) data.id = Number(modal.dataset.editId);
  modal.classList.remove('open');
  await saveJobOrder(data);
}
async function saveTimeline(key) {
  if (!allTimelines[key]) return;
  if (!useCloud()) { saveLocalStore(); return; }
  try {
    const { error } = await db.from('timelines').upsert(
      { key: getCompanyScopedKey(key), entries: allTimelines[key], company_id: getCompanyId() },
      { onConflict: 'key' }
    );
    if (error) throw error;
  } catch (e) { fallBackToLocal(e); }
}
async function saveStages(){
  setSaveStatus('saving');
  if(!useCloud()){ saveLocalStore(); setSaveStatus('saved'); return; }
  try{ const {error}=await db.from('app_settings').upsert([{key:getCompanyScopedKey('pro_stages'),value:proStages,company_id:getCompanyId()},{key:getCompanyScopedKey('lb_stages'),value:lbStages,company_id:getCompanyId()},{key:getCompanyScopedKey('general_workflows'),value:generalWorkflows,company_id:getCompanyId()}],{onConflict:'key'}); if(error) throw error; setSaveStatus('saved'); }
  catch(e){fallBackToLocal(e);setSaveStatus('saved');}
}
async function savePaymentRules(){
  setSaveStatus('saving');
  if(!useCloud()){ saveLocalStore(); setSaveStatus('saved'); return; }
  try{
    const {error}=await db.from('app_settings').upsert({key:getCompanyScopedKey('payment_rules'),value:paymentRules,company_id:getCompanyId()},{onConflict:'key'});
    if(error) throw error;
    setSaveStatus('saved');
  } catch(e){ fallBackToLocal(e); setSaveStatus('saved'); }
}
async function applyPaymentPreset(key){
  const preset=PAYMENT_RULE_PRESETS.find(p=>p.key===key);
  if(!preset) return;
  setPaymentRules({ proPreset: preset.key, proRules: preset.rules });
  await savePaymentRules();
  auditAction('Settings','Payment rule applied',preset.name);
  renderSettingsPage();
  renderCommissions();
  window.renderFinance?.();
  window.renderDash?.();
  showToast(`${preset.name} payment rule applied`,'success');
}
function getWorkflowTemplates(type){
  return type==='pro' ? PRO_WORKFLOW_TEMPLATES : LB_WORKFLOW_TEMPLATES;
}
function getWorkflowStages(type){
  return type==='pro' ? proStages : getGeneralWorkflowStages(getSettingsGeneralCountry());
}
function setWorkflowStages(type, stages){
  const clean=[...new Set((stages||[]).map(s=>cleanStage(s)).filter(Boolean))];
  if(!clean.length) return false;
  if(type==='pro') setProStages(clean);
  else if(!setGeneralWorkflowForCountry(getSettingsGeneralCountry(), clean)) return false;
  rebuildStageSelects();
  rebuildProPills();
  return true;
}
async function applyWorkflowTemplate(type,key){
  const tpl=getWorkflowTemplates(type).find(t=>t.key===key);
  if(!tpl) return;
  const scope=type==='pro' ? 'Professional Jobs' : `${getSettingsGeneralCountry()} General Jobs`;
  if(!confirm(`Apply "${tpl.name}" stages to ${scope}? Existing candidates stay in their current stage, but this pipeline's stage list will change.`)) return;
  if(!setWorkflowStages(type,tpl.stages)) return;
  await saveStages();
  auditAction('Settings','Workflow template applied',`${tpl.name} (${scope})`);
  renderSettingsPage();
  window.renderPipelinePage?.();
  window.renderDash?.();
  showToast(`${tpl.name} applied to ${scope}`,'success');
}
async function resetWorkflowStages(type){
  if(type==='pro'){
    if(!confirm('Reset Professional workflow to the default stages?')) return;
    if(!setWorkflowStages('pro',PRO_WORKFLOW_TEMPLATES[0].stages)) return;
  } else {
    const country=getSettingsGeneralCountry();
    if(!confirm(`Reset ${country} General Jobs workflow to its built-in default stages?`)) return;
    // Drop the per-country override so it follows the built-in preset / default again.
    const next={...generalWorkflows}; delete next[country]; setGeneralWorkflows(next);
    if(normalizeCountryKey(country)==='DEFAULT') setLbStages([...LB_PIPELINE_STAGES]);
    rebuildStageSelects(); rebuildProPills();
  }
  await saveStages();
  auditAction('Settings','Workflow stages reset',type==='pro'?'Professional':`${getSettingsGeneralCountry()} General Jobs`);
  renderSettingsPage();
  window.renderPipelinePage?.();
  window.renderDash?.();
  showToast('Workflow stages reset','success');
}
function workflowStageChips(type){
  return getWorkflowStages(type).map((s,i)=>`<span class="settings-pill">${i+1}. ${escHTML(s)}</span>`).join('');
}
function workflowTemplateCards(type){
  return getWorkflowTemplates(type).map(t=>`
    <div class="workflow-template-card">
      <strong>${escHTML(t.name)}</strong>
      <p>${escHTML(t.description)}</p>
      <div class="workflow-stage-preview">${t.stages.map(s=>`<span>${escHTML(s)}</span>`).join('')}</div>
      <button onclick="applyWorkflowTemplate('${type}','${t.key}')">Apply</button>
    </div>`).join('');
}
// Country picker for the General Jobs workflow editor: clicking a country makes
// the editor above act on that country's pipeline (the one source of truth).
function countryWorkflowCards(){
  const active=getSettingsGeneralCountry();
  return getGeneralCountries().map(country => {
    const preset = getGeneralWorkflowPreset(country);
    const overridden = Array.isArray(generalWorkflows[country]) && generalWorkflows[country].length;
    const label = overridden ? 'Custom' : preset.name;
    return `
      <button type="button" class="workflow-country-pick${country===active?' active':''}" data-action="settings.general.country" data-country="${escHTML(country)}">
        <strong>${escHTML(country)}</strong>
        <span>${escHTML(label)}</span>
      </button>`;
  }).join('');
}
function renderWorkflowSettingsPanel(){
  const genCountry=getSettingsGeneralCountry();
  const multiCountry=getGeneralCountries().length>1;
  return `
    <div class="settings-page-card workflow-settings-card">
      <h3>Workflow templates</h3>
      <p>Choose the operating process for each agency stream. These stages power forms, filters, and the pipeline board.</p>
      <div class="workflow-settings-grid">
        <section>
          <div class="workflow-settings-head">
            <strong>Professional Jobs</strong>
            <button onclick="resetWorkflowStages('pro')">Reset</button>
          </div>
          <div class="workflow-current-stages">${workflowStageChips('pro')}</div>
          <div class="workflow-template-grid">${workflowTemplateCards('pro')}</div>
        </section>
        <section>
          <div class="workflow-settings-head">
            <strong>General Jobs â€” ${escHTML(genCountry)}</strong>
            <button onclick="resetWorkflowStages('lb')">Reset</button>
          </div>
          ${multiCountry ? `<p class="workflow-country-hint">Each destination keeps its own pipeline. Pick a country to edit, then apply a template or reset below.</p>
          <div class="workflow-country-picker">${countryWorkflowCards()}</div>` : ''}
          <div class="workflow-current-stages">${workflowStageChips('lb')}</div>
          <div class="workflow-template-grid">${workflowTemplateCards('lb')}</div>
        </section>
      </div>
    </div>`;
}

// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
// TIMELINE
// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
function paymentRuleCards(){
  const active = paymentRules.proPreset;
  return PAYMENT_RULE_PRESETS.map(preset=>`
    <div class="workflow-template-card payment-rule-card ${preset.key===active?'active':''}">
      <strong>${escHTML(preset.name)}</strong>
      <p>${escHTML(preset.description)}</p>
      <div class="workflow-stage-preview">${preset.rules.map(rule=>`<span>${escHTML(rule.stage)}: ${Number(rule.percent)||0}%</span>`).join('')}</div>
      <button onclick="applyPaymentPreset('${preset.key}')">${preset.key===active?'Active':'Apply'}</button>
    </div>`).join('');
}
function renderPaymentSettingsPanel(){
  const activePreset = PAYMENT_RULE_PRESETS.find(p=>p.key===paymentRules.proPreset);
  return `
    <div class="settings-page-card workflow-settings-card">
      <h3>Payment rules</h3>
      <p>Set when professional commission becomes due. Finance will show what should be collected now based on each candidate's pipeline stage.</p>
      <div class="workflow-settings-head">
        <strong>Current rule: ${escHTML(activePreset?.name || 'Custom')}</strong>
        <span class="settings-pill">${(paymentRules.proRules||[]).map(rule=>`${Number(rule.percent)||0}% at ${rule.stage}`).join(' / ')}</span>
      </div>
      <div class="workflow-template-grid payment-rule-grid">${paymentRuleCards()}</div>
    </div>`;
}

function addTimeline(type,id,action){
  const key=`${type}_${id}`;
  if(!allTimelines[key]) allTimelines[key]=[];
  allTimelines[key].unshift({action,user:currentUser?currentUser.display:'System',ts:new Date().toISOString()});
  if(allTimelines[key].length>50) allTimelines[key].length=50;
}
function renderTimelineHTML(type,id){
  const items=allTimelines[`${type}_${id}`]||[];
  if(!items.length) return '<div class="tl-empty">No activity yet.</div>';
  return items.map(item=>{
    const d=new Date(item.ts);
    const ds=d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'});
    const ts=d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    return `<div class="tl-item-modal"><div class="tl-dot-modal"></div><div><div class="tl-action-modal">${escHTML(item.action)}</div><div class="tl-meta-modal">${escHTML(item.user)} &middot; ${ds} ${ts}</div></div></div>`;
  }).join('');
}

// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
// HELPERS
// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
function xlToISO(n){ if(!n||isNaN(n)) return ''; return new Date(EXCEL_EPOCH.getTime()+n*86400000).toISOString().split('T')[0]; }
function escHTML(v){
  return String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function rowAvatar(name){
  const ini=String(name||'').replace(/[^a-zA-Z ]/g,'').trim().split(/\s+/).filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase()||'?';
  return `<div class="row-avatar">${ini}</div>`;
}
function escJSString(v){
  return String(v ?? '').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;').replace(/[\r\n]+/g,' ');
}
function fmtDate(v){
  if(!v) return '&mdash;';
  const s=typeof v==='number'?xlToISO(v):v; if(!s) return '&mdash;';
  try{ const d=new Date(s); if(isNaN(d)) return escHTML(s); return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'}); }catch{return escHTML(s);}
}
function toInput(v){ if(!v) return ''; return typeof v==='number'?xlToISO(v):v; }
function getRefundStatus(r){
  if((r.ppStatus||r.pp_status)==='HAD PP') return 'N/A';
  const notes=(r.notes||'').trim().toUpperCase();
  if(notes==='RETURNED') return 'RETURNED';
  const toRef=Number(r.toRefund||r.to_refund)||0;
  if(!toRef) return 'N/A';
  const paid=(Number(r.r1Amt||r.r1_amt)||0)+(Number(r.r2Amt||r.r2_amt)||0);
  return paid>=toRef?'complete':'incomplete';
}
function isInProcessPro(r){ return ['SUBMITTED','INTERVIEW','OFFER LETTER','MEDICAL & ATTESTATION','WORK PERMIT','VISA','TICKET BOOKED',
  // legacy stage names for backward compat
  'PENDING OFFER LETTER','PENDING MOL','MOL','PENDING VISA','PENDING TRAVEL'].includes(proPipelineStageValue(r)); }
function isInProcessLB(r){
  const ts=lbStageValue(r);
  return !['TRAVELLED','REFUND PENDING','REFUND COMPLETE','NOT TRAVELLED'].includes(ts)&&!lbOwnPassport(r);
}
function stageBadge(s){
  const normalized=canonicalProStage(s);
  const map={'INTERVIEW':'b-pol','OFFER LETTER':'b-pol','MEDICAL & ATTESTATION':'b-mol','WORK PERMIT':'b-mol','PENDING OFFER LETTER':'b-pol','PENDING MOL':'b-mol','PENDING VISA':'b-visa','VISA':'b-visa','PENDING TRAVEL':'b-travel','TICKET BOOKED':'b-travel','TRAVELLED':'b-travelled'};
  return `<span class="badge ${map[normalized]||'b-na'}">${escHTML(normalized||s)}</span>`;
}
function travelBadge(s){
  const map={'TRAVELLED':'b-travelled','NOT YET':'b-notyet','NOT TRAVELLED':'b-nottravelled'};
  return `<span class="badge ${map[s]||'b-na'}">${escHTML(s)}</span>`;
}
function refundBadge(s){
  const map={complete:'b-complete',incomplete:'b-incomplete',RETURNED:'b-returned','N/A':'b-na'};
  return `<span class="badge ${map[s]||'b-na'}">${escHTML(s)}</span>`;
}
function ppBadge(s){
  const map={'APPLIED':'b-applied','NOT APPLIED':'b-notapplied','HAD PP':'b-hadpp','PUSHED':'b-pushed'};
  return `<span class="badge ${map[s]||'b-na'}">${s ? escHTML(s) : '&mdash;'}</span>`;
}

// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
// TABS + MODALS
// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
let _currentTab = 'dash';
function switchTab(tab, _pushHistory = true){
  if (window.innerWidth <= 860) closeMobileSidebar();
  // DV5 unified tab router â€” handles both legacy and new tabs
  const DV5_TABS = ['dash','pipeline','candidates','finance','payments','documents','reports','jobs','notifications','settings'];
  const DV5_ALIASES = {
    pro:'candidates', lb:'candidates',
    kanban:'pipeline', travel:'pipeline', tasks:'pipeline',
    calendar:'pipeline',
    commissions:'finance', repayments:'finance', expenses:'finance',
    clients:'jobs', employers:'jobs',
    help:'settings'
  };
  const DV5_TITLES = {
    dash:'Home', pipeline:'Pipeline', candidates:'Candidates',
    tasks:'Tasks', finance:'Finance', payments:'Payments', documents:'Documents', account:'Profile',
    reports:'Reports', jobs:'Employers', notifications:'Notifications', settings:'Settings'
  };

  const t = DV5_ALIASES[tab] || tab || 'dash';

  // Hide all known sections
  const allSections = [
    ...DV5_TABS,
    'pro','lb','kanban','travel','calendar',
    'commissions','repayments','expenses','team','account','help'
  ];
  allSections.forEach(x => {
    const sec = document.getElementById(x + '-section');
    if (sec) sec.style.display = 'none';
  });

  // Show the target section
  const target = document.getElementById(t + '-section');
  if (target) target.style.display = 'block';

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const activeNav = document.getElementById('nav-' + t);
  if (activeNav) activeNav.classList.add('active');

  // Update topbar title
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = DV5_TITLES[t] || t;

  setBottomNav(t);
  if (typeof closeProfileDropdown === 'function') closeProfileDropdown();

  // Route to renderer â€” use window.renderX so DV5 overrides are picked up
  const renderers = {
    dash: ()=> window.renderDash?.(),
    pipeline: ()=> window.renderPipelinePage?.(),
    candidates: ()=> window.renderCandidatesPage?.(),
    finance: ()=> window.renderFinancePage?.(),
    payments: ()=> window.renderPaymentsPage?.(),
    documents: ()=> window.renderDocumentsPage?.(),
    reports: ()=> window.renderReportsPage?.(),
    jobs: ()=> window.renderJobsPage?.(),
    notifications: ()=> (typeof renderNotificationsPage === 'function') && renderNotificationsPage(),
    settings: ()=> (typeof renderSettingsPage === 'function') && renderSettingsPage(),
    // Legacy fallbacks
    pro: ()=> { if(typeof rebuildProPills==='function') rebuildProPills(); if(typeof renderPro==='function') renderPro(); },
    lb: ()=> (typeof renderLB === 'function') && renderLB(),
    travel: ()=> (typeof renderTravel === 'function') && renderTravel(),
    calendar: ()=> (typeof renderCalendar === 'function') && renderCalendar(),
    account: ()=> (typeof renderAccountPage === 'function') && renderAccountPage(),
    team: ()=> (typeof renderTeam === 'function') && renderTeam(),
    help: ()=> (typeof renderHelpPage === 'function') && renderHelpPage(),
  };
  if (renderers[t]) renderers[t]();
  if (t === 'pipeline' && target && !target.innerHTML.trim()) {
    requestAnimationFrame(() => {
      if (!target.innerHTML.trim() && typeof window.renderPipelinePage === 'function') {
        window.renderPipelinePage();
      }
      if (!target.innerHTML.trim()) {
        target.innerHTML = `
          <div class="dv5-page">
            <div class="dv5-page-head">
              <div>
                <h1>Pipeline</h1>
                <p>Loading the candidate pipeline...</p>
              </div>
              <button class="dv5-btn" data-action="pipeline.retry">
                <i class="ti ti-refresh"></i> Retry
              </button>
            </div>
            <div class="dv5-empty">The pipeline renderer is still loading. Click Retry if this does not update automatically.</div>
          </div>`;
      }
    });
  }
  if (_pushHistory && t !== _currentTab) {
    history.pushState({ tab: t }, '', '#' + t);
  }
  _currentTab = t;
}
window.addEventListener('popstate', e => {
  const tab = e.state?.tab || (location.hash ? location.hash.slice(1) : 'dash');
  switchTab(tab, false);
});
function setBottomNav(t){
  document.querySelectorAll('.bottom-nav-item').forEach(btn=>btn.classList.remove('active'));
  const primaryTabs = new Set(['dash','pipeline','candidates','finance']);
  const active=document.getElementById(primaryTabs.has(t) ? 'bnav-'+t : 'bnav-more');
  if(active){
    active.classList.add('active');
    const nav=document.getElementById('bottom-nav');
    if(nav && nav.classList.contains('visible')){
      active.scrollIntoView({behavior:'smooth', inline:'center', block:'nearest'});
    }
  }
}
function setCalSource(src,btn){
  calSource=src;
  document.querySelectorAll('#cal-source-tabs .pill-tab').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderCalendar();
}
function calNav(delta){
  calDate=new Date(calDate.getFullYear(),calDate.getMonth()+delta,1);
  renderCalendar();
}
function collectCalendarEvents(){
  const events=[];
  if(calSource==='pro'){
    proDB.forEach(r=>{
      [['interview','Interview','cal-ev-interview'],['ol','Offer letter','cal-ev-ol'],['mol','Work permit','cal-ev-mol'],['visa','Visa','cal-ev-visa'],['travel','Travel','cal-ev-travel']].forEach(([field,label,cls])=>{
        const date=toInput(r[field]);
        if(date) events.push({date,label:`${label}: ${r.name}`,cls,open:`editPro(${r.id})`});
      });
    });
  } else {
    lbDB.forEach(r=>{
      const date=toInput(r.travelDate||r.travel_date);
      if(date) events.push({date,label:`Travel: ${r.name}`,cls:'cal-ev-lb',open:`editLB(${r.id})`});
    });
  }
  return events;
}
function renderCalendar(){
  const grid=document.getElementById('cal-grid'); if(!grid) return;
  const label=document.getElementById('cal-month-label');
  const year=calDate.getFullYear(), month=calDate.getMonth();
  if(label) label.textContent=calDate.toLocaleDateString('en-GB',{month:'short',year:'numeric'});
  const first=new Date(year,month,1);
  const start=new Date(year,month,1-((first.getDay()+6)%7));
  const today=new Date().toISOString().split('T')[0];
  const events=collectCalendarEvents();
  let days='';
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i);
    const iso=d.toISOString().split('T')[0];
    const dayEvents=events.filter(e=>e.date===iso).slice(0,3);
    days+=`<div class="cal-day ${d.getMonth()!==month?'other-month':''} ${iso===today?'today':''}">
      <div class="cal-day-num">${d.getDate()}</div>
      ${dayEvents.map(e=>`<div class="cal-event ${e.cls}" onclick="${e.open}">${e.label}</div>`).join('')}
    </div>`;
  }
  grid.innerHTML=`<div class="cal-header-row">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<div class="cal-header-cell">${d}</div>`).join('')}</div><div class="cal-grid-body">${days}</div>`;
}
function renderReports(){
  const wrap=document.getElementById('reports-content'); if(!wrap) return;
  const proTravelled=proDB.filter(r=>proPipelineStageValue(r)==='TRAVELLED').length;
  const lbTravelled=lbDB.filter(r=>(r.travelStatus||r.travel_status)==='TRAVELLED').length;
  const totalComm=proDB.reduce((sum,r)=>sum+(Number(r.commission)||0),0);
  const totalPaid=proDB.reduce((sum,r)=>sum+(Number(r.paid)||0),0);
  const refundOpen=lbDB.filter(r=>getRefundStatus(r)==='incomplete').length;
  const proActionCount=proDB.filter(proNeedsAction).length;
  const lbActionCount=lbDB.filter(lbNeedsAction).length;
  const stalledStages=proStages.map(stage=>({stage,count:proDB.filter(r=>proPipelineStageValue(r)===stage).length})).sort((a,b)=>b.count-a.count)[0];
  const money=n=>'KES '+Number(n||0).toLocaleString();
  const short=s=>{
    const v=String(s||'-').replace(/^PENDING\s+/,'').trim();
    return v.length>11?v.slice(0,10)+'...':v;
  };
  const palette=['#5347CE','#DDF56C','#49774E','#A05B3F','#426CA8','#8A6A16','#DCECC8','#FAFAF8'];
  const chartBars=(items,max,colorFn)=>items.map((item,i)=>{
    const pct=max?Math.max(8,Math.round((item.value/max)*100)):8;
    const color=colorFn?colorFn(item,i):palette[i%palette.length];
    return `<div class="report-bar-wrap" title="${item.label}: ${item.value}">
      <div class="report-bar" style="height:${pct}%;--bar-height:${pct}%;--bar-color:${color}"></div>
      <div class="report-bar-count">${item.value}</div>
      <div class="report-bar-label">${short(item.short||item.label)}</div>
    </div>`;
  }).join('');
  const legend=items=>`<div class="chart-legend">${items.map((item,i)=>`<span class="chart-legend-item"><span class="legend-dot" style="background:${item.color||palette[i%palette.length]}"></span>${item.label}</span>`).join('')}</div>`;

  const stageData=proStages.map((stage,i)=>({
    label:stage,
    short:stage.replace('PENDING ',''),
    value:proDB.filter(r=>proPipelineStageValue(r)===stage).length,
    color:palette[i%palette.length]
  })).filter(x=>x.value>0);
  const maxStage=Math.max(1,...stageData.map(x=>x.value));

  const positionMap={};
  proDB.forEach(r=>{
    const key=(r.position||'Unassigned').trim()||'Unassigned';
    if(!positionMap[key]) positionMap[key]={position:key,total:0,travelled:0,inProcess:0,billed:0,paid:0};
    positionMap[key].total++;
    if(proPipelineStageValue(r)==='TRAVELLED') positionMap[key].travelled++;
    else positionMap[key].inProcess++;
    positionMap[key].billed+=Number(r.commission)||0;
    positionMap[key].paid+=Number(r.paid)||0;
  });
  const positionStats=Object.values(positionMap).sort((a,b)=>b.total-a.total||a.position.localeCompare(b.position));
  const positionChart=positionStats.slice(0,8).map((row,i)=>({label:row.position,short:row.position,value:row.total,color:palette[i%4]}));
  const maxPosition=Math.max(1,...positionChart.map(x=>x.value));

  const monthLabels=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthData=monthLabels.map((m,i)=>({label:m,short:m,value:0,color:'#DDE8D8'}));
  proDB.forEach(r=>{
    const raw=toInput(r.travel||r.visa||r.ol||r.submitted);
    if(raw){
      const d=new Date(raw);
      if(!Number.isNaN(d.getTime())) monthData[d.getMonth()].value++;
    }
  });
  const maxMonth=Math.max(1,...monthData.map(x=>x.value));
  const conversion=proDB.length?Math.round((proTravelled/proDB.length)*100):0;
  const tableRows=positionStats.length?positionStats.map(row=>{
    const conv=row.total?Math.round((row.travelled/row.total)*100):0;
    return `<tr>
      <td class="name-cell">${escHTML(row.position||'')}</td>
      <td>${row.total}</td>
      <td>${row.travelled}</td>
      <td>${row.inProcess}</td>
      <td>${money(row.billed)}</td>
      <td>${money(row.paid)}</td>
      <td><span class="conversion-pill ${conv>=50?'high':'low'}">${conv}%</span></td>
    </tr>`;
  }).join(''):`<tr><td colspan="7"><div class="empty">No position data yet</div></td></tr>`;

  wrap.innerHTML=`<div class="action-grid">
    <div class="action-card warn"><i class="ti ti-alert-triangle"></i><div><strong>${proActionCount}</strong><span>Professional records need attention: pending travel or outstanding balance.</span></div></div>
    <div class="action-card danger"><i class="ti ti-receipt-refund"></i><div><strong>${lbActionCount}</strong><span>General Jobs records need attention, including ${refundOpen} open balances.</span></div></div>
  </div>
  <div class="reports-grid">
    <div class="report-card">
      <div class="report-card-title"><i class="ti ti-chart-pie"></i>Stage Distribution</div>
      <div class="report-subtitle">Professional candidates by current placement stage</div>
      <div class="report-chart">${chartBars(stageData.length?stageData:[{label:'No data',value:0,color:'#ECEDE6'}],maxStage,(item)=>item.color)}</div>
      ${legend(stageData)}
      <div class="report-note">Largest stage: ${stalledStages?`${stalledStages.stage} (${stalledStages.count})`:'No stage data yet'}</div>
    </div>
    <div class="report-card">
      <div class="report-card-title"><i class="ti ti-briefcase"></i>Position Breakdown</div>
      <div class="report-subtitle">Top positions by candidate volume</div>
      <div class="report-chart">${chartBars(positionChart.length?positionChart:[{label:'No data',value:0,color:'#ECEDE6'}],maxPosition,(item)=>item.color)}</div>
      <div class="report-note">${positionStats.slice(0,5).map(r=>`${escHTML(r.position||'')}: ${r.total}`).join('  |  ')||'No position records yet'}</div>
    </div>
    <div class="report-card">
      <div class="report-card-title"><i class="ti ti-trending-up"></i>Monthly Trend</div>
      <div class="report-subtitle">Activity by month using travel, visa, offer, or submitted dates</div>
      <div class="report-chart">${chartBars(monthData,maxMonth,(item,i)=>item.value?palette[i%4]:'#EEF1F5')}</div>
    </div>
    <div class="report-card">
      <div class="report-card-title"><i class="ti ti-coin"></i>Revenue Summary</div>
      <div class="rev-grid">
        <div class="rev-cell"><div class="rev-cell-val">${money(totalComm)}</div><div class="rev-cell-label">Total Commission Billed</div></div>
        <div class="rev-cell"><div class="rev-cell-val green">${money(totalPaid)}</div><div class="rev-cell-label">Commission Collected</div></div>
        <div class="rev-cell"><div class="rev-cell-val amber">${money(totalComm-totalPaid)}</div><div class="rev-cell-label">Outstanding</div></div>
        <div class="rev-cell"><div class="rev-cell-val">${conversion}%</div><div class="rev-cell-label">Conversion Rate</div></div>
      </div>
      <div class="report-note">${lbTravelled} General Jobs travelled  |  ${refundOpen} open balances</div>
    </div>
    <div class="report-card report-wide">
      <div class="report-card-title"><i class="ti ti-table"></i>Position-Wise Summary</div>
      <div class="table-scroll">
        <table class="report-table">
          <thead><tr><th>Position</th><th>Total</th><th>Travelled</th><th>In Process</th><th>Commission Billed</th><th>Commission Collected</th><th>Conversion %</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}
function exportReportPDF(){
  renderReports();
  window.print();
}
function openSettings(){ closeProfileDropdown(); switchTab('settings'); }
function renderSettingsCountries() {
  const card = document.getElementById('settings-countries-card');
  const list = document.getElementById('settings-countries-list');
  const err = document.getElementById('settings-country-error');
  if (err) { err.textContent = ''; err.style.display = 'none'; }
  if (!card || !list) return;
  const isAdmin = currentUser?.role === 'admin';
  card.style.display = isAdmin ? 'flex' : 'none';
  if (!isAdmin) return;
  const countries = getGeneralCountries();
  list.innerHTML = countries.map(country => `
    <span style="display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:999px;background:#F8FAFC;padding:7px 9px;font-size:12px;font-weight:500;color:var(--ink)">
      ${escHTML(country)}
      <button type="button" onclick="removeSettingsCountry('${escJSString(country)}')" title="Remove ${escHTML(country)}" style="border:0;background:transparent;color:var(--text-3);cursor:pointer;padding:0;display:inline-flex;align-items:center">
        <i class="ti ti-x"></i>
      </button>
    </span>
  `).join('') || '<div class="empty" style="padding:12px">No countries configured</div>';
}
async function addSettingsCountry() {
  if (currentUser?.role !== 'admin') { showToast('Only admins can manage countries','error'); return; }
  const input = document.getElementById('settings-new-country');
  const err = document.getElementById('settings-country-error');
  const name = (input?.value || '').trim();
  const fail = msg => { if (err) { err.textContent = msg; err.style.display = 'block'; } };
  if (!name) return fail('Country name is required.');
  const countries = getGeneralCountries();
  if (countries.some(c => c.toLowerCase() === name.toLowerCase())) return fail('That country already exists.');
  const next = [...countries, name];
  window.generalCountryFilter = name;
  await persistWorkspaceCountries(next);
  if (input) input.value = '';
  renderSettingsCountries();
  renderGeneralCountryTabs();
  renderLB();
  window.renderDash?.();
  showToast('Country added','success');
}
async function removeSettingsCountry(country) {
  if (currentUser?.role !== 'admin') { showToast('Only admins can manage countries','error'); return; }
  const countries = getGeneralCountries();
  if (countries.length <= 1) { showToast('Keep at least one country','error'); return; }
  const hasRecords = lbDB.some(r => (r.country || DEFAULT_COMPANY.generalJobsCountries[0] || 'General') === country);
  if (hasRecords && !confirm(`${country} has General Jobs records. Remove the tab anyway? Records will not be deleted.`)) return;
  const next = countries.filter(c => c !== country);
  if (window.generalCountryFilter === country) window.generalCountryFilter = next[0] || '';
  await persistWorkspaceCountries(next);
  renderSettingsCountries();
  renderGeneralCountryTabs();
  renderLB();
  window.renderDash?.();
  showToast('Country removed','success');
}
function getCompanyUsers() {
  const companyId = getCompanyId();
  const seen = new Set();
  const rows = Object.entries(STAFF_ACCOUNTS)
    .filter(([, account]) => account?.companyId === companyId)
    .sort(([a], [b]) => a.localeCompare(b));
  rows.forEach(([username]) => seen.add(username));
  if (currentUser?.username && !seen.has(currentUser.username)) {
    rows.unshift([currentUser.username, normalizeAccount(currentUser.username, currentUser)]);
  }
  return rows;
}
async function createWorkspaceUserAccount({ display, username, role, password }) {
  const baseAccount = {
    role,
    display,
    companyId: getCompanyId(),
    companyName: getCompanyName(),
    generalJobsCountries: getGeneralCountries(),
  };
  if (db?.auth) {
    try {
      const token = await authToken();
      if (token) {
        const authResult = await postAuthAction({ action:'create_user', display, username, password, role }, token);
        STAFF_ACCOUNTS[username] = normalizeAccount(username, { ...(authResult.account || {}), ...baseAccount, authUserId: authResult.account?.authUserId || authResult.account?.auth_user_id || '' });
        await saveStaffAccounts();
        return { authBacked: true };
      }
    } catch (err) {
      console.warn('Supabase Auth user creation unavailable; using local account registry:', err);
    }
  }
  STAFF_ACCOUNTS[username] = normalizeAccount(username, baseAccount);
  try {
    await setAccountPassword(STAFF_ACCOUNTS[username], password);
    await saveStaffAccounts();
    return { authBacked: false };
  } catch (err) {
    delete STAFF_ACCOUNTS[username];
    throw err;
  }
}
function renderCompanyUsers() {
  const card = document.getElementById('settings-users-card');
  const list = document.getElementById('settings-users-list');
  const err = document.getElementById('new-user-error');
  if (err) { err.textContent = ''; err.style.display = 'none'; }
  if (!card || !list) return;
  const isAdmin = currentUser?.role === 'admin';
  card.style.display = isAdmin ? 'flex' : 'none';
  if (!isAdmin) return;
  const users = getCompanyUsers();
  list.innerHTML = users.map(([username, account]) => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--border);border-radius:10px;padding:9px 10px;background:#F8FAFC">
      <div style="min-width:0">
        <div style="font-size:13px;font-weight:500;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHTML(account.display || username)}</div>
        <div style="font-size:11px;color:var(--text-3)">@${escHTML(username)}</div>
      </div>
      <span style="font-size:10px;font-weight:500;text-transform:uppercase;color:${account.role === 'admin' ? 'var(--nexus-purple)' : 'var(--text-3)'}">${account.role === 'admin' ? 'Admin' : 'Staff'}</span>
    </div>
  `).join('') || '<div class="empty" style="padding:12px">No users yet</div>';
}
async function createCompanyUser() {
  if (currentUser?.role !== 'admin') { showToast('Only admins can add users','error'); return; }
  const display = (document.getElementById('new-user-display')?.value || '').trim();
  const username = (document.getElementById('new-user-username')?.value || '').trim().toLowerCase();
  const role = document.getElementById('new-user-role')?.value === 'admin' ? 'admin' : 'staff';
  const password = (document.getElementById('new-user-password')?.value || '').trim();
  const errEl = document.getElementById('new-user-error');
  const fail = msg => {
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
  };
  if (!display) return fail('Display name is required.');
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return fail('Username must be 3-32 letters, numbers, dots, underscores, or hyphens.');
  if (STAFF_ACCOUNTS[username]) return fail('That username is already taken.');
  if (password.length < 8) return fail('Temporary password must be at least 8 characters.');
  try {
    await createWorkspaceUserAccount({ display, username, role, password });
  } catch (err) {
    return fail(err.message || 'User could not be created.');
  }
  ['new-user-display','new-user-username','new-user-password'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const roleEl = document.getElementById('new-user-role'); if (roleEl) roleEl.value = 'staff';
  if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
  renderCompanyUsers();
  showToast('User added','success');
}
async function saveWorkspaceSettings(){
  const companyName=(document.getElementById('settings-company-name')?.value||'').trim();
  if(!companyName){ showToast('Company name is required','error'); return; }
  const companyId=getCompanyId();
  Object.keys(STAFF_ACCOUNTS).forEach(username=>{
    if((STAFF_ACCOUNTS[username].companyId||DEFAULT_COMPANY.id)===companyId){
      STAFF_ACCOUNTS[username].companyName=companyName;
    }
  });
  setCurrentUser({...currentUser,companyName});
  setCurrentWorkspace(currentUser);
  _saveSession(currentUser);
  await saveStaffAccounts();
  setUserDisplay(currentUser.display,currentUser.role);
  window.renderDash?.(); renderLB(); renderReports();
  showToast('Workspace updated','success');
}
function openHelp(){ closeProfileDropdown(); document.getElementById('help-modal')?.classList.add('open'); }
function downloadBackup(){
  // Strip credential fields before export â€“ hashes must never leave the browser
  // in a downloadable file that could end up in unintended hands.
  const safeAccounts = Object.fromEntries(
    Object.entries(STAFF_ACCOUNTS).map(([u, a]) => {
      const { passwordHash, passwordSalt, password, hashVersion, ...safe } = a;
      return [u, safe];
    })
  );
  const backup={
    exportedAt:new Date().toISOString(),
    storageMode:appStorageMode,
    pro:proDB,
    lb:lbDB,
    docs:allDocs,
    timelines:allTimelines,
    proStages,
    lbStages,
    generalWorkflows,
    staffAccounts: safeAccounts,
  };
  const a=Object.assign(document.createElement('a'),{
    href:URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'})),
    download:`Recruitflow_Backup_${new Date().toISOString().split('T')[0]}.json`
  });
  a.click();
  showToast('Backup downloaded','success');
}
function restoreBackupFromFile(file){
  if(!file) return;
  if(!confirm('Restore this backup into the current browser workspace? This replaces the records currently loaded in Recruitflow.')) return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const data=JSON.parse(reader.result);
      setProDB((data.pro||[]).map(normalizeProRecord));
      setLbDB((data.lb||[]).map(normalizeLBRecord));
      setAllDocs(data.docs||{});
      setAllTimelines(data.timelines||{});
      setProStages(normalizeProStageList(Array.isArray(data.proStages)&&data.proStages.length?data.proStages:[...proStages]));
      setLbStages(Array.isArray(data.lbStages)&&data.lbStages.length?data.lbStages:[...lbStages]);
      setGeneralWorkflows(data.generalWorkflows&&typeof data.generalWorkflows==='object'&&!Array.isArray(data.generalWorkflows)?data.generalWorkflows:{});
      if(data.staffAccounts&&typeof data.staffAccounts==='object'){
        // Validate each restored account before merging â€“ a crafted backup file
        // could otherwise inject accounts with arbitrary roles or credentials.
        const ALLOWED_ROLES = new Set(['admin','staff','finance']);
        const sanitized = Object.fromEntries(
          Object.entries(data.staffAccounts)
            .filter(([u, a]) =>
              typeof u === 'string' &&
              /^[a-z0-9._-]{1,64}$/.test(u) &&
              a && typeof a === 'object' &&
              ALLOWED_ROLES.has(a.role)
            )
            .map(([u, a]) => {
              // Never restore credential fields from a backup file.
              const { passwordHash, passwordSalt, password, hashVersion, ...safe } = a;
              return [u, safe];
            })
        );
        Object.assign(STAFF_ACCOUNTS, sanitized);
        saveStaffAccounts();
      }
      appStorageMode='local';
      lastSyncError='Backup restored locally. Download a new backup or reconnect cloud sync when ready.';
      saveLocalStore();
      rebuildStageSelects(); rebuildProPills();
      closeModal('settings-modal');
      switchTab('dash');
      setSaveStatus('saved');
      showToast('Backup restored locally','success');
    }catch(err){
      console.error(err);
      showToast('Backup restore failed. Check the JSON file.','error');
    }
  };
  reader.readAsText(file);
}
function resetAllFilters(){
  window.proStagePillFilter='';
  window.lbTravelPillFilter='';
  window.lbPPFilter='';
  ['global-search','pro-search','lb-search'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  ['pro-company-f','pro-position-f','pro-action-f','lb-refund-f','lb-action-f'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.querySelectorAll('#pro-stage-pills .pill-tab,#lb-travel-pills .pill-tab,#lb-pp-pills .pill-tab').forEach(btn=>btn.classList.remove('active'));
  document.querySelector('#lb-travel-pills .pill-tab')?.classList.add('active');
  document.querySelector('#lb-pp-pills .pill-tab')?.classList.add('active');
  rebuildProPills();
  proPage=1; lbPage=1;
  renderPro(); renderLB();
  showToast('Filters cleared','success');
}
function resetSavedFilters(){
  try{ localStorage.removeItem(userFilterKey()); }catch(e){ /* ignore */ }
  showToast('Filters reset','success');
}
function switchModalTab(modal,tab,btn){
  const tabs=modal==='pro'?['details','pipeline','commission','timeline','docs']:['details','refunds','timeline','docs'];
  tabs.forEach(tt=>{ const el=document.getElementById(`${modal}-tab-${tt}`); if(el) el.style.display=tt===tab?'':'none'; });
  btn.closest('.modal-tabs').querySelectorAll('.modal-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  if (tab==='docs') {
    const id = modal==='pro' ? editingProId : editingLbId;
    const el = document.getElementById(`${modal}-doc-checklist`); if(el) el.innerHTML=renderDocChecklist(modal,id);
  }
  if (tab==='commission' && modal==='pro' && editingProId) {
    const r = proDB.find(x=>x.id==editingProId);
    if(r) { renderCommissionStatus(r); renderCandidateCommissionInstallments(r); renderCandidatePL('pro', editingProId); }
  }
}
function closeModal(id){ const el=document.getElementById(id); if(el) el.classList.remove('open'); }

function moneyKES(v){ return 'KES '+Number(v||0).toLocaleString(); }
function moneyUSD(v){ return '$'+Number(v||0).toLocaleString(); }
function proBalance(r){
  return Math.max((Number(r.commission)||0)-proPaidAmount(r),0);
}
function proNeedsAction(r){
  const stage=r.stage||'';
  return (stage!=='TRAVELLED'&&!toInput(r.travel)) || proBalance(r)>0;
}
function lbNeedsAction(r){
  return getRefundStatus(r)==='incomplete' || ((r.travelStatus||r.travel_status)==='NOT YET');
}
function validateProRecord(rec) {
  if(!rec.name) return 'Full name is required.';
  if(!rec.stage) return 'Current stage is required.';
  if(rec.commission!==null && rec.commission<0) return 'Commission cannot be negative.';
  if(rec.paid!==null && rec.paid<0) return 'Amount paid cannot be negative.';
  const totalPaid = proPaidAmount(rec);
  if(rec.commission!==null && totalPaid > (Number(rec.commission)||0)) return 'Amount paid cannot exceed commission billed.';
  if(String(rec.stage||'').toUpperCase()==='TRAVELLED' && !rec.travel) return 'Travel date is required when marking a candidate as Travelled.';
  return '';
}
function validateLBRecord(rec) {
  if(!rec.name) return 'Full name is required.';
  if(!rec.ppStatus) return 'Passport status is required.';
  if(!rec.travelStatus) return 'Travel status is required.';
  if(rec.toRefund<0 || rec.r1Amt<0 || rec.r2Amt<0) return 'Refund amounts cannot be negative.';
  if(!lbOwnPassport(rec) && (rec.r1Amt+rec.r2Amt) > rec.toRefund) return 'Refunded amount cannot exceed amount to refund.';
  const TRAVELLED_STAGES = ['TRAVELLED','REFUND PENDING','REFUND COMPLETE'];
  if(TRAVELLED_STAGES.includes(String(rec.travelStatus||'').toUpperCase()) && !rec.travelDate) return 'Travel date is required when marking a candidate as Travelled.';
  return '';
}
function recordChanges(before={},after={},fields=[]) {
  return fields
    .filter(([key])=>String(before[key]??'')!==String(after[key]??''))
    .map(([key,label])=>`${label}: "${before[key]??'-'}" to "${after[key]??'-'}"`);
}
function renderProSummary(r){
  const el=document.getElementById('pro-summary'); if(!el) return;
  const isNew=!r;
  const rec=r||{name:'New professional candidate',pp:'',position:'',company:'',stage:proStages[0]||'INTERVIEW',commission:0,paid:0};
  const bal=proBalance(rec);
  const initials=(rec.name||'?').split(/\s+/).filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase();
  el.innerHTML=`<div class="cs-avatar">${initials}</div>
  <div class="candidate-summary-main">
    <div class="candidate-summary-name">${escHTML(rec.name||'New professional candidate')}</div>
    <div class="candidate-summary-meta">
      ${rec.pp?`<span><i class="ti ti-id"></i>${escHTML(rec.pp)}</span>`:''}
      ${rec.position?`<span><i class="ti ti-briefcase"></i>${escHTML(rec.position)}</span>`:''}
      ${rec.company?`<span><i class="ti ti-building"></i>${escHTML(rec.company)}</span>`:''}
      <span class="summary-status">${stageBadge(rec.stage||'INTERVIEW')}</span>
    </div>
  </div>
  <div class="candidate-summary-kpis">
    <div class="candidate-kpi"><strong>${isNew?'â€”':moneyKES(rec.commission)}</strong><span>Billed</span></div>
    <div class="candidate-kpi ${!isNew&&bal<=0?'cs-kpi-paid':'cs-kpi-due'}"><strong>${isNew?'â€”':moneyKES(Math.max(0,bal))}</strong><span>Balance</span></div>
  </div>`;
}
function renderLBSummary(r){
  const el=document.getElementById('lb-summary'); if(!el) return;
  const isNew=!r;
  const rec=r||{name:'New General Jobs candidate',phone:'',ppStatus:'APPLIED',travelStatus:lbStages[0]||'NOT YET',toRefund:0,r1Amt:0,r2Amt:0};
  const paid=(Number(rec.r1Amt||rec.r1_amt)||0)+(Number(rec.r2Amt||rec.r2_amt)||0);
  const owed=Number(rec.toRefund||rec.to_refund)||0;
  const bal=Math.max(0,owed-paid);
  const initials=(rec.name||'?').split(/\s+/).filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase();
  el.innerHTML=`<div class="cs-avatar cs-avatar-lb">${initials}</div>
  <div class="candidate-summary-main">
    <div class="candidate-summary-name">${escHTML(rec.name||'New General Jobs candidate')}</div>
    <div class="candidate-summary-meta">
      ${rec.phone?`<span><i class="ti ti-phone"></i>${escHTML(rec.phone)}</span>`:''}
      <span class="summary-status">${ppBadge(rec.ppStatus||rec.pp_status||'APPLIED')}</span>
      <span class="summary-status">${travelBadge(rec.travelStatus||rec.travel_status||'NOT YET')}</span>
      <span class="summary-status">${refundBadge(isNew?'N/A':getRefundStatus(rec))}</span>
    </div>
  </div>
  <div class="candidate-summary-kpis">
    <div class="candidate-kpi"><strong>${isNew?'â€”':moneyUSD(owed)}</strong><span>To refund</span></div>
    <div class="candidate-kpi ${!isNew&&bal<=0?'cs-kpi-paid':'cs-kpi-due'}"><strong>${isNew?'â€”':moneyUSD(bal)}</strong><span>Balance</span></div>
  </div>`;
}
function readProFormSummary(){
  const existing = editingProId ? proDB.find(x=>x.id==editingProId) : null;
  return {
    name:document.getElementById('pf-name')?.value||'New professional candidate',
    pp:document.getElementById('pf-pp')?.value||'',
    position:document.getElementById('pf-position')?.value||'',
    company:document.getElementById('pf-company')?.value||'',
    stage:document.getElementById('pf-stage')?.value||proStages[0],
    commission:Number(document.getElementById('pf-comm')?.value)||0,
    paid:existing ? proPaidAmount(existing) : 0,
  };
}
function readLBFormSummary(){
  return {
    name:document.getElementById('lf-name')?.value||'New General Jobs candidate',
    phone:document.getElementById('lf-phone')?.value||'',
    ppStatus:document.getElementById('lf-pp')?.value||'APPLIED',
    travelStatus:document.getElementById('lf-stage')?.value||document.getElementById('lf-travel')?.value||getGeneralWorkflowStages()[0],
    toRefund:Number(document.getElementById('lf-torefund')?.value)||0,
    r1Amt:Number(document.getElementById('lf-r1amt')?.value)||0,
    r2Amt:Number(document.getElementById('lf-r2amt')?.value)||0,
  };
}
function bindModalSummaries(){
  ['pf-name','pf-pp','pf-position','pf-company','pf-stage','pf-comm'].forEach(id=>{
    const el=document.getElementById(id); if(el){ el.addEventListener('input',()=>renderProSummary(readProFormSummary())); el.addEventListener('change',()=>renderProSummary(readProFormSummary())); }
  });
  ['lf-name','lf-phone','lf-pp','lf-stage','lf-travel','lf-torefund','lf-r1amt','lf-r2amt'].forEach(id=>{
    const el=document.getElementById(id); if(el){ el.addEventListener('input',()=>renderLBSummary(readLBFormSummary())); el.addEventListener('change',()=>renderLBSummary(readLBFormSummary())); }
  });
}

// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
// STAGES + PILLS
// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
function rebuildStageSelects(){
  const proSel=document.getElementById('pf-stage');
  if(proSel) proSel.innerHTML=proStages.map(s=>`<option value="${s}">${s}</option>`).join('')+`<option value="__add_new__">+ Add new stage...</option>`;
  const activeLbStages = getGeneralWorkflowStages();
  const lbSel=document.getElementById('lf-stage');
  if(lbSel)  lbSel.innerHTML=activeLbStages.map(s=>`<option value="${s}">${s}</option>`).join('')+`<option value="__add_new__">+ Add new stage...</option>`;
  const lbSel2=document.getElementById('lf-travel');
  if(lbSel2) lbSel2.innerHTML=activeLbStages.map(s=>`<option value="${s}">${s}</option>`).join('')+`<option value="__add_new__">+ Add new status...</option>`;
}
function rebuildProPills(){
  const wrap=document.getElementById('pro-stage-pills'); if(!wrap) return;
  const cur=window.proStagePillFilter||'';
  wrap.innerHTML=`<button class="pill-tab ${cur===''?'active':''}" onclick="setProStagePill('',this)">All</button>`
    +proStages.map(s=>`<button class="pill-tab ${cur===s?'active':''}" onclick="setProStagePill('${s.replace(/'/g,"\\'")}',this)">${s.replace('PENDING ','')}</button>`).join('');
}
function setProStagePill(val,btn){
  window.proStagePillFilter=val;
  document.querySelectorAll('#pro-stage-pills .pill-tab').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderPro();
}
// Combined LB pill filter handler for both travel and pp pill rows
function setLBPill(type,val,btn){
  if(type==='travel'){
    window.lbTravelPillFilter=val;
    document.querySelectorAll('#lb-travel-pills .pill-tab').forEach(b=>b.classList.remove('active'));
  } else {
    window.lbPPFilter=val;
    document.querySelectorAll('#lb-pp-pills .pill-tab').forEach(b=>b.classList.remove('active'));
  }
  if(btn) btn.classList.add('active');
  renderLB();
}
function handleStageSelectChange(type,selectEl){
  if(selectEl.value!=='__add_new__'){ selectEl.dataset.prev=selectEl.value; return; }
  pendingStageType=type;
  pendingStageSelect=selectEl;
  const previous=selectEl.dataset.prev||(type==='pro'?(proStages[0]||'SUBMITTED'):(lbStages[0]||'DOCS SUBMITTED'));
  selectEl.value=previous;
  openStageModal(type);
}
function addCustomStage(type){
  pendingStageType=type;
  pendingStageSelect=null;
  openStageModal(type);
}
function openStageModal(type){
  const modal=document.getElementById('quick-stage-modal');
  const input=document.getElementById('quick-stage-name');
  const err=document.getElementById('quick-stage-error');
  const heading=document.getElementById('quick-stage-heading');
  if(input) input.value='';
  if(err){ err.textContent=''; err.style.display='none'; }
  if(heading) heading.textContent=type==='pro'?'Add Professional Jobs stage':'Add General Jobs travel status';
  modal?.classList.add('open');
}
function submitQuickStage(){
  const type=pendingStageType||'pro';
  const input=document.getElementById('quick-stage-name');
  const err=document.getElementById('quick-stage-error');
  const fail=msg=>{ if(err){ err.textContent=msg; err.style.display='block'; } };
  const name=(input?.value||'').trim().toUpperCase();
  if(!name) return fail('Name is required.');
  if(type==='pro'){
    if(proStages.includes(name)) return fail('That stage already exists.');
    const insertAt=Math.max(0,proStages.indexOf('TRAVELLED'));
    proStages.splice(insertAt,0,name);
  }else{
    if(lbStages.includes(name)) return fail('That status already exists.');
    lbStages.push(name);
  }
  rebuildStageSelects(); rebuildProPills(); saveStages();
  if(pendingStageSelect){ pendingStageSelect.value=name; pendingStageSelect.dataset.prev=name; }
  closeModal('quick-stage-modal');
  pendingStageType=null; pendingStageSelect=null;
  window.renderPipelinePage?.();
  window.renderDash?.();
  showToast(`"${name}" added`,'success');
}

// Global search
function onGlobalSearch(){
  const q=document.getElementById('global-search').value;
  saveUserFilters({globalSearch:q});
  const ps=document.getElementById('pro-search'); const ls=document.getElementById('lb-search');
  if(ps) ps.value=q; if(ls) ls.value=q;
  const active=document.querySelector('.nav-item.active');
  if(active&&active.id==='nav-pro') renderPro();
  else if(active&&active.id==='nav-lb') renderLB();
}


function openTravelledView(){
  window.proStagePillFilter='TRAVELLED';
  switchTab('pro');
  if (typeof rebuildProPills === 'function') rebuildProPills();
  if (typeof renderPro === 'function') renderPro();
  if (typeof showToast === 'function') showToast('Showing travelled candidates','success');
}
function openPendingTravelView(){
  window.proStagePillFilter='TICKET BOOKED';
  switchTab('pro');
  if (typeof rebuildProPills === 'function') rebuildProPills();
  if (typeof renderPro === 'function') renderPro();
  if (typeof showToast === 'function') showToast('Showing candidates with tickets booked','success');
}
function openFirstDocumentUpload(){
  const pro=proDB.find(Boolean);
  if(pro){ openDocs('pro',pro.id,pro.name||'Candidate'); return; }
  const lb=lbDB.find(Boolean);
  if(lb){ openDocs('lb',lb.id,lb.name||'Candidate'); return; }
  showToast('Add a candidate before uploading documents','error');
}
function renderFinancePeriodSelect(){
  return `<span class="finance-period-menu"><select aria-label="Financial summary period" onchange="setFinancePeriod(this.value)"><option value="month" ${financePeriod==='month'?'selected':''}>This Month</option><option value="year" ${financePeriod==='year'?'selected':''}>This Year</option><option value="overall" ${financePeriod==='overall'?'selected':''}>Overall</option></select></span>`;
}
function setTrendPeriod(){ showToast('Pipeline trend is showing this month. More periods can be added once monthly history is synced.','success'); }
function updateTrendTooltip(event){
  const tip=document.getElementById('trend-tooltip');
  const chart=event.currentTarget;
  if(!tip||!chart) return;
  const rect=chart.getBoundingClientRect();
  const pct=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));
  const day=12+Math.round(pct*6);
  const inProcess=Math.max(1,Math.round((proDB.length+lbDB.length)*(0.35+pct*.3)));
  const travelled=Math.max(0,Math.round((proDB.filter(r=>proPipelineStageValue(r)==='TRAVELLED').length+lbDB.filter(r=>(r.travelStatus||r.travel_status)==='TRAVELLED').length)*(0.7+pct*.45)));
  document.getElementById('trend-tip-date').textContent=`May ${day}, 2025`;
  document.getElementById('trend-tip-process').textContent=inProcess;
  document.getElementById('trend-tip-travelled').textContent=travelled;
  tip.style.left=`${Math.min(Math.max(event.clientX-rect.left-70,10),rect.width-150)}px`;
  tip.style.top='64px';
  tip.style.display='block';
}
function resetTrendTooltip(){ const tip=document.getElementById('trend-tooltip'); if(tip) tip.style.display=''; }
function persistExpenses(){ safeLocalSet('dreco_expenses', JSON.stringify(drecoExpenses)); window.drecoExpenses = drecoExpenses; }
function persistEvents(){ safeLocalSet('dreco_events', JSON.stringify(drecoEvents)); }
function persistAudit(){ safeLocalSet('dreco_audit', JSON.stringify(drecoAudit)); }
function auditAction(area, action, detail=''){
  drecoAudit.unshift({id:String(Date.now()), area, action, detail, user:currentUser?.display||'System', ts:new Date().toISOString()});
  if(drecoAudit.length>200) drecoAudit.length=200;
  persistAudit();
}
function hasRole(role){ return currentUser?.role===role; }
function canManageFinance(){ return hasRole('admin') || hasRole('finance'); }
function requireAdminAction(label='This action'){
  if(hasRole('admin')) return true;
  showToast(`${label} is available to administrators only`,'error');
  return false;
}
function requireFinanceAction(label='This finance action'){
  if(canManageFinance()) return true;
  showToast(`${label} is available to admins and finance users only`,'error');
  return false;
}
function userFilterKey(){ return `dreco_filters_${currentUser?.username||'guest'}`; }
function saveUserFilters(next={}){
  const current=JSON.parse(safeLocalGet(userFilterKey())||'{}');
  safeLocalSet(userFilterKey(), JSON.stringify({...current,...next,savedAt:new Date().toISOString()}));
}
function restoreUserFilters(){
  const saved=JSON.parse(safeLocalGet(userFilterKey())||'{}');
  if(saved.globalSearch){
    const global=document.getElementById('global-search'); if(global) global.value=saved.globalSearch;
    const pro=document.getElementById('pro-search'); if(pro) pro.value=saved.globalSearch;
    const lb=document.getElementById('lb-search'); if(lb) lb.value=saved.globalSearch;
  }
}
function getSmartAlerts(){
  const now=Date.now(), day=86400000;
  const oldPermit=proDB.filter(r=>proPipelineStageValue(r)==='WORK PERMIT' && drecoDateValue(r.submitted) && now-drecoDateValue(r.submitted)>7*day);
  const oldVisa=proDB.filter(r=>proPipelineStageValue(r)==='VISA' && Math.max(drecoDateValue(r.mol),drecoDateValue(r.submitted)) && now-Math.max(drecoDateValue(r.mol),drecoDateValue(r.submitted))>10*day);
  const unpaid=proDB.filter(r=>proBalance(r)>0).sort((a,b)=>proBalance(b)-proBalance(a));
  const travel=proDB.filter(r=>proPipelineStageValue(r)==='TICKET BOOKED');
  return [
    {label:'Work permit overdue',value:oldPermit.length,icon:'ti-clock-exclamation',tone:'warn',target:"switchTab('pro')"},
    {label:'Visa pending too long',value:oldVisa.length,icon:'ti-id-badge-2',tone:'coffee',target:"switchTab('pro')"},
    {label:'Unpaid commissions',value:unpaid.length,icon:'ti-cash-banknote',tone:'money',target:"switchTab('commissions')"},
    {label:'Tickets booked',value:travel.length,icon:'ti-ticket',tone:'blue',target:'openPendingTravelView()'}
  ].filter(a=>a.value>0);
}
function renderSmartAlertsHTML(){
  const alerts=getSmartAlerts();
  if(!alerts.length) return '';
  return `<section class="smart-alert-strip">${alerts.map(a=>`<button class="smart-alert ${a.tone}" onclick="${a.target}"><i class="ti ${a.icon}"></i><span>${a.label}</span><strong>${a.value}</strong></button>`).join('')}</section>`;
}
function getCommissionTransactions(){
  return proDB.filter(r=>Number(r.paid)>0).map(r=>({candidate:r.name, ref:r.company||r.position||'Professional Jobs', amount:Number(r.paid)||0, date:latestCommissionTs(r)||drecoDateValue(r.submitted), note:getLatestTimelineText('pro',r.id)})).sort((a,b)=>b.date-a.date);
}
function getRepaymentTransactions(){
  return lbDB.filter(isTravelledLB).flatMap(r=>[
    {candidate:r.name, ref:'Installment 1', amount:Number(r.r1Amt||r.r1_amt)||0, date:drecoDateValue(r.r1Date||r.r1_date)},
    {candidate:r.name, ref:'Installment 2', amount:Number(r.r2Amt||r.r2_amt)||0, date:drecoDateValue(r.r2Date||r.r2_date)}
  ].filter(x=>x.amount>0)).sort((a,b)=>b.date-a.date);
}
function renderTransactionHistory(id, rows, currencyFn){
  const el=document.getElementById(id); if(!el) return;
  el.innerHTML=rows.length?`<div class="transaction-list">${rows.slice(0,8).map(row=>`<div class="transaction-row"><div><strong>${escHTML(row.candidate)}</strong><span>${escHTML(row.ref||'Update')}</span></div><div><b>${currencyFn(row.amount)}</b><em>${row.date?fmtDate(new Date(row.date).toISOString().slice(0,10)):'No date'}</em></div></div>`).join('')}</div>`:'<div class="mini-empty">No payment transactions yet</div>';
}
function setFinancePeriod(value){ financePeriod=value||'month'; window.renderDash?.(); }
function getLatestTimelineText(type,id){
  const item=(allTimelines[`${type}_${id}`]||[])[0];
  if(!item) return 'No updates yet';
  return `${item.action} - ${new Date(item.ts).toLocaleDateString('en-GB')}`;
}
function renderMetricCards(id,cards){
  const el=document.getElementById(id); if(!el) return;
  el.innerHTML=cards.map(c=>`<div class="metric-card ${c.cls||'mc-default'}"><div class="metric-label">${escHTML(c.label)}</div><div class="metric-val ${c.small?'sm':''}">${c.value}</div></div>`).join('');
}
function getTravelRows(){
  const pro=proDB.map(r=>{ const stage=proPipelineStageValue(r); return {type:'pro',id:r.id,name:r.name,workflow:'Professional Jobs',company:r.company||r.country||'-',status:r.position||stage||'-',date:r.travel,travelled:stage==='TRAVELLED',airline:r.airline||'Not recorded',time:r.travelTime||'Not recorded',notes:r.travelNotes||getLatestTimelineText('pro',r.id)}; });
  const lb=lbDB.map(r=>({type:'lb',id:r.id,name:r.name,workflow:'General Jobs',company:r.country||getActiveGeneralCountry(),status:r.travelStatus||r.travel_status||'-',date:r.travelDate||r.travel_date,travelled:(r.travelStatus||r.travel_status)==='TRAVELLED',airline:r.airline||'Not recorded',time:r.travelTime||'Not recorded',notes:r.notes||getLatestTimelineText('lb',r.id)}));
  return [...pro,...lb];
}
function drecoDateValue(value){
  if(!value) return 0;
  const t=new Date(value).getTime();
  return Number.isFinite(t)?t:0;
}
function latestTimelineTs(type,id){
  const list=allTimelines[`${type}_${id}`]||[];
  return list.reduce((max,item)=>Math.max(max,drecoDateValue(item.ts)),0);
}
function latestCommissionTs(row){
  return Math.max(drecoDateValue(row.paidDate||row.paid_date||row.paymentDate||row.payment_date), latestTimelineTs('pro',row.id));
}
function latestRepaymentTs(row){
  return Math.max(drecoDateValue(row.r2Date||row.r2_date), drecoDateValue(row.r1Date||row.r1_date), latestTimelineTs('lb',row.id));
}
function isTravelledLB(row){
  const status=String(row.travelStatus||row.travel_status||'').toUpperCase();
  return status==='TRAVELLED' || !!(row.travelDate||row.travel_date);
}
function populateExpenseCandidateOptions(){
  const list=document.getElementById('expense-candidate-options');
  if(!list) return;
  const names=[...proDB.map(r=>r.name),...lbDB.map(r=>r.name)].filter(Boolean);
  list.innerHTML=[...new Set(names)].sort((a,b)=>a.localeCompare(b)).map(name=>`<option value="${escHTML(name)}"></option>`).join('');
}
function renderTravel(){
  const rows=getTravelRows().sort((a,b)=>drecoDateValue(b.date)-drecoDateValue(a.date) || Number(b.travelled)-Number(a.travelled) || String(a.name||'').localeCompare(String(b.name||'')));
  const filter=document.getElementById('travel-filter')?.value||'all';
  const shown=rows.filter(r=>filter==='all'||(filter==='travelled'?r.travelled:!r.travelled));
  renderMetricCards('travel-metrics',[{label:'Travelled',value:rows.filter(r=>r.travelled).length,cls:'mc-green'},{label:'Pending travel',value:rows.filter(r=>!r.travelled&&r.date).length,cls:'mc-amber'},{label:'No travel date',value:rows.filter(r=>!r.date).length,cls:'mc-red'}]);
  const tb=document.getElementById('travel-tbody'); if(!tb) return;
  tb.innerHTML=shown.length?shown.map(r=>`<tr onclick="${r.type==='pro'?'editPro':'editLB'}(${r.id})"><td class="name-cell">${escHTML(r.name)}</td><td>${r.workflow}</td><td>${escHTML(r.company)}</td><td>${escHTML(r.status)}</td><td>${fmtDate(r.date)}</td><td>${escHTML(r.airline)}</td><td>${escHTML(r.time)}</td><td>${escHTML(r.notes)}</td></tr>`).join(''):'<tr><td colspan="8"><div class="mini-empty">No travel records found</div></td></tr>';
}
function renderCommissions(){
  const billed=proDB.reduce((sum,row)=>sum+(Number(row.commission)||0),0), paid=proDB.reduce((sum,row)=>sum+proPaidAmount(row),0);
  const dueNow=proDB.reduce((sum,row)=>sum+proPaymentStatus(row).dueNow,0);
  const rows=[...proDB].sort((a,b)=>latestCommissionTs(b)-latestCommissionTs(a) || proPaidAmount(b)-proPaidAmount(a));
  renderMetricCards('commission-metrics',[{label:'Billed',value:moneyKES(billed),cls:'mc-ink',small:true},{label:'Received',value:moneyKES(paid),cls:'mc-green',small:true},{label:'Due now',value:moneyKES(dueNow),cls:'mc-red',small:true},{label:'Outstanding',value:moneyKES(billed-paid),cls:'mc-amber',small:true}]);
  renderTransactionHistory('commission-history', getCommissionTransactions(), moneyKES);
  const tb=document.getElementById('commissions-tbody'); if(!tb) return;
  tb.innerHTML=rows.length?rows.map(r=>{
    const bal=proBalance(r);
    const payment=proPaymentStatus(r);
    const actions=`<button class="action-link" onclick="event.stopPropagation();openAddPayment(${r.id})" title="Add payment">+ Pay</button>`
      +(bal>0?` <button class="action-link" style="color:var(--green,#22A06B)" onclick="event.stopPropagation();markCommissionCleared(${r.id})" title="Mark fully paid">âœ“ Cleared</button>`:'');
    return `<tr onclick="editPro(${r.id})"><td class="name-cell">${escHTML(r.name)}</td><td>${escHTML(r.company||'-')}</td><td>${escHTML(r.position||'-')}</td><td>${moneyKES(r.commission)}</td><td>${moneyKES(payment.paid)}</td><td class="${payment.dueNow>0?'balance-owed':''}">${moneyKES(payment.dueNow)}</td><td class="${bal>0?'balance-owed':''}">${moneyKES(bal)}</td><td>${escHTML(getLatestTimelineText('pro',r.id))}</td><td onclick="event.stopPropagation()" style="white-space:nowrap">${actions}</td></tr>`;
  }).join(''):'<tr><td colspan="9"><div class="mini-empty">No commission records yet</div></td></tr>';
}
// Record a Pro commission payment of `amount` on `date` into the paid1/paid2
// slots (each with its own date) and recompute the total. Storing the date is
// what lets a payment surface in Latest Transactions ordered by when it was
// actually paid â€” previously these flows bumped only `paid`, so the entry was
// dated by the candidate's submission date and never sorted as the latest.
// Mutates `r` in place and returns the field updates to persist.
// Keep the legacy mirrors (paid, paid1/paid2 + dates) in step with the
// commissionPayments array so balances, the dashboard, and older schemas stay
// correct. paid = sum of every installment; paid1/paid2 mirror the first two.
function syncCommissionMirrors(r) {
  const pays = Array.isArray(r.commissionPayments) ? r.commissionPayments : [];
  r.paid = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0) || null;
  r.paid1 = pays[0] ? (Number(pays[0].amount) || 0) : null;
  r.paid1_date = pays[0]?.date || null;
  r.paid2 = pays[1] ? (Number(pays[1].amount) || 0) : null;
  r.paid2_date = pays[1]?.date || null;
}
function proCommissionUpdates(r) {
  return {
    commission_payments: r.commissionPayments || [],
    paid1: r.paid1 ?? null, paid1_date: r.paid1_date ?? null,
    paid2: r.paid2 ?? null, paid2_date: r.paid2_date ?? null,
    paid: r.paid ?? null,
  };
}
function _proCommSnapshot(r) {
  return { commissionPayments: JSON.parse(JSON.stringify(r.commissionPayments || [])), paid1:r.paid1, paid1_date:r.paid1_date, paid2:r.paid2, paid2_date:r.paid2_date, paid:r.paid };
}
function _restoreProComm(r, s) {
  r.commissionPayments = s.commissionPayments; r.paid1 = s.paid1; r.paid1_date = s.paid1_date; r.paid2 = s.paid2; r.paid2_date = s.paid2_date; r.paid = s.paid;
}
function _afterCommissionChange() {
  window.renderPaymentsPage?.();
  renderCommissions();
  window.renderDash?.();
  window.renderFinancePage?.();
  refreshOpenProCommissionTab();
}
// Append a commission installment to the array and return the fields to persist.
function applyProPayment(r, amount, date) {
  const d = date || new Date().toISOString().slice(0, 10);
  r.commissionPayments = Array.isArray(r.commissionPayments) ? r.commissionPayments : [];
  r.commissionPayments.push({ amount: Number(amount) || 0, date: d });
  syncCommissionMirrors(r);
  return proCommissionUpdates(r);
}
// Persist a Pro commission update, degrading gracefully when the extended
// columns (commission_payments / paid1_date â€¦) have not been migrated yet:
// retry with just the core paid1/paid2/paid so the amount still saves.
async function persistProPaymentUpdate(id, updates) {
  try { await dbUpdate('pro_candidates', id, updates); }
  catch (e) {
    if (isMissingColumnError(e)) {
      await dbUpdate('pro_candidates', id, { paid1: updates.paid1 ?? null, paid2: updates.paid2 ?? null, paid: updates.paid ?? null });
    } else throw e;
  }
}
// â”€â”€ Commission installment ledger (Payments tab) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function addCommissionInstallment(id, amount, date) {
  const r = proDB.find(x => String(x.id) === String(id)); if (!r) return false;
  const amt = Number(amount) || 0;
  if (amt <= 0) { showToast('Enter a valid amount.', 'error'); return false; }
  const commission = Number(r.commission) || 0;
  const outstanding = Math.max(commission - proPaidAmount(r), 0);
  if (commission > 0 && amt > outstanding) { showToast(`Amount exceeds outstanding balance of ${moneyKES(outstanding)}.`, 'error'); return false; }
  const snapshot = _proCommSnapshot(r);
  const updates = applyProPayment(r, amt, date || new Date().toISOString().slice(0,10));
  try {
    if (useCloud()) await persistProPaymentUpdate(id, updates); else saveLocalStore();
    addTimeline('pro', id, `Installment ${r.commissionPayments.length}: ${moneyKES(amt)}`);
    auditAction('Finance', 'Commission installment added', `${r.name} â€” ${moneyKES(amt)}`);
  } catch(e) { _restoreProComm(r, snapshot); showToast(e.message || 'Save failed.', 'error'); return false; }
  _afterCommissionChange();
  return true;
}
async function removeCommissionInstallment(id, index) {
  const r = proDB.find(x => String(x.id) === String(id)); if (!r || !Array.isArray(r.commissionPayments)) return;
  if (!r.commissionPayments[index]) return;
  if (!confirm('Remove this installment?')) return;
  const snapshot = _proCommSnapshot(r);
  r.commissionPayments.splice(index, 1);
  syncCommissionMirrors(r);
  try { if (useCloud()) await persistProPaymentUpdate(id, proCommissionUpdates(r)); else saveLocalStore(); addTimeline('pro', id, 'Installment removed'); }
  catch(e) { _restoreProComm(r, snapshot); showToast(e.message || 'Save failed.', 'error'); return; }
  _afterCommissionChange();
}
// Edit an installment's amount and date together (one save) â€” used by the
// installment view/edit popup.
async function saveInstallmentEdit(id, index, amount, date) {
  const r = proDB.find(x => String(x.id) === String(id)); if (!r || !Array.isArray(r.commissionPayments)) return false;
  const p = r.commissionPayments[index]; if (!p) return false;
  const amt = Number(amount) || 0;
  const errEl = document.getElementById('inst-e-error');
  const fail = m => { if (errEl) { errEl.textContent = m; errEl.style.display = 'block'; } };
  if (amt <= 0) { fail('Enter a valid amount.'); return false; }
  const commission = Number(r.commission) || 0;
  const others = proPaidAmount(r) - (Number(p.amount) || 0);
  if (commission > 0 && (others + amt) > commission) { fail(`Total would exceed the commission of ${moneyKES(commission)}.`); return false; }
  const snapshot = _proCommSnapshot(r);
  p.amount = amt; p.date = date || '';
  syncCommissionMirrors(r);
  try { if (useCloud()) await persistProPaymentUpdate(id, proCommissionUpdates(r)); else saveLocalStore(); auditAction('Finance', 'Installment edited', `${r.name} â€” ${moneyKES(amt)}`); }
  catch(e) { _restoreProComm(r, snapshot); fail(e.message || 'Save failed.'); return false; }
  _afterCommissionChange();
  return true;
}
// Installment view/edit popup. View shows the amount + date; Edit reveals inputs.
function openInstallmentModal(id, index, edit = false) {
  const r = proDB.find(x => String(x.id) === String(id));
  const modal = document.getElementById('installment-modal');
  const body = document.getElementById('inst-modal-body');
  if (!r || !modal || !body) return;
  const p = (r.commissionPayments || [])[index];
  if (!p) { closeModal('installment-modal'); return; }
  modal.dataset.id = String(id);
  modal.dataset.idx = String(index);
  const title = document.getElementById('inst-modal-title');
  if (title) title.textContent = `Installment ${Number(index) + 1}`;
  const dateISO = p.date ? String(p.date).slice(0, 10) : '';
  if (edit) {
    body.innerHTML = `
      <div class="form-grid" style="grid-template-columns:1fr 1fr">
        <div class="field"><label for="inst-e-amount">Amount (KES)</label><input id="inst-e-amount" type="number" min="1" value="${Number(p.amount) || 0}"></div>
        <div class="field"><label for="inst-e-date">Date paid</label><input id="inst-e-date" type="date" value="${dateISO}"></div>
      </div>
      <div class="login-error" id="inst-e-error" role="alert" style="display:none"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button class="btn" data-action="inst.viewmode">Cancel</button>
        <button class="btn primary" data-action="inst.save">Save</button>
      </div>`;
  } else {
    body.innerHTML = `
      <div style="text-align:center;padding:4px 0 6px">
        <div style="font-size:11px;color:var(--text-2,#71717a);text-transform:uppercase;letter-spacing:.05em">${escHTML(r.name || 'Candidate')}</div>
        <div style="font-size:32px;font-weight:700;color:#0F7A52;margin-top:10px;line-height:1">${moneyKES(p.amount)}</div>
        <div style="font-size:13px;color:var(--text-2,#71717a);margin-top:8px;display:inline-flex;align-items:center;gap:6px"><i class="ti ti-calendar-event"></i>Paid ${p.date ? escHTML(fmtDate(dateISO)) : 'date not set'}</div>
      </div>
      <div style="display:flex;gap:8px;justify-content:space-between;align-items:center;margin-top:16px;padding-top:14px;border-top:1px solid var(--border,#EEF0F2)">
        <button class="btn" data-action="inst.remove" style="color:#dc2626">Remove</button>
        <div style="display:flex;gap:8px">
          <button class="btn" data-action="modal.close" data-modal="installment-modal">Close</button>
          <button class="btn primary" data-action="inst.edit"><i class="ti ti-pencil" style="font-size:14px"></i> Edit</button>
        </div>
      </div>`;
  }
  modal.classList.add('open');
}
function openAddPayment(id) {
  const r = proDB.find(x => x.id === id); if (!r) return;
  const bal = proBalance(r);
  document.getElementById('ap-name').textContent = r.name;
  document.getElementById('ap-balance').textContent = `Outstanding: ${moneyKES(bal)} of ${moneyKES(r.commission||0)} billed`;
  document.getElementById('ap-amount').value = '';
  document.getElementById('ap-date').value = new Date().toISOString().slice(0,10);
  const errEl = document.getElementById('ap-error');
  if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
  document.getElementById('ap-modal').dataset.candidateId = id;
  document.getElementById('ap-modal').classList.add('open');
}
async function submitAddPayment() {
  const modal = document.getElementById('ap-modal');
  const id = Number(modal?.dataset.candidateId || 0);
  const amount = Number(document.getElementById('ap-amount')?.value || 0);
  const date = document.getElementById('ap-date')?.value || new Date().toISOString().slice(0,10);
  const errEl = document.getElementById('ap-error');
  const fail = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } };
  if (!id) return fail('Candidate not found.');
  if (!amount || amount <= 0) return fail('Enter a valid amount.');
  const r = proDB.find(x => x.id === id); if (!r) return fail('Candidate not found.');
  const commission = Number(r.commission) || 0;
  const alreadyPaid = proPaidAmount(r);
  const outstanding = Math.max(commission - alreadyPaid, 0);
  if (commission > 0 && amount > outstanding) return fail(`Amount exceeds outstanding balance of ${moneyKES(outstanding)}.`);
  const snapshot = _proCommSnapshot(r);
  const updates = applyProPayment(r, amount, date);
  try {
    if (useCloud()) await persistProPaymentUpdate(id, updates);
    else saveLocalStore();
    addTimeline('pro', id, `Payment received: ${moneyKES(amount)} on ${date}`);
    auditAction('Finance', 'Commission payment received', `${r.name} â€” ${moneyKES(amount)}`);
  } catch(e) { _restoreProComm(r, snapshot); return fail(e.message || 'Save failed.'); }
  closeModal('ap-modal');
  _afterCommissionChange();
  showToast(`${moneyKES(amount)} recorded`, 'success');
}
async function markCommissionCleared(id) {
  const r = proDB.find(x => x.id === id); if (!r) return;
  const commission = Number(r.commission) || 0;
  if (!commission) { showToast('No commission amount set on this candidate.', 'error'); return; }
  if (!confirm(`Mark ${r.name} as fully paid (${moneyKES(commission)})?`)) return;
  const snapshot = _proCommSnapshot(r);
  const today = new Date().toISOString().slice(0, 10);
  const outstanding = Math.max(commission - proPaidAmount(r), 0);
  // Record the cleared balance as a dated payment so it appears in Latest
  // Transactions, then pin the total to the full commission.
  const updates = outstanding > 0 ? applyProPayment(r, outstanding, today) : {};
  updates.paid = commission; r.paid = commission;
  try {
    if (useCloud()) await persistProPaymentUpdate(id, updates);
    else saveLocalStore();
    addTimeline('pro', id, `Commission cleared: ${moneyKES(commission)}`);
    auditAction('Finance', 'Commission marked cleared', `${r.name} â€” ${moneyKES(commission)}`);
  } catch(e) { _restoreProComm(r, snapshot); showToast(e.message || 'Save failed.', 'error'); return; }
  _afterCommissionChange();
  showToast(`${r.name} marked as cleared`, 'success');
}
function renderRepayments(){
  const travelled=lbDB.filter(isTravelledLB).sort((a,b)=>latestRepaymentTs(b)-latestRepaymentTs(a));
  const owed=travelled.reduce((sum,row)=>sum+lbRefundPrincipal(row),0);
  const paid=travelled.reduce((sum,row)=>sum+lbRefundPaidAmount(row),0);
  renderMetricCards('repayment-metrics',[{label:'Travelled clients',value:travelled.length,cls:'mc-default'},{label:'Paid',value:moneyUSD(paid),cls:'mc-green',small:true},{label:'Outstanding',value:moneyUSD(owed-paid),cls:'mc-amber',small:true}]);
  renderTransactionHistory('repayment-history', getRepaymentTransactions(), moneyUSD);
  const tb=document.getElementById('repayments-tbody'); if(!tb) return;
  tb.innerHTML=travelled.length?travelled.map(r=>{const toR=lbRefundPrincipal(r),p=lbRefundPaidAmount(r);return `<tr onclick="editLB(${r.id})"><td class="name-cell">${escHTML(r.name)}</td><td>${escHTML(r.ppStatus||r.pp_status||'-')}</td><td>${fmtDate(r.travelDate||r.travel_date)}</td><td>${moneyUSD(toR)}</td><td>${moneyUSD(p)}</td><td>${moneyUSD(lbRefundOutstanding(r))}</td><td>${fmtDate(r.r1Date||r.r1_date)} ${r.r1Amt?moneyUSD(r.r1Amt):''}<br>${fmtDate(r.r2Date||r.r2_date)} ${r.r2Amt?moneyUSD(r.r2Amt):''}</td><td><button class="action-link" onclick="event.stopPropagation();editLB(${r.id})">Update</button></td></tr>`}).join(''):'<tr><td colspan="8"><div class="mini-empty">No travelled clients with repayment records yet</div></td></tr>';
}
function renderExpenses(){
  const total=drecoExpenses.reduce((s,e)=>s+(Number(e.amount)||0),0);
  renderMetricCards('expense-metrics',[{label:'Total expenses',value:moneyKES(total),cls:'mc-red',small:true},{label:'Entries',value:drecoExpenses.length,cls:'mc-default'},{label:'This month',value:moneyKES(drecoExpenses.filter(e=>(e.date||'').slice(0,7)===new Date().toISOString().slice(0,7)).reduce((s,e)=>s+(Number(e.amount)||0),0)),cls:'mc-amber',small:true}]);
  const tb=document.getElementById('expenses-tbody'); if(!tb) return;
  tb.innerHTML=drecoExpenses.length?drecoExpenses.map(e=>`<tr><td>${fmtDate(e.date)}</td><td class="name-cell">${escHTML(e.client||'-')}</td><td>${escHTML(e.category||'-')}</td><td>${moneyKES(e.amount)}</td><td>${escHTML(e.notes||'-')}</td><td><button class="action-link" onclick="deleteExpense('${e.id}')">Delete</button></td></tr>`).join(''):'<tr><td colspan="6"><div class="mini-empty">No expenses recorded yet</div></td></tr>';
}
function renderTeam(){
  const grid=document.getElementById('team-grid'); if(!grid) return;
  const users=(typeof getCompanyUsers==='function'?getCompanyUsers():[]).map(([username,account])=>({username,...account}));
  const fallback=currentUser?[{username:currentUser.username||'user',...currentUser}]:[{display:DEFAULT_ADMIN_USERNAME,role:'admin',username:DEFAULT_ADMIN_USERNAME}];
  const list=users.length?users:fallback;
  const isAdmin=currentUser?.role==='admin';
  grid.innerHTML=list.map(u=>{
    const username = escHTML(u.username || 'user');
    const removable = isAdmin && username !== currentUser?.username;
    return `<div class="team-card" ${isAdmin?`data-action="team.edit" data-username="${username}"`:''} style="${isAdmin?'cursor:pointer':''}">
      <div class="team-card-head">
        <div class="team-avatar">${escHTML((u.display||u.username||'U').slice(0,2).toUpperCase())}</div>
        <div><div class="team-name">${escHTML(u.display||u.username||'User')}</div><div class="team-role">${u.role==='admin'?'Administrator':'Staff'} @${username}</div></div>
      </div>
      <div class="team-perms"><span>Dashboard</span><span>Professional Jobs</span><span>General Jobs</span><span>Finance</span><span>Reports</span></div>
      ${isAdmin?`<div class="team-actions">
        <button class="btn" type="button" data-action="team.edit" data-username="${username}"><i class="ti ti-pencil"></i>Edit</button>
        ${removable?`<button class="btn danger" type="button" data-action="team.remove" data-username="${username}"><i class="ti ti-trash"></i>Remove</button>`:''}
      </div>`:''}
    </div>`;
  }).join('');
}
function getCurrentUserInitials(){
  const display=currentUser?.display||currentUser?.username||'User';
  const parts=display.replace(/[^a-zA-Z ]/g,'').trim().split(/\s+/).filter(Boolean);
  return parts.length>=2 ? (parts[0][0]+parts[parts.length-1][0]).toUpperCase() : display.substring(0,2).toUpperCase();
}
function renderAccountPage(){
  const el=document.getElementById('account-page-content'); if(!el) return;
  const savedAvatar=localStorage.getItem(AVATAR_KEY);
  const avatar=savedAvatar ? `<img src="${savedAvatar}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:999px">` : escHTML(getCurrentUserInitials());
  const display=escHTML(currentUser?.display||'User');
  const username=escHTML(currentUser?.username||'user');
  const role=currentUser?.role==='admin'?'Administrator':'Staff';
  const account=STAFF_ACCOUNTS[currentUser?.username || ''] || currentUser || {};
  const email=escHTML(account.email || '');
  const emailVerified=account.emailVerified === true;
  el.innerHTML=`
    <div class="dv5-profile-panel account-profile-page">
      <div class="dv5-profile-hero">
        <div class="dv5-profile-avatar">${avatar}</div>
        <div class="dv5-profile-info">
          <h2>${display}</h2>
          <p>${escHTML(getCompanyName())}</p>
          <div class="dv5-profile-meta">
            <span><i class="ti ti-user"></i>@${username}</span>
            <span><i class="ti ti-shield"></i>${role}</span>
            <span><i class="ti ti-building"></i>${escHTML(getCompanyName())}</span>
          </div>
        </div>
        <div class="dv5-profile-stage">
          <span class="dv5-badge green">Active</span>
          <small>Workspace account</small>
        </div>
      </div>
      <div class="dv5-profile-grid account-profile-grid">
        <div class="dv5-card">
          <div class="dv5-card-title">Profile photo</div>
          <div style="display:flex;align-items:center;gap:14px">
            <button type="button" class="dv5-profile-avatar account-avatar-edit" onclick="document.getElementById('account-avatar-upload')?.click()" title="Upload profile photo">${avatar}</button>
            <div>
              <button class="dv5-btn" onclick="document.getElementById('account-avatar-upload')?.click()"><i class="ti ti-camera"></i>Upload photo</button>
              <button class="dv5-btn" style="margin-left:6px;display:${savedAvatar?'inline-flex':'none'}" onclick="removeUserAvatar();renderAccountPage()"><i class="ti ti-trash"></i>Remove</button>
              <input type="file" id="account-avatar-upload" accept="image/*" style="display:none" onchange="handleAccountAvatarUpload(event)">
              <p style="margin:9px 0 0;color:#7B8496;font-size:12px">JPG, PNG or GIF under 2MB.</p>
            </div>
          </div>
        </div>
        <div class="dv5-card">
          <div class="dv5-card-title">Account access</div>
          <div class="detail-grid"><span>Role</span><strong>${role}</strong><span>Username</span><strong>@${username}</strong><span>Company</span><strong>${escHTML(getCompanyName())}</strong></div>
        </div>
        <div class="dv5-card">
          <div class="dv5-card-title">Quick links</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <button class="dv5-btn" data-action="tab.switch" data-tab="team"><i class="ti ti-users"></i>Team</button>
            <button class="dv5-btn" data-action="tab.switch" data-tab="settings"><i class="ti ti-settings"></i>Settings</button>
          </div>
        </div>
      </div>
      <div class="dv5-card">
        <div class="dv5-card-title">Edit profile</div>
        <div class="account-form-grid">
          <label class="field"><span>Display name</span><input id="account-display-name" value="${display}" placeholder="Your name"></label>
          <label class="field"><span>Username</span><input id="account-username" value="${username}" placeholder="username" autocomplete="off"></label>
          <label class="field"><span>Email</span><input id="account-email" type="email" value="${email}" placeholder="you@company.com" autocomplete="email"></label>
          <label class="field"><span>Current password</span><input id="account-current-pw" type="password" placeholder="Required when changing password"></label>
          <label class="field"><span>New password</span><input id="account-new-pw" type="password" placeholder="New password"></label>
          <label class="field"><span>Confirm password</span><input id="account-confirm-pw" type="password" placeholder="Repeat new password"></label>
        </div>
        <div class="dv5-card" style="margin-top:14px;box-shadow:none">
          <div class="dv5-card-title">Email verification</div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div style="color:#657188;font-size:12px">
              ${email ? `Recovery email: <strong style="color:#0B1024">${email}</strong>` : 'Add an email so password recovery can be sent to you.'}
              <span class="settings-pill" style="margin-left:8px">${emailVerified ? 'Verified' : 'Not verified'}</span>
            </div>
            <button class="dv5-btn" data-action="account.email.request"><i class="ti ti-mail"></i>Send code</button>
          </div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:12px;max-width:420px">
            <input id="account-email-code" placeholder="6-digit code" inputmode="numeric" style="height:38px;border:1px solid #DDE4F0;border-radius:10px;padding:0 12px;flex:1">
            <button class="dv5-btn primary" data-action="account.email.verify">Verify</button>
          </div>
        </div>
        <div class="pd-msg" id="account-profile-msg"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
          <button class="dv5-btn" onclick="renderAccountPage()">Reset</button>
          <button class="dv5-btn primary" onclick="saveAccountPageChanges()"><i class="ti ti-device-floppy"></i>Save changes</button>
        </div>
      </div>
    </div>`;
}
function duplicateMap(rows, getter){
  const map = new Map();
  rows.forEach(r => {
    const key = String(getter(r)||'').trim().toUpperCase();
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  });
  return map;
}
function pushIntegrityIssue(issues, severity, stream, record, title, detail, action = ''){
  issues.push({
    severity,
    stream,
    record,
    title,
    detail,
    action,
    name: record?.name || 'Workspace',
  });
}
function buildDataIntegrityReport(){
  const issues = [];
  const proRows = Array.isArray(proDB) ? proDB : [];
  const lbRows = Array.isArray(lbDB) ? lbDB : [];

  duplicateMap(proRows, r => r.pp).forEach(list => {
    if (list.length > 1) list.forEach(r => pushIntegrityIssue(issues, 'high', 'Professional', r, 'Duplicate passport number', `${list.length} professional candidates share passport ${r.pp}.`, `editPro(${r.id})`));
  });
  duplicateMap(lbRows, r => r.phone).forEach(list => {
    if (list.length > 1) list.forEach(r => pushIntegrityIssue(issues, 'medium', 'General Jobs', r, 'Duplicate phone number', `${list.length} general-job candidates share phone ${r.phone}.`, `editLB(${r.id})`));
  });

  proRows.forEach(r => {
    const stage = canonicalProStage(r.stage || '');
    const pipelineStage = proPipelineStageValue(r);
    const payment = proPaymentStatus(r);
    const totalPaid = proPaidAmount(r);
    const commission = Number(r.commission)||0;
    if (!r.name) pushIntegrityIssue(issues, 'high', 'Professional', r, 'Missing candidate name', 'A professional record has no name.', `editPro(${r.id})`);
    if (commission < 0 || totalPaid < 0) pushIntegrityIssue(issues, 'high', 'Professional', r, 'Negative finance amount', 'Commission or payment values cannot be negative.', `editPro(${r.id})`);
    if (commission > 0 && totalPaid > commission) pushIntegrityIssue(issues, 'high', 'Professional', r, 'Payment exceeds commission', `${moneyKES(totalPaid)} paid against ${moneyKES(commission)} billed.`, `openBalancePayment('pro',${r.id})`);
    if (payment.dueNow > 0) pushIntegrityIssue(issues, 'medium', 'Professional', r, 'Commission due now', `${moneyKES(payment.dueNow)} is due based on the current payment rule.`, `openBalancePayment('pro',${r.id})`);
    if (pipelineStage !== stage && stage) pushIntegrityIssue(issues, 'medium', 'Professional', r, 'Stage does not match milestones', `Stored stage is ${stage}; milestone dates place this candidate at ${pipelineStage}.`, `editPro(${r.id})`);
    if (pipelineStage === 'TRAVELLED' && !toInput(r.travel)) pushIntegrityIssue(issues, 'high', 'Professional', r, 'Travelled without travel date', 'Candidate is in Travelled but has no travel date.', `editPro(${r.id})`);
    if (toInput(r.travel) && pipelineStage !== 'TRAVELLED') pushIntegrityIssue(issues, 'medium', 'Professional', r, 'Travel date before final stage', `Travel date exists but pipeline stage is ${pipelineStage}.`, `editPro(${r.id})`);
    if (pipelineStage === 'VISA' && toInput(r.travel)) pushIntegrityIssue(issues, 'high', 'Professional', r, 'Travelled candidate still in Visa', 'This record has a travel date but is still showing at Visa.', `editPro(${r.id})`);
  });

  lbRows.forEach(r => {
    const stage = lbStageValue(r);
    const pipelineStage = lbPipelineStageValue(r);
    const principal = lbRefundPrincipal(r);
    const paid = lbRefundPaidAmount(r);
    const outstanding = lbRefundOutstanding(r);
    const ownPassport = lbOwnPassport(r);
    if (!r.name) pushIntegrityIssue(issues, 'high', 'General Jobs', r, 'Missing candidate name', 'A general-job record has no name.', `editLB(${r.id})`);
    if (!r.country) pushIntegrityIssue(issues, 'medium', 'General Jobs', r, 'Missing destination', 'General-job records should have a destination country.', `editLB(${r.id})`);
    if (principal < 0 || paid < 0) pushIntegrityIssue(issues, 'high', 'General Jobs', r, 'Negative refund amount', 'Refund values cannot be negative.', `editLB(${r.id})`);
    if (!ownPassport && principal > 0 && paid > principal) pushIntegrityIssue(issues, 'high', 'General Jobs', r, 'Refund paid exceeds expected', `${moneyUSD(paid)} paid against ${moneyUSD(principal)} expected.`, `openBalancePayment('lb',${r.id})`);
    if (ownPassport && paid > 0) pushIntegrityIssue(issues, 'medium', 'General Jobs', r, 'Own-passport candidate has refund payments', 'Own-passport records should not carry refund balances.', `editLB(${r.id})`);
    if (['TRAVELLED','REFUND PENDING','REFUND COMPLETE'].includes(stage) && !toInput(r.travelDate||r.travel_date)) pushIntegrityIssue(issues, 'high', 'General Jobs', r, 'Travelled without travel date', 'Candidate is post-travel but has no travel date.', `editLB(${r.id})`);
    if (toInput(r.travelDate||r.travel_date) && !['TRAVELLED','REFUND PENDING','REFUND COMPLETE'].includes(stage)) pushIntegrityIssue(issues, 'medium', 'General Jobs', r, 'Travel date before travel stage', `Travel date exists but stage is ${stage}.`, `editLB(${r.id})`);
    if (stage === 'REFUND COMPLETE' && outstanding > 0) pushIntegrityIssue(issues, 'high', 'General Jobs', r, 'Refund complete with balance', `${moneyUSD(outstanding)} is still outstanding.`, `openBalancePayment('lb',${r.id})`);
    if (pipelineStage !== stage && stage) pushIntegrityIssue(issues, 'medium', 'General Jobs', r, 'Stage does not match pipeline', `Stored stage is ${stage}; pipeline resolves it as ${pipelineStage}.`, `editLB(${r.id})`);
  });

  const high = issues.filter(i=>i.severity==='high').length;
  const medium = issues.filter(i=>i.severity==='medium').length;
  return { issues, high, medium, total: issues.length };
}
function renderDataIntegrityPanel(){
  const report = buildDataIntegrityReport();
  const rows = report.issues.slice(0, 12).map(issue => `
    <div class="integrity-row ${issue.severity}">
      <div>
        <strong>${escHTML(issue.title)}</strong>
        <span>${escHTML(issue.name)} Â· ${escHTML(issue.stream)} Â· ${escHTML(issue.detail)}</span>
      </div>
      ${issue.action ? `<button onclick="${issue.action}">Open</button>` : ''}
    </div>`).join('');
  return `
    <div class="settings-page-card integrity-card">
      <h3>Data health</h3>
      <p>Checks stage logic, duplicate identifiers, missing travel dates, and finance/refund maths before reports are trusted.</p>
      <div class="integrity-summary">
        <span><strong>${report.total}</strong> total issues</span>
        <span><strong>${report.high}</strong> high priority</span>
        <span><strong>${report.medium}</strong> needs review</span>
      </div>
      ${rows || '<div class="mini-empty">No data health issues found.</div>'}
      ${report.total > 12 ? `<div class="mini-empty">${report.total - 12} more issue(s) hidden. Use Candidates and Finance filters to review the rest.</div>` : ''}
    </div>`;
}
function updateNotificationBadge(count = null){
  const total = count == null ? buildDataIntegrityReport().total : count;
  const btn = document.getElementById('topbar-notif-btn');
  const nav = document.getElementById('nav-notifications');
  [btn, nav].forEach(el => {
    if (!el) return;
    el.classList.toggle('has-alerts', total > 0);
    el.setAttribute('data-count', String(total));
  });
}
function renderNotificationsPage(){
  const el=document.getElementById('notifications-page-content'); if(!el) return;
  const report = buildDataIntegrityReport();
  const auditRows = (Array.isArray(drecoAudit) ? drecoAudit : []).slice(0,8).map(a => `
    <div class="integrity-row notice">
      <div>
        <strong>${escHTML(a.action || 'Activity')}</strong>
        <span>${escHTML(a.area || 'Workspace')} - ${fmtDate(a.ts)}${a.detail ? ` - ${escHTML(a.detail)}` : ''}</span>
      </div>
    </div>`).join('');
  el.innerHTML = `
    ${renderDataIntegrityPanel()}
    <div class="settings-page-card integrity-card">
      <h3>Workspace notifications</h3>
      <p>Recent updates and system activity for this workspace.</p>
      ${auditRows || '<div class="mini-empty">No recent workspace notifications.</div>'}
    </div>`;
  updateNotificationBadge(report.total);
}
function renderSettingsPage(){
  const el=document.getElementById('settings-page-content'); if(!el) return;
  const syncCopy=appStorageMode==='cloud'?'Supabase cloud sync is active. Local fallback remains available if a write fails.':'Local mode is active. Configure Supabase to enable shared office sync.';
  el.innerHTML=`${renderWorkflowSettingsPanel()}${renderPaymentSettingsPanel()}<div class="settings-page-card"><h3>Workspace</h3><p>Manage company identity and data mode.</p><div class="setting-row"><span>Company</span><button onclick="openSettingsModal()">Edit</button></div><div class="setting-row"><span>Storage</span><span class="settings-pill">${appStorageMode==='cloud'?'Cloud':'Local'}</span></div></div><div class="settings-page-card"><h3>Pipeline</h3><p>Adjust stage lists from workflow templates, or add one-off custom stages from the candidate forms.</p><div class="setting-row"><span>Professional stages</span><span class="settings-pill">${proStages.length} stages</span></div><div class="setting-row"><span>General countries</span><button data-action="tab.switch" data-tab="lb">Open</button></div></div><div class="settings-page-card"><h3>Team & permissions</h3><p>Add staff and review roles from the Team page.</p><div class="setting-row"><span>Team members</span><button data-action="tab.switch" data-tab="team">Manage</button></div></div><div class="settings-page-card"><h3>Data</h3><p>Export backups or reset local filters.</p><div class="setting-row"><span>Backup</span><button onclick="downloadBackup()">Download</button></div><div class="setting-row"><span>Saved filters</span><button onclick="resetSavedFilters()">Reset</button></div></div><div class="settings-page-card"><h3>Sync health</h3><p>${syncCopy}</p><div class="setting-row"><span>Mode</span><span class="settings-pill">${appStorageMode==='cloud'?'Cloud first':'Local fallback'}</span></div><div class="setting-row"><span>Last sync issue</span><span>${escHTML(lastSyncError||'None')}</span></div></div>`;
}
function openQuickAddCandidate(){
  const modal=document.getElementById('quick-add-modal');
  if(modal) modal.classList.add('open');
}
function submitQuickAddCandidate(){
  const choice=document.querySelector('input[name="quick-workflow"]:checked')?.value || 'pro';
  closeModal('quick-add-modal');
  if(choice==='lb'){ switchTab('lb'); openLBForm(); return; }
  switchTab('pro'); openProForm();
}
function createStaffAccount(){
  if(!requireAdminAction('Adding users')) return;
  switchTab('team');
  const modal=document.getElementById('quick-user-modal');
  if(!modal){ showToast('User form is unavailable','error'); return; }
  ['quick-user-display','quick-user-username','quick-user-password'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  const role=document.getElementById('quick-user-role'); if(role) role.value='staff';
  const err=document.getElementById('quick-user-error'); if(err){ err.textContent=''; err.style.display='none'; }
  modal.classList.add('open');
}
async function submitQuickUser(){
  if (currentUser?.role !== 'admin') { showToast('Only admins can add users','error'); return; }
  const display=(document.getElementById('quick-user-display')?.value||'').trim();
  const username=(document.getElementById('quick-user-username')?.value||'').trim().toLowerCase();
  const role=document.getElementById('quick-user-role')?.value==='admin'?'admin':'staff';
  const password=(document.getElementById('quick-user-password')?.value||'').trim();
  const err=document.getElementById('quick-user-error');
  const fail=msg=>{ if(err){ err.textContent=msg; err.style.display='block'; } };
  if(!display) return fail('Display name is required.');
  if(!/^[a-z0-9._-]{3,32}$/.test(username)) return fail('Username must be 3-32 letters, numbers, dots, underscores, or hyphens.');
  if(STAFF_ACCOUNTS[username]) return fail('That username is already taken.');
  if(password.length<8) return fail('Temporary password must be at least 8 characters.');
  try{ await createWorkspaceUserAccount({ display, username, role, password }); }
  catch(e){ return fail(e.message||'User could not be created.'); }
  closeModal('quick-user-modal'); renderTeam(); renderCompanyUsers(); showToast('User added','success');
}
function openEditTeamMember(username: string){
  if(!requireAdminAction('Editing users')) return;
  const account=STAFF_ACCOUNTS[username];
  if(!account){ showToast('User not found','error'); return; }
  const unEl=document.getElementById('edit-team-username') as HTMLInputElement;
  const dispEl=document.getElementById('edit-team-display') as HTMLInputElement;
  const roleEl=document.getElementById('edit-team-role') as HTMLSelectElement;
  const errEl=document.getElementById('edit-team-error');
  if(unEl) unEl.value=username;
  if(dispEl) dispEl.value=account.display||'';
  if(roleEl) roleEl.value=account.role==='admin'?'admin':'staff';
  if(errEl){ errEl.textContent=''; (errEl as HTMLElement).style.display='none'; }
  document.getElementById('edit-team-modal')?.classList.add('open');
}
async function submitEditTeamMember(){
  if(currentUser?.role!=='admin'){ showToast('Only admins can edit users','error'); return; }
  const username=(document.getElementById('edit-team-username') as HTMLInputElement)?.value||'';
  const display=((document.getElementById('edit-team-display') as HTMLInputElement)?.value||'').trim();
  const role=(document.getElementById('edit-team-role') as HTMLSelectElement)?.value==='admin'?'admin':'staff';
  const errEl=document.getElementById('edit-team-error');
  const fail=(msg:string)=>{ if(errEl){ errEl.textContent=msg; (errEl as HTMLElement).style.display='block'; } };
  if(!display) return fail('Display name is required.');
  if(!STAFF_ACCOUNTS[username]) return fail('User not found.');
  STAFF_ACCOUNTS[username]={...STAFF_ACCOUNTS[username],display,role};
  try{ await saveStaffAccounts(); }
  catch(e:any){ return fail(e.message||'Could not save changes.'); }
  closeModal('edit-team-modal'); renderTeam(); renderCompanyUsers(); showToast('User updated','success');
}
async function removeTeamMember(username: string){
  if(currentUser?.role!=='admin'){ showToast('Only admins can remove users','error'); return; }
  username=String(username||'').trim().toLowerCase();
  if(!username || !STAFF_ACCOUNTS[username]){ showToast('User not found','error'); return; }
  if(username===String(currentUser?.username||'').toLowerCase()){ showToast('You cannot remove your own account','error'); return; }
  const companyUsers=(typeof getCompanyUsers==='function'?getCompanyUsers():[]).filter(([u])=>STAFF_ACCOUNTS[u]);
  const admins=companyUsers.filter(([,account])=>account?.role==='admin').map(([u])=>u);
  if(STAFF_ACCOUNTS[username]?.role==='admin' && admins.length<=1){ showToast('Keep at least one admin in the workspace','error'); return; }
  const label=STAFF_ACCOUNTS[username].display || username;
  if(!confirm(`Remove ${label} from this workspace? They will no longer appear in Team & Permissions.`)) return;
  const backup=STAFF_ACCOUNTS[username];
  delete STAFF_ACCOUNTS[username];
  try{
    const token=await authToken();
    if(token){
      try{ await postAuthAction({action:'delete_user',username},token); }
      catch(err){ console.warn('Supabase Auth user removal unavailable; removing local/cloud registry entry only:',err); }
    }
    await saveStaffAccounts();
  }catch(e:any){
    STAFF_ACCOUNTS[username]=backup;
    showToast(e.message||'User could not be removed','error');
    return;
  }
  if((document.getElementById('edit-team-username') as HTMLInputElement)?.value===username) closeModal('edit-team-modal');
  renderTeam(); renderCompanyUsers(); showToast('User removed','success');
}
function openRecordPaymentPrompt(type='commission'){
  if(!requireFinanceAction('Recording payments')) return;
  const typeEl=document.getElementById('qp-type');
  if(typeEl) typeEl.value=type;
  const dateEl=document.getElementById('qp-date');
  if(dateEl) dateEl.value=new Date().toISOString().slice(0,10);
  const amtEl=document.getElementById('qp-amount');
  if(amtEl) amtEl.value='';
  const errEl=document.getElementById('qp-error');
  if(errEl){ errEl.textContent=''; errEl.style.display='none'; }
  refreshPaymentCandidates();
  document.getElementById('quick-payment-modal')?.classList.add('open');
}
function refreshPaymentCandidates(){
  const type=document.getElementById('qp-type')?.value||'commission';
  const sel=document.getElementById('qp-candidate');
  if(!sel) return;
  const rows=type==='repayment'?lbDB.filter(isTravelledLB):proDB;
  sel.innerHTML='<option value="">â€” select â€”</option>'+rows.map(r=>`<option value="${r.id}">${escHTML(r.name)}</option>`).join('');
  const info=document.getElementById('qp-info');
  if(info) info.style.display='none';
}
function refreshPaymentInfo(){
  const type=document.getElementById('qp-type')?.value||'commission';
  const id=Number(document.getElementById('qp-candidate')?.value||0);
  const info=document.getElementById('qp-info');
  const content=document.getElementById('qp-info-content');
  if(!id||!info||!content){ if(info) info.style.display='none'; return; }
  if(type==='repayment'){
    const r=lbDB.find(x=>x.id===id);
    if(!r){ info.style.display='none'; return; }
    const owed=lbRefundPrincipal(r), paid=lbRefundPaidAmount(r);
    content.innerHTML=`<strong>${escHTML(r.name)}</strong><br>To refund: ${moneyUSD(owed)} &nbsp;|&nbsp; Paid: ${moneyUSD(paid)} &nbsp;|&nbsp; Outstanding: ${moneyUSD(owed-paid)}<br><small>Installment 1: ${r.r1Amt?moneyUSD(r.r1Amt)+' on '+fmtDate(r.r1Date):'â€”'} &nbsp;|&nbsp; Installment 2: ${r.r2Amt?moneyUSD(r.r2Amt)+' on '+fmtDate(r.r2Date):'â€”'}</small>`;
  } else {
    const r=proDB.find(x=>x.id===id);
    if(!r){ info.style.display='none'; return; }
    content.innerHTML=`<strong>${escHTML(r.name)}</strong><br>Commission billed: ${moneyKES(r.commission||0)} &nbsp;|&nbsp; Received: ${moneyKES(proPaidAmount(r))} &nbsp;|&nbsp; Outstanding: ${moneyKES(proBalance(r))}`;
  }
  info.style.display='block';
}
async function submitRecordPayment(){
  const type=document.getElementById('qp-type')?.value||'commission';
  const id=Number(document.getElementById('qp-candidate')?.value||0);
  const amount=Number(document.getElementById('qp-amount')?.value||0);
  const date=document.getElementById('qp-date')?.value||new Date().toISOString().slice(0,10);
  const errEl=document.getElementById('qp-error');
  const fail=msg=>{ if(errEl){ errEl.textContent=msg; errEl.style.display='block'; } };
  if(!id) return fail('Select a candidate.');
  if(!amount||amount<=0) return fail('Enter a valid amount greater than 0.');
  if(type==='repayment'){
    const r=lbDB.find(x=>x.id===id);
    if(!r) return fail('Candidate not found.');
    const outstanding=lbRefundOutstanding(r);
    if(amount>outstanding && outstanding>0) return fail(`Amount exceeds outstanding balance of ${moneyUSD(outstanding)}.`);
    const updates={};
    if(!r.r1Amt){ updates.r1Amt=amount; updates.r1Date=date; r.r1Amt=amount; r.r1Date=date; }
    else if(!r.r2Amt){ updates.r2Amt=amount; updates.r2Date=date; r.r2Amt=amount; r.r2Date=date; }
    else return fail('Both installments are already recorded. Open the candidate to edit.');
    try{ if(useCloud()) await dbUpdate('lb_candidates',id,updates); else saveLocalStore(); addTimeline('lb',id,`Payment recorded: ${moneyUSD(amount)}`); auditAction('Finance','Repayment recorded',`${r.name} - ${moneyUSD(amount)}`); }
    catch(e){ return fail(e.message||'Save failed.'); }
  } else {
    const r=proDB.find(x=>x.id===id);
    if(!r) return fail('Candidate not found.');
    const commission=Number(r.commission)||0;
    const alreadyPaid=proPaidAmount(r);
    if(commission>0 && amount>(commission-alreadyPaid)) return fail(`Amount exceeds outstanding balance of ${moneyKES(commission-alreadyPaid)}.`);
    const snapshot=_proCommSnapshot(r);
    const updates=applyProPayment(r, amount, date);
    try{ if(useCloud()) await persistProPaymentUpdate(id,updates); else saveLocalStore(); addTimeline('pro',id,`Commission payment: ${moneyKES(amount)}`); auditAction('Finance','Commission payment recorded',`${r.name} - ${moneyKES(amount)}`); }
    catch(e){ _restoreProComm(r, snapshot); return fail(e.message||'Save failed.'); }
  }
  closeModal('quick-payment-modal');
  if(type==='repayment') {
    renderRepayments();
    window.renderDash?.();
    window.renderFinancePage?.();
    window.renderPaymentsPage?.();
  } else {
    _afterCommissionChange();
  }
  showToast('Payment recorded','success');
}
// â”€â”€ Balance card quick payment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let _bpmType='', _bpmId=0, _bpmBalance=0, _bpmSubmitting=false;
function openBalancePayment(type, id){
  const r = type==='lb' ? lbDB.find(x=>x.id===id||String(x.id)===String(id)) : proDB.find(x=>x.id===id||String(x.id)===String(id));
  if(!r){ showToast('Candidate not found','error'); return; }
  const balance = type==='lb' ? lbRefundOutstanding(r) : proBalance(r);
  if(balance<=0){ showToast('Balance is already cleared','info'); return; }
  _bpmType=type; _bpmId=Number(id)||id; _bpmBalance=balance;
  const currency = type==='lb' ? 'USD' : 'KES';
  const fmt = type==='lb' ? moneyUSD : moneyKES;
  const paid = type==='lb' ? lbRefundPaidAmount(r) : proPaidAmount(r);
  const commission = type==='lb' ? lbRefundPrincipal(r) : (Number(r.commission)||0);
  document.getElementById('bpm-title').textContent = `Record Payment â€” ${escHTML(r.name)}`;
  document.getElementById('bpm-summary').innerHTML =
    `<strong>${escHTML(r.name)}</strong><br>`+
    `${type==='lb'?'To refund':'Commission'}: <b>${fmt(commission)}</b> &nbsp;|&nbsp; `+
    `Paid so far: <b>${fmt(paid)}</b><br>`+
    `<span style="color:#A7444A;font-weight:600">Outstanding: ${fmt(balance)}</span>`;
  const amtEl=document.getElementById('bpm-amount'); if(amtEl){ amtEl.value=''; amtEl.placeholder=`e.g. ${Math.round(balance/2)}`; }
  const dateEl=document.getElementById('bpm-date'); if(dateEl) dateEl.value=new Date().toISOString().slice(0,10);
  const errEl=document.getElementById('bpm-error'); if(errEl){ errEl.textContent=''; errEl.style.display='none'; }
  document.getElementById('balance-pay-modal')?.classList.add('open');
}
function fillFullBalance(){
  const el=document.getElementById('bpm-amount'); if(el) el.value=String(_bpmBalance);
}
async function submitBalancePayment(){
  const amount=Number(document.getElementById('bpm-amount')?.value||0);
  const date=document.getElementById('bpm-date')?.value||new Date().toISOString().slice(0,10);
  const errEl=document.getElementById('bpm-error');
  const fail=msg=>{ if(errEl){ errEl.textContent=msg; errEl.style.display='block'; } };
  if(!amount||amount<=0) return fail('Enter a valid amount greater than 0.');
  if(amount>_bpmBalance) return fail(`Amount exceeds outstanding balance of ${_bpmType==='lb'?moneyUSD(_bpmBalance):moneyKES(_bpmBalance)}.`);
  // Guard against double-submit (repeated clicks / Enter) creating duplicate payments.
  if(_bpmSubmitting) return;
  const id=_bpmId, type=_bpmType;
  const btn=document.getElementById('bpm-submit');
  const origLabel=btn?btn.textContent:'';
  _bpmSubmitting=true;
  if(btn){ btn.disabled=true; btn.textContent='Savingâ€¦'; }
  const release=()=>{ _bpmSubmitting=false; if(btn){ btn.disabled=false; btn.textContent=origLabel; } };
  try {
    const updates={};
    if(type==='lb'){
      const r=lbDB.find(x=>x.id===id||String(x.id)===String(id));
      if(!r) return fail('Candidate not found.');
      const snapshot={ r1Amt:r.r1Amt, r1Date:r.r1Date, r2Amt:r.r2Amt, r2Date:r.r2Date };
      if(!r.r1Amt){ updates.r1Amt=amount; updates.r1Date=date; r.r1Amt=amount; r.r1Date=date; }
      else if(!r.r2Amt){ updates.r2Amt=amount; updates.r2Date=date; r.r2Amt=amount; r.r2Date=date; }
      else{
        // Both slots used â€” accumulate into r2Amt
        updates.r2Amt=(Number(r.r2Amt)||0)+amount; updates.r2Date=date; r.r2Amt=updates.r2Amt; r.r2Date=date;
      }
      try{ if(useCloud()) await dbUpdate('lb_candidates',id,updates); else saveLocalStore(); addTimeline('lb',id,`Payment recorded: ${moneyUSD(amount)}`); auditAction('Finance','Repayment recorded',`${r.name} - ${moneyUSD(amount)}`); }
      catch(e){ Object.assign(r, snapshot); return fail(e.message||'Save failed.'); }
    } else {
      const r=proDB.find(x=>x.id===id||String(x.id)===String(id));
      if(!r) return fail('Candidate not found.');
      const snapshot=_proCommSnapshot(r);
      const updates=applyProPayment(r, amount, date);
      try{ if(useCloud()) await persistProPaymentUpdate(id,updates); else saveLocalStore(); addTimeline('pro',id,`Commission payment: ${moneyKES(amount)}`); auditAction('Finance','Commission payment recorded',`${r.name} - ${moneyKES(amount)}`); }
      catch(e){ _restoreProComm(r, snapshot); return fail(e.message||'Save failed.'); }
    }
    closeModal('balance-pay-modal');
    window.openCandidateProfile?.(type, id);
    if(type==='lb') {
      renderRepayments();
      window.renderDash?.();
      window.renderFinancePage?.();
      window.renderPaymentsPage?.();
    } else {
      _afterCommissionChange();
    }
    showToast('Payment recorded','success');
  } finally {
    release();
  }
}
function openExpensePrompt(){
  if(!requireFinanceAction('Adding expenses')) return;
  populateExpenseCandidateOptions();
  const modal=document.getElementById('quick-expense-modal');
  if(!modal){ showToast('Expense form is unavailable','error'); return; }
  const date=document.getElementById('quick-expense-date'); if(date) date.value=new Date().toISOString().slice(0,10);
  ['quick-expense-client','quick-expense-amount','quick-expense-notes'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  const cat=document.getElementById('quick-expense-category'); if(cat) cat.value='Documents';
  const err=document.getElementById('quick-expense-error'); if(err){ err.textContent=''; err.style.display='none'; }
  modal.classList.add('open');
}
function submitQuickExpense(){
  if(!requireFinanceAction('Adding expenses')) return;
  const date=(document.getElementById('quick-expense-date')?.value||new Date().toISOString().slice(0,10));
  const client=(document.getElementById('quick-expense-client')?.value||'').trim();
  const amount=Number(document.getElementById('quick-expense-amount')?.value||0);
  const category=(document.getElementById('quick-expense-category')?.value||'Other').trim();
  const notes=(document.getElementById('quick-expense-notes')?.value||'').trim();
  const err=document.getElementById('quick-expense-error');
  const fail=msg=>{ if(err){ err.textContent=msg; err.style.display='block'; } };
  if(!client) return fail('Client or candidate name is required.');
  if(!amount || amount<0) return fail('Enter a valid amount.');
  drecoExpenses.unshift({id:String(Date.now()),date,client,amount,category,notes});
  auditAction('Expenses','Expense added',`${client} - ${moneyKES(amount)}`);
  persistExpenses(); closeModal('quick-expense-modal'); renderExpenses(); window.setFinanceTab?.('expenses'); window.renderFinancePage?.(); showToast('Expense recorded','success');
}
function deleteExpense(id){ if(!requireFinanceAction('Deleting expenses')) return; const item=drecoExpenses.find(e=>e.id===id); drecoExpenses=drecoExpenses.filter(e=>e.id!==id); auditAction('Expenses','Expense deleted',item?.client||''); persistExpenses(); renderExpenses(); window.renderFinancePage?.(); }
function openCalendarEventPrompt(){
  editingEventId=null;
  const modal=document.getElementById('quick-event-modal');
  if(!modal){ showToast('Calendar event form is unavailable','error'); return; }
  document.getElementById('quick-event-title').value='';
  document.getElementById('quick-event-date').value=new Date().toISOString().slice(0,10);
  document.getElementById('quick-event-notes').value='';
  const del=document.getElementById('quick-event-delete'); if(del) del.style.display='none';
  const heading=document.getElementById('quick-event-heading'); if(heading) heading.textContent='Record calendar event';
  modal.classList.add('open');
}
function editCalendarEvent(id){
  const ev=drecoEvents.find(e=>e.id===id); if(!ev) return;
  editingEventId=id;
  const modal=document.getElementById('quick-event-modal'); if(!modal) return;
  document.getElementById('quick-event-title').value=ev.title||'';
  document.getElementById('quick-event-date').value=ev.date||new Date().toISOString().slice(0,10);
  document.getElementById('quick-event-notes').value=ev.notes||'';
  const del=document.getElementById('quick-event-delete'); if(del) del.style.display='inline-flex';
  const heading=document.getElementById('quick-event-heading'); if(heading) heading.textContent='Edit calendar event';
  modal.classList.add('open');
}
function submitCalendarEvent(){
  const date=(document.getElementById('quick-event-date')?.value||'').trim();
  const title=(document.getElementById('quick-event-title')?.value||'').trim();
  const notes=(document.getElementById('quick-event-notes')?.value||'').trim();
  const err=document.getElementById('quick-event-error');
  const fail=msg=>{ if(err){ err.textContent=msg; err.style.display='block'; } };
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Use date format YYYY-MM-DD.');
  if(!title) return fail('Event title is required.');
  if(editingEventId){
    const ev=drecoEvents.find(e=>e.id===editingEventId); if(ev){ ev.date=date; ev.title=title; ev.notes=notes; }
  }else{
    drecoEvents.unshift({id:String(Date.now()),date,title,notes});
  }
  persistEvents(); closeModal('quick-event-modal'); renderCalendar(); showToast('Calendar event saved','success');
}
function deleteCalendarEvent(){
  if(!editingEventId) return;
  drecoEvents=drecoEvents.filter(e=>e.id!==editingEventId);
  editingEventId=null; persistEvents(); closeModal('quick-event-modal'); renderCalendar(); showToast('Calendar event deleted','success');
}
function openTravelEventPrompt(){
  const sel=document.getElementById('qt-candidate');
  if(sel){
    const all=[...proDB.map(r=>({type:'pro',id:r.id,name:r.name,label:`${r.name} (Professional)`})),...lbDB.map(r=>({type:'lb',id:r.id,name:r.name,label:`${r.name} (General Jobs)`}))].sort((a,b)=>a.name.localeCompare(b.name));
    sel.innerHTML='<option value="">â€” select â€”</option>'+all.map(r=>`<option value="${r.type}:${r.id}">${escHTML(r.label)}</option>`).join('');
  }
  const dateEl=document.getElementById('qt-date');
  if(dateEl) dateEl.value=new Date().toISOString().slice(0,10);
  ['qt-airline','qt-time','qt-notes'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  const errEl=document.getElementById('qt-error');
  if(errEl){ errEl.textContent=''; errEl.style.display='none'; }
  document.getElementById('quick-travel-modal')?.classList.add('open');
}
async function submitTravelEvent(){
  const raw=document.getElementById('qt-candidate')?.value||'';
  const [type,rawId]=raw.split(':');
  const id=Number(rawId);
  const date=document.getElementById('qt-date')?.value||'';
  const airline=(document.getElementById('qt-airline')?.value||'').trim();
  const time=(document.getElementById('qt-time')?.value||'').trim();
  const notes=(document.getElementById('qt-notes')?.value||'').trim();
  const errEl=document.getElementById('qt-error');
  const fail=msg=>{ if(errEl){ errEl.textContent=msg; errEl.style.display='block'; } };
  if(!type||!id) return fail('Select a candidate.');
  if(!date) return fail('Travel date is required.');
  const db_rows=type==='pro'?proDB:lbDB;
  const r=db_rows.find(x=>x.id===id);
  if(!r) return fail('Candidate not found.');
  const table=type==='pro'?'pro_candidates':'lb_candidates';
  const updates=type==='pro'
    ?{travel:date,airline,travelTime:time,travelNotes:notes,stage:'TRAVELLED'}
    :{travelDate:date,airline,travelTime:time,notes:notes||r.notes};
  Object.assign(r,updates);
  try{ if(useCloud()) await dbUpdate(table,id,updates); else saveLocalStore(); addTimeline(type,id,`Travel recorded: ${airline||'No airline'} on ${date}`); auditAction('Travel','Travel details saved',`${r.name} - ${date}`); }
  catch(e){ return fail(e.message||'Save failed.'); }
  closeModal('quick-travel-modal');
  renderTravel();
  window.renderDash?.();
  showToast('Travel details saved','success');
}
function renderHelpPage(){
  const el=document.getElementById('help-section-content'); if(!el) return;
  el.innerHTML=`<div class="settings-page-card"><h3>Daily workflow</h3><p>Use Dashboard for an overview, Pipeline to move candidates through stages, and Reports for management review.</p><div class="setting-row"><span>Pipeline</span><button data-action="tab.switch" data-tab="pipeline">Open</button></div></div><div class="settings-page-card"><h3>Records</h3><p>Professional Jobs and General Jobs are separate workflows. Travel combines both lists and sorts latest travel first.</p><div class="setting-row"><span>Professional Jobs</span><button data-action="tab.switch" data-tab="pro">Open</button></div><div class="setting-row"><span>General Jobs</span><button data-action="tab.switch" data-tab="lb">Open</button></div></div><div class="settings-page-card"><h3>Finance</h3><p>Commissions focus on professional job income. Repayments only track travelled general-job clients. Expenses capture money spent on clients.</p><div class="setting-row"><span>Commissions</span><button data-action="tab.switch" data-tab="commissions">Open</button></div><div class="setting-row"><span>Expenses</span><button data-action="tab.switch" data-tab="expenses">Open</button></div></div><div class="settings-page-card"><h3>Support note</h3><p>For shared multi-user work, keep Supabase configured. Local mode is useful for solo testing, but cloud mode is better for office use.</p><div class="setting-row"><span>Settings</span><button data-action="tab.switch" data-tab="settings">Open</button></div></div>`;
}
function openSettingsModal(){ const kpis=document.getElementById('settings-kpis'); if(kpis) kpis.innerHTML=`<div class="settings-kpi"><strong>${proDB.length}</strong><span>Professional</span></div><div class="settings-kpi"><strong>${lbDB.length}</strong><span>General Jobs records</span></div><div class="settings-kpi"><strong>${Object.keys(allDocs).length}</strong><span>Doc links</span></div>`; const mode=document.getElementById('settings-storage-mode'); if(mode) mode.textContent=lastSyncError?`${getStorageLabel()}: ${lastSyncError}`:getStorageLabel(); const companyInput=document.getElementById('settings-company-name'); if(companyInput) companyInput.value=getCompanyName(); renderSettingsCountries(); renderCompanyUsers(); document.getElementById('settings-modal')?.classList.add('open'); }
function renderRefKpi(label,value,sub,icon,bg,extra='',action=''){
  const onclick=action?` onclick="${action}"`:'';
  return `<div class="ref-kpi ${extra}"${onclick}><div class="ref-kpi-icon" style="background:${bg}"><i class="ti ${icon}"></i></div><div><span>${escHTML(label)}</span><strong>${escHTML(String(value))}</strong><em>${escHTML(sub)}</em></div></div>`;
}
function renderRefTask(title,meta,due){
  return `<div class="ref-task"><span></span><div><strong>${escHTML(title)}</strong><small>${escHTML(meta)}</small></div><em>${escHTML(due)}</em></div>`;
}
function buildConic(items,total){
  let cursor=0;
  const stops=items.map(item=>{
    const share=total?item.count/total*100:0;
    const start=cursor;
    cursor+=share;
    return `${item.color} ${start}% ${cursor}%`;
  }).filter(Boolean).join(',');
  return `conic-gradient(${stops || '#E5E7EB 0 100%'})`;
}
// PROFESSIONAL
// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
let lastProFiltered=[];
let lastLBFiltered=[];
function getFilteredPro(){
  const q=(document.getElementById('pro-search')?.value||'').toLowerCase();
  const stage=window.proStagePillFilter||'';
  const comp=document.getElementById('pro-company-f')?.value||'';
  const pos=document.getElementById('pro-position-f')?.value||'';
  const action=document.getElementById('pro-action-f')?.value||'';
  const dateFrom=document.getElementById('pro-date-from')?.value||'';
  const dateTo=document.getElementById('pro-date-to')?.value||'';
  lastProFiltered=proDB.filter(r=>{
    const text=`${r.name} ${r.pp||''} ${r.company||''} ${r.position||''}`.toLowerCase();
    const outstanding=proBalance(r)>0;
    const actionMatch=!action ||
      (action==='needs-action'&&proNeedsAction(r)) ||
      (action==='outstanding'&&outstanding);
    let dateMatch=true;
    if(dateFrom||dateTo){
      const sub=toInput(r.submitted);
      if(!sub){ dateMatch=false; }
      else {
        if(dateFrom&&sub<dateFrom) dateMatch=false;
        if(dateTo&&sub>dateTo) dateMatch=false;
      }
    }
    return (!q||text.includes(q))&&(!stage||proPipelineStageValue(r)===stage)&&(!comp||r.company===comp)&&(!pos||r.position===pos)&&actionMatch&&dateMatch;
  });
  return lastProFiltered;
}
function clearProDates(){
  const f=document.getElementById('pro-date-from'); if(f) f.value='';
  const t=document.getElementById('pro-date-to'); if(t) t.value='';
  renderPro();
}
function renderPro(){
  let totalComm=0,totalPaid=0;
  proDB.forEach(r=>{ if(r.commission) totalComm+=Number(r.commission); if(r.paid) totalPaid+=Number(r.paid); });
  const metricsEl=document.getElementById('pro-metrics');
  if(metricsEl) metricsEl.innerHTML=`
    <div class="metric-card mc-default"><div class="mc-icon"><i class="ti ti-users"></i></div><div class="metric-label">Total</div><div class="metric-val">${proDB.length}</div></div>
    <div class="metric-card mc-amber"><div class="mc-icon"><i class="ti ti-clock"></i></div><div class="metric-label">In process</div><div class="metric-val amber">${proDB.filter(isInProcessPro).length}</div></div>
    <div class="metric-card mc-green"><div class="mc-icon"><i class="ti ti-plane-departure"></i></div><div class="metric-label">Travelled</div><div class="metric-val green">${proDB.filter(r=>proPipelineStageValue(r)==='TRAVELLED').length}</div></div>
    <div class="metric-card mc-ink"><div class="mc-icon"><i class="ti ti-coin"></i></div><div class="metric-label">Commission billed</div><div class="metric-val sm">KES ${totalComm.toLocaleString()}</div></div>
    <div class="metric-card mc-sage"><div class="mc-icon"><i class="ti ti-alert-circle"></i></div><div class="metric-label">Outstanding</div><div class="metric-val sm amber">KES ${(totalComm-totalPaid).toLocaleString()}</div></div>`;

  const companies=[...new Set(proDB.map(r=>r.company).filter(Boolean))].sort();
  const csel=document.getElementById('pro-company-f');
  if(csel){ const ccur=csel.value; csel.innerHTML='<option value="">All companies</option>'+companies.map(c=>`<option value="${c}"${c===ccur?' selected':''}>${c}</option>`).join(''); }
  const positions=[...new Set(proDB.map(r=>r.position).filter(Boolean))].sort();
  const psel=document.getElementById('pro-position-f');
  if(psel){ const pcur=psel.value; psel.innerHTML='<option value="">All positions</option>'+positions.map(p=>`<option value="${p}"${p===pcur?' selected':''}>${p}</option>`).join(''); }

  const data=getFilteredPro();
  const totalPages=Math.max(1,Math.ceil(data.length/PER_PAGE));
  if(proPage>totalPages) proPage=1;
  const slice=data.slice((proPage-1)*PER_PAGE,proPage*PER_PAGE);
  const tbody=document.getElementById('pro-tbody'); if(!tbody) return;
  if(!slice.length){ tbody.innerHTML=`<tr><td colspan="11"><div class="empty">No candidates found</div></td></tr>`; }
  else {
    tbody.innerHTML=slice.map((r,i)=>{
      const comm=r.commission?'KES '+Number(r.commission).toLocaleString():'&mdash;';
      const paid=r.paid?'KES '+Number(r.paid).toLocaleString():'&mdash;';
      const bal=(r.commission&&r.paid)?Number(r.commission)-Number(r.paid):null;
      const balTxt=bal!==null?'KES '+bal.toLocaleString():'&mdash;';
      const name=escHTML(r.name);
      const pp=escHTML(r.pp||'');
      const position=r.position ? escHTML(r.position) : '&mdash;';
      const company=r.company ? escHTML(r.company) : '&mdash;';
      const country=r.country ? escHTML(r.country) : '&mdash;';
      return `<tr onclick="editPro(${r.id})">
        <td>${(proPage-1)*PER_PAGE+i+1}</td>
        <td><div class="name-wrap">${rowAvatar(r.name)}<div class="name-stack"><div class="name-cell">${name}</div><div class="pp-cell">${pp}</div></div></div></td>
        <td style="color:var(--text-2)">${position}</td>
        <td style="color:var(--text-2)">${company}</td>
        <td style="color:var(--text-2)">${country}</td>
        <td>${stageBadge(r.stage)}</td>
        <td>${comm}</td><td>${paid}</td>
        <td class="${bal&&bal>0?'balance-owed':''}">${balTxt}</td>
        <td onclick="event.stopPropagation()"><button class="action-btn docs dreco-open-docs" data-type="pro" data-id="${r.id}" data-name="${escHTML(r.name)}"><i class="ti ti-paperclip"></i></button></td>
        <td onclick="event.stopPropagation()"><button class="action-btn del" onclick="deletePro(${r.id})"><i class="ti ti-trash"></i></button></td>
      </tr>`;
    }).join('');
  }
  renderPagination('pro-pagination',proPage,totalPages,data.length,'pro');
}

function openProForm(){
  editingProId=null;
  document.getElementById('pro-modal-title').textContent='Add professional candidate';
  ['pf-name','pf-pp','pf-phone','pf-position','pf-company','pf-country','pf-submitted','pf-interview','pf-ol','pf-medical','pf-mol','pf-visa','pf-travel','pf-comm','pf-paid']
    .forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  const stEl=document.getElementById('pf-stage'); if(stEl){ stEl.value=proStages[0]||'SUBMITTED'; stEl.dataset.prev=stEl.value; }
  renderProSummary(null);
  const instEl = document.getElementById('pro-installments-section'); if (instEl) instEl.innerHTML = '';
  const statusEl = document.getElementById('pro-commission-status'); if (statusEl) statusEl.innerHTML = '';
  const plEl = document.getElementById('pro-pl-section'); if (plEl) plEl.innerHTML = '';
  document.getElementById('pro-form-timeline').innerHTML='<div class="tl-empty">Save candidate first to see timeline.</div>';
  document.getElementById('pro-tab-details').style.display='';
  ['pipeline','commission','timeline','docs'].forEach(t=>{ const el=document.getElementById(`pro-tab-${t}`); if(el) el.style.display='none'; });
  document.getElementById('pro-modal').querySelectorAll('.modal-tab').forEach((b,i)=>b.classList.toggle('active',i===0));
  document.getElementById('pro-modal').classList.add('open');
}
function editPro(id){
  const r=proDB.find(x=>x.id==id); if(!r) return;
  editingProId=id;
  document.getElementById('pro-modal-title').textContent='Edit candidate';
  document.getElementById('pf-name').value=r.name; document.getElementById('pf-pp').value=r.pp||'';
  document.getElementById('pf-phone').value=r.phone||''; document.getElementById('pf-position').value=r.position||'';
  document.getElementById('pf-company').value=r.company||''; document.getElementById('pf-country').value=r.country||'';
  const stEl=document.getElementById('pf-stage'); if(stEl){ stEl.value=r.stage; stEl.dataset.prev=r.stage; }
  document.getElementById('pf-comm').value=r.commission||'';
  const pfp=document.getElementById('pf-paid'); if(pfp) pfp.value=proPaidAmount(r)||'';
  document.getElementById('pf-submitted').value=toInput(r.submitted); document.getElementById('pf-interview').value=toInput(r.interview);
  document.getElementById('pf-ol').value=toInput(r.ol);
  const pfMed=document.getElementById('pf-medical'); if(pfMed) pfMed.value=toInput(r.medical);
  document.getElementById('pf-mol').value=toInput(r.mol);
  document.getElementById('pf-visa').value=toInput(r.visa); document.getElementById('pf-travel').value=toInput(r.travel);
  const pfFollowup=document.getElementById('pf-followup'); if(pfFollowup) pfFollowup.value=toInput(r.followUp||r.follow_up);
  renderProSummary(r);
  renderCandidateCommissionInstallments(r);
  document.getElementById('pro-form-timeline').innerHTML=renderTimelineHTML('pro',id);
  document.getElementById('pro-tab-details').style.display='';
  ['pipeline','commission','timeline','docs'].forEach(t=>{ const el=document.getElementById(`pro-tab-${t}`); if(el) el.style.display='none'; });
  document.getElementById('pro-modal').querySelectorAll('.modal-tab').forEach((b,i)=>b.classList.toggle('active',i===0));
  document.getElementById('pro-modal').classList.add('open');
}
async function savePro(){
  const name=document.getElementById('pf-name').value.trim();
  if(!name){ showToast('Full name is required','error'); return; }
  const oldRec=editingProId?{...(proDB.find(x=>x.id==editingProId)||{})}:null;
  const oldStage=oldRec?oldRec.stage:null;
  const newStage=document.getElementById('pf-stage').value;
  const rec={
    company_id:getCompanyId(),
    name:name.toUpperCase(), pp:document.getElementById('pf-pp').value.trim().toUpperCase(),
    phone:document.getElementById('pf-phone').value.trim(), position:document.getElementById('pf-position').value.trim().toUpperCase(),
    company:document.getElementById('pf-company').value.trim().toUpperCase(), country:document.getElementById('pf-country').value.trim(),
    stage:newStage, submitted:document.getElementById('pf-submitted').value||null,
    interview:document.getElementById('pf-interview').value||null, ol:document.getElementById('pf-ol').value||null,
    medical:document.getElementById('pf-medical')?.value||null,
    mol:document.getElementById('pf-mol').value||null, visa:document.getElementById('pf-visa').value||null,
    travel:document.getElementById('pf-travel').value||null,
    followUp:document.getElementById('pf-followup')?.value||null,
    commission:document.getElementById('pf-comm').value?Number(document.getElementById('pf-comm').value):null,
    commissionPayments:Array.isArray(oldRec?.commissionPayments) ? JSON.parse(JSON.stringify(oldRec.commissionPayments)) : [],
  };
  syncCommissionMirrors(rec);
  const validationError=validateProRecord(rec);
  if(validationError){ showToast(validationError,'error'); return; }
  if(editingProId){
    rec.id=editingProId; const i=proDB.findIndex(x=>x.id==editingProId); proDB[i]={...proDB[i],...rec};
    const changes=recordChanges(oldRec,rec,[['name','Name'],['pp','Passport'],['phone','Phone'],['position','Position'],['company','Company'],['country','Country'],['stage','Stage'],['commission','Commission'],['paid','Paid'],['travel','Travel date']]);
    addTimeline('pro',editingProId,changes.length?`Updated: ${changes.slice(0,4).join('; ')}${changes.length>4?'...':''}`:'Details reviewed');
    auditAction('Professional Jobs','Candidate updated',rec.name);
  } else {
    rec.id=Date.now(); proDB.push(rec);
    addTimeline('pro',rec.id,`Added - Stage: ${newStage}`);
    auditAction('Professional Jobs','Candidate added',rec.name);
  }
  const proWasEditing = !!editingProId;
  const saved = await saveProRecord(rec, proWasEditing);
  if (!saved) return;
  editingProId = null;
  closeModal('pro-modal'); renderPro(); window.renderPipelinePage?.(); window.renderDash?.(); window.renderFinancePage?.();
  showToast(proWasEditing ? 'Candidate updated' : 'Candidate added', 'success');
}
async function deletePro(id){
  const r=proDB.find(x=>x.id==id);
  if(!confirm(`Delete ${r?r.name:'this candidate'}? Cannot be undone.`)) return;
  await deleteProRecord(id);
  setProDB(proDB.filter(x=>x.id!=id)); auditAction('Professional Jobs','Candidate deleted',r?.name||''); showToast('Deleted','success'); renderPro(); window.renderDash?.(); window.renderPipelinePage?.();
}

// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
// LB JOBS
// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
function getFilteredLB(){
  const q=(document.getElementById('lb-search')?.value||'').toLowerCase();
  const travel=window.lbTravelPillFilter||'';
  const pp=window.lbPPFilter||'';
  const refund=document.getElementById('lb-refund-f')?.value||'';
  const action=document.getElementById('lb-action-f')?.value||'';
  const country=getActiveGeneralCountry();
  const dateFrom=document.getElementById('lb-date-from')?.value||'';
  const dateTo=document.getElementById('lb-date-to')?.value||'';
  lastLBFiltered=lbDB.filter(r=>{
    const text=`${r.name} ${r.phone||''}`.toLowerCase();
    const ts=r.stage||r.travelStatus||r.travel_status||'';
    const ps=r.ppStatus||r.pp_status||'';
    const rs=getRefundStatus(r);
    const rcountry=r.country||DEFAULT_COMPANY.generalJobsCountries[0]||'General';
    const actionMatch=!action ||
      (action==='needs-action'&&lbNeedsAction(r)) ||
      (action==='incomplete-refund'&&rs==='incomplete');
    let dateMatch=true;
    if(dateFrom||dateTo){
      const td=toInput(r.travelDate||r.travel_date);
      if(!td){ dateMatch=false; }
      else {
        if(dateFrom&&td<dateFrom) dateMatch=false;
        if(dateTo&&td>dateTo) dateMatch=false;
      }
    }
    return rcountry===country&&(!q||text.includes(q))&&(!travel||ts===travel)&&(!pp||ps===pp)&&(!refund||rs===refund)&&actionMatch&&dateMatch;
  });
  return lastLBFiltered;
}
function clearLBDates(){
  const f=document.getElementById('lb-date-from'); if(f) f.value='';
  const t=document.getElementById('lb-date-to'); if(t) t.value='';
  renderLB();
}
function renderLB(){
  renderGeneralCountryTabs();
  let lbOwed=0,lbPaid=0,lbFees=0;
  const country=getActiveGeneralCountry();
  const countryRows=lbDB.filter(r=>(r.country||DEFAULT_COMPANY.generalJobsCountries[0]||'General')===country);
  countryRows.forEach(r=>{
    const ts=r.stage||r.travelStatus||r.travel_status;
    const pp=r.ppStatus||r.pp_status;
    const notes=(r.notes||'').trim().toUpperCase();
    if(ts==='TRAVELLED'&&pp!=='HAD PP'&&notes!=='RETURNED'){
      const toR=Number(r.toRefund||r.to_refund)||0;
      const paid=(Number(r.r1Amt||r.r1_amt)||0)+(Number(r.r2Amt||r.r2_amt)||0);
      lbOwed+=toR; lbPaid+=paid; lbFees+=paid;
    }
  });
  const lbIncomplete=countryRows.filter(r=>(r.stage||r.travelStatus||r.travel_status)==='TRAVELLED'&&getRefundStatus(r)==='incomplete').length;
  const metricsEl=document.getElementById('lb-metrics');
  if(metricsEl) metricsEl.innerHTML=`
    <div class="metric-card mc-default"><div class="mc-icon"><i class="ti ti-users"></i></div><div class="metric-label">${escHTML(country)} total</div><div class="metric-val">${countryRows.length}</div></div>
    <div class="metric-card mc-amber"><div class="mc-icon"><i class="ti ti-clock"></i></div><div class="metric-label">In process</div><div class="metric-val amber">${countryRows.filter(isInProcessLB).length}</div></div>
    <div class="metric-card mc-green"><div class="mc-icon"><i class="ti ti-plane-departure"></i></div><div class="metric-label">Travelled</div><div class="metric-val green">${countryRows.filter(r=>(r.stage||r.travelStatus||r.travel_status)==='TRAVELLED').length}</div></div>
    <div class="metric-card mc-ink"><div class="mc-icon"><i class="ti ti-cash"></i></div><div class="metric-label">Collected</div><div class="metric-val sm green">${moneyUSD(lbFees)}</div></div>
    <div class="metric-card mc-red"><div class="mc-icon"><i class="ti ti-alert-circle"></i></div><div class="metric-label">Outstanding</div><div class="metric-val sm red">${moneyUSD(lbOwed-lbPaid)}</div></div>`;

  const data=getFilteredLB();
  const totalPages=Math.max(1,Math.ceil(data.length/PER_PAGE));
  if(lbPage>totalPages) lbPage=1;
  const slice=data.slice((lbPage-1)*PER_PAGE,lbPage*PER_PAGE);
  // batch select button
  const batchBtn=document.getElementById('lb-batch-send-btn');
  if(batchBtn){ batchBtn.style.display=window.lbSelected&&window.lbSelected.size>0?'inline-flex':'none'; if(window.lbSelected&&window.lbSelected.size>0) batchBtn.textContent=`Send Profiles (${window.lbSelected.size})`; }
  const tbody=document.getElementById('lb-tbody'); if(!tbody) return;
  if(!slice.length){ tbody.innerHTML=`<tr><td colspan="13"><div class="empty">No candidates found</div></td></tr>`; }
  else {
    tbody.innerHTML=slice.map((r,i)=>{
      const rs=getRefundStatus(r);
      const ts=r.stage||r.travelStatus||r.travel_status||'';
      const ps=r.ppStatus||r.pp_status||'';
      const toR=Number(r.toRefund||r.to_refund)||0;
      const paid=(Number(r.r1Amt||r.r1_amt)||0)+(Number(r.r2Amt||r.r2_amt)||0);
      const bal=(rs==='N/A'||rs==='RETURNED')?'&mdash;':moneyUSD(toR-paid);
      const td=r.travelDate||r.travel_date;
      const name=escHTML(r.name);
      const phone=r.phone ? escHTML(r.phone) : '&mdash;';
      const sel=window.lbSelected&&window.lbSelected.has(r.id);
      return `<tr onclick="editLB(${r.id})" class="${sel?'row-selected':''}">
        <td onclick="event.stopPropagation()"><input type="checkbox" ${sel?'checked':''} onchange="toggleLBSelect(${r.id},this.checked)" style="cursor:pointer"></td>
        <td>${(lbPage-1)*PER_PAGE+i+1}</td>
        <td><div class="name-wrap">${rowAvatar(r.name)}<div class="name-cell">${name}</div></div></td>
        <td>${phone}</td>
        <td>${ppBadge(ps)}</td>
        <td>${travelBadge(ts)}</td>
        <td>${fmtDate(td)}</td>
        <td>${rs==='N/A'?'&mdash;':moneyUSD(toR)}</td>
        <td>${rs==='N/A'?'&mdash;':moneyUSD(paid)}</td>
        <td class="${rs==='incomplete'?'balance-owed':''}">${bal}</td>
        <td>${refundBadge(rs)}</td>
        <td onclick="event.stopPropagation()"><button class="action-btn docs dreco-open-docs" data-type="lb" data-id="${r.id}" data-name="${escHTML(r.name)}"><i class="ti ti-paperclip"></i></button></td>
        ${rs==='incomplete'?`<td onclick="event.stopPropagation()"><button class="action-btn" onclick="openLBRefundPayment(${r.id})" title="Record refund payment" style="background:#f0fdf4;color:#16a34a;border-color:#86efac"><i class="ti ti-coin"></i></button></td>`:'<td></td>'}
        <td onclick="event.stopPropagation()"><button class="action-btn del" onclick="deleteLB(${r.id})"><i class="ti ti-trash"></i></button></td>
      </tr>`;
    }).join('');
  }
  renderPagination('lb-pagination',lbPage,totalPages,data.length,'lb');
}

function toggleLBOwnPassport(checked){
  const refSec=document.getElementById('lb-refund-section');
  const noRef=document.getElementById('lb-no-refund-notice');
  if(refSec) refSec.style.display=checked?'none':'';
  if(noRef) noRef.style.display=checked?'':'none';
}
function openLBForm(){
  editingLbId=null;
  document.getElementById('lb-modal-title').textContent=`Add General Jobs candidate - ${getActiveGeneralCountry()}`;
  rebuildStageSelects();
  const stages = getGeneralWorkflowStages();
  ['lf-name','lf-phone','lf-tdate','lf-torefund','lf-r1date','lf-r1amt','lf-r2date','lf-r2amt','lf-notes','lf-submitted-date','lf-selected-date','lf-passport-date','lf-visa-date']
    .forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('lf-pp').value='APPLIED';
  const ownEl=document.getElementById('lf-own-passport'); if(ownEl) ownEl.checked=false;
  toggleLBOwnPassport(false);
  const stEl=document.getElementById('lf-stage'); if(stEl){ stEl.value=stages[0]||'SUBMITTED'; stEl.dataset.prev=stEl.value; }
  const tvEl=document.getElementById('lf-travel'); if(tvEl){ tvEl.value=stages[0]||'SUBMITTED'; tvEl.dataset.prev=tvEl.value; }
  renderLBSummary(null);
  document.getElementById('lb-form-timeline').innerHTML='<div class="tl-empty">Save candidate first to see timeline.</div>';
  document.getElementById('lb-tab-details').style.display='';
  ['refunds','timeline','docs'].forEach(t=>{ const el=document.getElementById(`lb-tab-${t}`); if(el) el.style.display='none'; });
  document.getElementById('lb-modal').querySelectorAll('.modal-tab').forEach((b,i)=>b.classList.toggle('active',i===0));
  document.getElementById('lb-modal').classList.add('open');
}
function editLB(id){
  const r=lbDB.find(x=>x.id==id); if(!r) return;
  editingLbId=id;
  document.getElementById('lb-modal-title').textContent='Edit candidate';
  const prevCountry = window.generalCountryFilter;
  if (r.country) window.generalCountryFilter = r.country;
  rebuildStageSelects();
  window.generalCountryFilter = prevCountry;
  const stages = getLBWorkflowStagesForRecord(r);
  document.getElementById('lf-name').value=r.name; document.getElementById('lf-phone').value=r.phone||'';
  document.getElementById('lf-pp').value=r.ppStatus||r.pp_status||'APPLIED';
  const ownPP=!!r.own_passport;
  const ownEl=document.getElementById('lf-own-passport'); if(ownEl) ownEl.checked=ownPP;
  toggleLBOwnPassport(ownPP);
  const lbStageVal=r.stage||r.travelStatus||r.travel_status||stages[0]||'SUBMITTED';
  const stEl=document.getElementById('lf-stage'); if(stEl){ stEl.value=lbStageVal; stEl.dataset.prev=lbStageVal; }
  const tvEl=document.getElementById('lf-travel'); if(tvEl){ tvEl.value=lbStageVal; tvEl.dataset.prev=lbStageVal; }
  document.getElementById('lf-tdate').value=toInput(r.travelDate||r.travel_date);
  const lsd=document.getElementById('lf-submitted-date'); if(lsd) lsd.value=toInput(r.submitted_date);
  const lseld=document.getElementById('lf-selected-date'); if(lseld) lseld.value=toInput(r.selected_date);
  const lpd=document.getElementById('lf-passport-date'); if(lpd) lpd.value=toInput(r.passport_date);
  const lvd=document.getElementById('lf-visa-date'); if(lvd) lvd.value=toInput(r.visa_date);
  document.getElementById('lf-torefund').value=r.toRefund||r.to_refund||'';
  document.getElementById('lf-r1date').value=toInput(r.r1Date||r.r1_date);
  document.getElementById('lf-r1amt').value=r.r1Amt||r.r1_amt||'';
  document.getElementById('lf-r2date').value=toInput(r.r2Date||r.r2_date);
  document.getElementById('lf-r2amt').value=r.r2Amt||r.r2_amt||'';
  document.getElementById('lf-notes').value=r.notes||'';
  const lfFollowup=document.getElementById('lf-followup'); if(lfFollowup) lfFollowup.value=toInput(r.followUp||r.follow_up);
  renderLBSummary(r);
  document.getElementById('lb-form-timeline').innerHTML=renderTimelineHTML('lb',id);
  document.getElementById('lb-tab-details').style.display='';
  ['refunds','timeline','docs'].forEach(t=>{ const el=document.getElementById(`lb-tab-${t}`); if(el) el.style.display='none'; });
  document.getElementById('lb-modal').querySelectorAll('.modal-tab').forEach((b,i)=>b.classList.toggle('active',i===0));
  document.getElementById('lb-modal').classList.add('open');
}
async function saveLB(){
  const name=document.getElementById('lf-name').value.trim();
  if(!name){ showToast('Full name is required','error'); return; }
  const ppStatus=document.getElementById('lf-pp').value;
  const isHadPP=ppStatus==='HAD PP';
  const own_passport=!!(document.getElementById('lf-own-passport')?.checked)||isHadPP;
  const oldRec=editingLbId?{...(lbDB.find(x=>x.id==editingLbId)||{})}:null;
  const oldTravel=oldRec?oldRec.stage||oldRec.travelStatus:null;
  const newStageEl=document.getElementById('lf-stage');
  const newTravel=newStageEl?.value||document.getElementById('lf-travel')?.value||getGeneralWorkflowStages()[0];
  const rec={
    company_id:getCompanyId(),
    country:oldRec?.country || getActiveGeneralCountry(),
    name:name.toUpperCase(), phone:document.getElementById('lf-phone').value.trim(),
    ppStatus, stage:newTravel, travelStatus:newTravel,
    own_passport,
    submitted_date:document.getElementById('lf-submitted-date')?.value||null,
    selected_date:document.getElementById('lf-selected-date')?.value||null,
    passport_date:document.getElementById('lf-passport-date')?.value||null,
    visa_date:document.getElementById('lf-visa-date')?.value||null,
    travelDate:document.getElementById('lf-tdate').value||null,
    toRefund:own_passport?0:(Number(document.getElementById('lf-torefund').value)||0),
    r1Date:document.getElementById('lf-r1date').value||null,
    r1Amt:own_passport?0:(Number(document.getElementById('lf-r1amt').value)||0),
    r2Date:document.getElementById('lf-r2date').value||null,
    r2Amt:own_passport?0:(Number(document.getElementById('lf-r2amt').value)||0),
    notes:document.getElementById('lf-notes').value.trim(),
    followUp:document.getElementById('lf-followup')?.value||null,
  };
  const validationError=validateLBRecord(rec);
  if(validationError){ showToast(validationError,'error'); return; }
  if(editingLbId){
    rec.id=editingLbId; const i=lbDB.findIndex(x=>x.id==editingLbId); lbDB[i]={...lbDB[i],...rec};
    const changes=recordChanges(oldRec,rec,[['name','Name'],['phone','Phone'],['ppStatus','Passport'],['travelStatus','Travel'],['travelDate','Travel date'],['toRefund','To refund'],['r1Amt','1st refund'],['r2Amt','2nd refund'],['notes','Notes']]);
    addTimeline('lb',editingLbId,changes.length?`Updated: ${changes.slice(0,4).join('; ')}${changes.length>4?'...':''}`:'Details reviewed');
    auditAction('General Jobs','Candidate updated',rec.name);
  } else {
    rec.id=Date.now(); lbDB.push(rec);
    addTimeline('lb',rec.id,`Added - Stage: ${newTravel}${own_passport?' (Own PP)':''}`);
    auditAction('General Jobs','Candidate added',rec.name);
  }
  const lbWasEditing = !!editingLbId;
  const saved = await saveLBRecord(rec, lbWasEditing);
  if (!saved) return;
  editingLbId = null;
  closeModal('lb-modal'); renderLB(); window.renderPipelinePage?.(); window.renderDash?.();
  showToast(lbWasEditing ? 'Candidate updated' : 'Candidate added', 'success');
}
async function deleteLB(id){
  const r=lbDB.find(x=>x.id==id);
  if(!confirm(`Delete ${r?r.name:'this candidate'}? Cannot be undone.`)) return;
  await deleteLBRecord(id);
  setLbDB(lbDB.filter(x=>x.id!=id)); auditAction('General Jobs','Candidate deleted',r?.name||''); showToast('Deleted','success'); renderLB(); window.renderDash?.(); window.renderPipelinePage?.();
}

let _lbRefundTargetId = null;
function openLBRefundPayment(id) {
  const r = lbDB.find(x=>x.id==id); if (!r) return;
  _lbRefundTargetId = id;
  const payments = Array.isArray(r.refundPayments) ? r.refundPayments : [];
  const paid = payments.reduce((s,p)=>s+(Number(p.amount)||0),0) + (Number(r.r1Amt||r.r1_amt)||0) + (Number(r.r2Amt||r.r2_amt)||0);
  const owing = Math.max(0,(Number(r.toRefund||r.to_refund)||0) - paid);
  const rows = payments.map((p,i)=>`<tr><td>${h(fmt(p.date||''))}</td><td>${moneyUSD(p.amount)}</td><td><button class="dv5-action-btn" onclick="removeLBRefundPayment(${i})"><i class="ti ti-trash"></i></button></td></tr>`).join('');
  const html=`<div class="modal open" id="lb-refund-modal" onclick="if(event.target===this)closeModal('lb-refund-modal')" style="z-index:9000">
    <div class="modal-card" style="max-width:420px">
      <div class="modal-header"><h2>Record Refund Payment â€” ${h(r.name)}</h2><button class="modal-close" onclick="closeModal('lb-refund-modal')">Ã—</button></div>
      <div class="modal-body">
        <div style="display:flex;gap:12px;margin-bottom:12px">
          <div style="flex:1;background:#f0fdf4;border-radius:8px;padding:10px 12px;text-align:center"><div style="font-size:11px;color:#16a34a;font-weight:438">Total to Refund</div><div style="font-size:16px;font-weight:500">${moneyUSD(r.toRefund||r.to_refund||0)}</div></div>
          <div style="flex:1;background:#fffbeb;border-radius:8px;padding:10px 12px;text-align:center"><div style="font-size:11px;color:#d97706;font-weight:438">Remaining</div><div style="font-size:16px;font-weight:500">${moneyUSD(owing)}</div></div>
        </div>
        ${rows?`<table class="dv5-table" style="margin-bottom:10px"><thead><tr><th>Date</th><th>Amount</th><th></th></tr></thead><tbody>${rows}</tbody></table>`:''}
        <div class="form-grid">
          <div class="field"><label>Payment Date</label><input type="date" id="lbr-date" value="${new Date().toISOString().slice(0,10)}"></div>
          <div class="field"><label>Amount (USD)</label><input type="number" id="lbr-amount" placeholder="e.g. 50" min="0"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="closeModal('lb-refund-modal')">Cancel</button>
        <button class="btn primary" onclick="submitLBRefundPayment()"><i class="ti ti-plus"></i>Add Payment</button>
      </div>
    </div>
  </div>`;
  const existing=document.getElementById('lb-refund-modal'); if(existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend',html);
}
window.openLBRefundPayment = openLBRefundPayment;

async function submitLBRefundPayment() {
  const id=_lbRefundTargetId; if(!id) return;
  const date=document.getElementById('lbr-date')?.value||new Date().toISOString().slice(0,10);
  const amount=Number(document.getElementById('lbr-amount')?.value)||0;
  if(amount<=0){ showToast('Enter a valid amount','error'); return; }
  const i=lbDB.findIndex(x=>x.id==id); if(i<0) return;
  const payments=Array.isArray(lbDB[i].refundPayments)?[...lbDB[i].refundPayments]:[];
  payments.push({date,amount});
  lbDB[i]={...lbDB[i],refundPayments:payments};
  addTimeline('lb',id,`Refund payment recorded: ${moneyUSD(amount)}`);
  showToast('Payment recorded âœ“','success');
  closeModal('lb-refund-modal');
  await saveLBRecord(lbDB[i]);
  renderLB(); window.renderDash?.(); window.renderFinancePage?.();
}
window.submitLBRefundPayment = submitLBRefundPayment;

async function removeLBRefundPayment(idx) {
  const id=_lbRefundTargetId; if(!id) return;
  const i=lbDB.findIndex(x=>x.id==id); if(i<0) return;
  const payments=[...(Array.isArray(lbDB[i].refundPayments)?lbDB[i].refundPayments:[])];
  payments.splice(idx,1);
  lbDB[i]={...lbDB[i],refundPayments:payments};
  await saveLBRecord(lbDB[i]);
  openLBRefundPayment(id);
}
window.removeLBRefundPayment = removeLBRefundPayment;

async function updateTxDate(type, id, slot, newDate) {
  const db2 = type === 'pro' ? proDB : lbDB;
  const rec = db2.find(r => String(r.id) === String(id));
  if (!rec) return;
  rec[slot] = newDate || null;
  try {
    if (useCloud()) {
      const table = type === 'pro' ? 'pro_candidates' : 'lb_candidates';
      await dbUpdate(table, id, { [slot]: newDate || null });
    } else {
      saveLocalStore();
    }
    window.renderFinancePage?.();
  } catch(e) {
    showToast('Failed to save date â€” run the latest migration SQL in Supabase if this persists', 'error');
    console.warn('updateTxDate error:', e);
  }
}
window.updateTxDate = updateTxDate;

window.lbSelected = new Set();
function toggleLBSelect(id,checked){
  if(!window.lbSelected) window.lbSelected=new Set();
  if(checked) window.lbSelected.add(id); else window.lbSelected.delete(id);
  const batchBtn=document.getElementById('lb-batch-send-btn');
  if(batchBtn){ batchBtn.style.display=window.lbSelected.size>0?'inline-flex':'none'; if(window.lbSelected.size>0) batchBtn.textContent=`Send Profiles (${window.lbSelected.size})`; }
}
async function batchSendProfiles(){
  if(!window.lbSelected||window.lbSelected.size===0){ showToast('No candidates selected','error'); return; }
  if(!confirm(`Mark ${window.lbSelected.size} candidate(s) as PROFILE SENT?`)) return;
  const promises=[];
  window.lbSelected.forEach(id=>{
    const i=lbDB.findIndex(x=>x.id==id);
    if(i<0) return;
    lbDB[i]={...lbDB[i],stage:'PROFILE SENT',travelStatus:'PROFILE SENT'};
    addTimeline('lb',id,'Stage set to PROFILE SENT (batch)');
    promises.push(saveLBRecord(lbDB[i]));
  });
  await Promise.all(promises);
  window.lbSelected=new Set();
  auditAction('General Jobs','Batch profile sent',`${window.lbSelected.size||'Multiple'} candidates`);
  showToast('Profiles marked as SENT','success');
  renderLB(); window.renderDash?.();
}

// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
// DOCUMENTS
// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚

// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
// EXPORT CSV
// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
function exportCSV(type){
  let headers,rows,filename,isFiltered=false;
  if(type==='pro'){
    headers=['#','Name','Passport','Phone','Position','Company','Country','Stage','Commission (KES)','Paid (KES)','Balance (KES)','Submitted','Interview','Offer Letter','Work Permit','Visa','Travel Date'];
    const src=lastProFiltered.length?lastProFiltered:proDB;
    isFiltered=src.length<proDB.length;
    rows=src.map((r,i)=>[i+1,r.name,r.pp||'',r.phone||'',r.position||'',r.company||'',r.country||'',r.stage,
      r.commission||'',r.paid||'',(r.commission&&r.paid)?Number(r.commission)-Number(r.paid):'',
      fmtDate(r.submitted),fmtDate(r.interview),fmtDate(r.ol),fmtDate(r.mol),fmtDate(r.visa),fmtDate(r.travel)]);
    filename=isFiltered?'Recruitflow_Professional_Filtered':'Recruitflow_Professional';
  } else {
    headers=['#','Name','Phone','Passport Status','Travel Status','Travel Date','To Refund (USD)','Refunded (USD)','Balance (USD)','Refund Status','Notes'];
    const src=lastLBFiltered.length?lastLBFiltered:lbDB;
    isFiltered=src.length<lbDB.length;
    rows=src.map((r,i)=>{
      const rs=getRefundStatus(r); const toR=Number(r.toRefund||r.to_refund)||0;
      const paid=(Number(r.r1Amt||r.r1_amt)||0)+(Number(r.r2Amt||r.r2_amt)||0);
      return [i+1,r.name,r.phone||'',r.ppStatus||r.pp_status||'',r.travelStatus||r.travel_status||'',
        fmtDate(r.travelDate||r.travel_date),rs==='N/A'?'':toR,rs==='N/A'?'':paid,
        (rs==='N/A'||rs==='RETURNED')?'':toR-paid,rs,r.notes||''];
    });
    filename=isFiltered?'Recruitflow_General_Filtered':'Recruitflow_LB';
  }
  const esc=v=>`"${String(v==null?'':v).replace(/"/g,'""')}"`;
  const csv=[headers.map(esc).join(','),...rows.map(r=>r.map(esc).join(','))].join('\n');
  const a=Object.assign(document.createElement('a'),{
    href:URL.createObjectURL(new Blob([csv],{type:'text/csv'})),
    download:`${filename}_${new Date().toISOString().split('T')[0]}.csv`
  });
  a.click(); showToast('Export downloaded','success');
}

// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
// PAGINATION
// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
function renderPagination(elId,page,total,count,which){
  const el=document.getElementById(elId); if(!el) return;
  if(total<=1){ el.innerHTML=`<span>${count} record${count!==1?'s':''}</span><span></span>`; return; }
  let btns='';
  for(let p=1;p<=total;p++){
    if(p===1||p===total||Math.abs(p-page)<=1)
      btns+=`<button class="page-btn ${p===page?'active':''}" onclick="goPage('${which}',${p})">${p}</button>`;
    else if(Math.abs(p-page)===2) btns+=`<span style="padding:4px 2px;color:var(--text-3);font-size:11px">...</span>`;
  }
  el.innerHTML=`<span>${count} record${count!==1?'s':''}</span><div class="page-btns">${btns}</div>`;
}
function goPage(which,p){
  if(which==='pro'){ proPage=p; renderPro(); } else { lbPage=p; renderLB(); }
  document.querySelector('.content-area')?.scrollTo({top:0,behavior:'smooth'});
}

// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
// TOAST
// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
function showToast(msg,type=''){
  const t=document.getElementById('toast'); if(!t) return;
  const icon=type==='error'?'ti-alert-circle':'ti-circle-check';
  t.className='toast '+type;
  // Message is inserted as text, never HTML â€” candidate-controlled values
  // (e.g. names) must not be able to inject markup/script here.
  t.innerHTML=`<i class="ti ${icon}"></i><span></span>`;
  const span=t.querySelector('span'); if(span) span.textContent=String(msg==null?'':msg);
  void t.offsetWidth; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2800);
}

// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
// PROFILE DROPDOWN
// *Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚*Ã‚
function toggleProfileDropdown(e) {
  e?.stopPropagation?.();
  const menu = document.getElementById('acct-menu');
  if (!menu) return;
  // Move to body to escape backdrop-filter containing block on topbar
  if (menu.parentElement !== document.body) document.body.appendChild(menu);
  if (menu.style.display === 'block') { menu.style.display = 'none'; return; }

  const trigger = (e?.currentTarget || e?.target)?.closest?.('.sidebar-account-trigger,.topbar-profile-btn');
  if (trigger) {
    const r = trigger.getBoundingClientRect();
    const w = Math.min(184, window.innerWidth - 20);
    menu.style.width = w + 'px';
    menu.style.left = Math.max(10, Math.min(r.right - w, window.innerWidth - w - 10)) + 'px';
    menu.style.right = 'auto';
    if (trigger.classList.contains('sidebar-account-trigger')) {
      menu.style.bottom = Math.max(10, window.innerHeight - r.top + 6) + 'px';
      menu.style.top = 'auto';
    } else {
      menu.style.top = (r.bottom + 8) + 'px';
      menu.style.bottom = 'auto';
    }
  }

  // Reset sub-panel and clear fields
  const panel = document.getElementById('pd-edit-panel');
  if (panel) panel.style.display = 'none';
  menu.classList.remove('profile-editing');
  const msg = document.getElementById('pd-msg');
  if (msg) { msg.textContent = ''; msg.className = 'pd-msg'; }
  ['pd-current-pw','pd-new-pw','pd-confirm-pw'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const nameEl = document.getElementById('pd-display-name');
  if (nameEl && currentUser) nameEl.value = currentUser.display || '';
  const uEl = document.getElementById('pd-new-username');
  if (uEl && currentUser) uEl.placeholder = currentUser.username || '';

  menu.style.display = 'block';
}
function closeProfileDropdown() {
  const menu = document.getElementById('acct-menu');
  if (menu) menu.style.display = 'none';
}
function openProfileEdit() {
  const panel=document.getElementById('pd-edit-panel');
  if(panel) panel.style.display='block';
  document.getElementById('acct-menu')?.classList.add('profile-editing');
  const msg=document.getElementById('pd-msg');
  if(msg){ msg.textContent=''; msg.className='pd-msg'; }
  const userInput=document.getElementById('pd-new-username');
  if(userInput && currentUser){ userInput.value=currentUser.username; userInput.placeholder=currentUser.username; }
  const displayInput=document.getElementById('pd-display-name');
  if(displayInput && currentUser){ displayInput.value=currentUser.display || ''; }
  ['pd-current-pw','pd-new-pw','pd-confirm-pw'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  setTimeout(()=>userInput?.focus(),0);
}
function closeProfileEdit() {
  const panel=document.getElementById('pd-edit-panel');
  if(panel) panel.style.display='none';
  document.getElementById('acct-menu')?.classList.remove('profile-editing');
  const msg=document.getElementById('pd-msg');
  if(msg){ msg.textContent=''; msg.className='pd-msg'; }
}
function openChangePassword() {
  openProfileEdit();
  setTimeout(()=>document.getElementById('pd-current-pw')?.focus(),0);
}

function bindAccountMenuTriggers(root = document) {
  root.querySelectorAll?.('.sidebar-account-trigger,.topbar-profile-btn').forEach(trigger => {
    if (trigger.dataset.accountMenuBound === '1') return;
    trigger.dataset.accountMenuBound = '1';
    trigger.addEventListener('click', e => {
      toggleProfileDropdown(e);
    });
  });
}

// Open account menu from either the static sidebar card or the dynamic v5 shell.
document.addEventListener('click', e => {
  const trigger = e.target.closest?.('.sidebar-account-trigger,.topbar-profile-btn');
  if (trigger) { toggleProfileDropdown(e); return; }
  if (!e.target.closest?.('#acct-menu')) closeProfileDropdown();
});

window.toggleProfileDropdown = toggleProfileDropdown;
window.closeProfileDropdown = closeProfileDropdown;
window.openProfileEdit = openProfileEdit;
window.closeProfileEdit = closeProfileEdit;
window.openChangePassword = openChangePassword;

async function saveProfileChanges() {
  const msgEl = document.getElementById('pd-msg');
  const newDisplay = (document.getElementById('pd-display-name').value || '').trim();
  const newUsername = (document.getElementById('pd-new-username').value || '').trim().toLowerCase();
  const currentPw   = document.getElementById('pd-current-pw').value;
  const newPw       = document.getElementById('pd-new-pw').value;
  const confirmPw   = document.getElementById('pd-confirm-pw').value;

  const showMsg = (txt, type) => {
    msgEl.textContent = txt;
    msgEl.className = 'pd-msg ' + type;
  };

  let changed = false;

  const originalUsername = currentUser.username;
  const originalAccount = STAFF_ACCOUNTS[originalUsername];
  if (!originalAccount) {
    showMsg('Current account could not be found. Sign in again.', 'err'); return;
  }

  if (newDisplay && newDisplay !== currentUser.display) {
    originalAccount.display = newDisplay;
    currentUser.display = newDisplay;
    changed = true;
  }

  // "-"- Username change "-"-
  if (newUsername && newUsername !== currentUser.username) {
    if (!/^[a-z0-9._-]{3,32}$/.test(newUsername)) {
      showMsg('Use 3-32 letters, numbers, dots, dashes, or underscores for username.', 'err'); return;
    }
    if (STAFF_ACCOUNTS[newUsername] && newUsername !== currentUser.username) {
      showMsg('That username is already taken.', 'err'); return;
    }
    // rename key in STAFF_ACCOUNTS
    STAFF_ACCOUNTS[newUsername] = { ...originalAccount };
    delete STAFF_ACCOUNTS[originalUsername];
    currentUser.username = newUsername;
    changed = true;
  }

  // "-"- Password change "-"-
  if (currentPw || newPw || confirmPw) {
    if (!currentPw) { showMsg('Enter your current password.', 'err'); return; }
    const account = STAFF_ACCOUNTS[currentUser.username];
    let passwordCheck = { ok: false };
    try {
      passwordCheck = await verifyAccountPassword(account, currentPw);
    } catch (err) {
      showMsg(err.message || 'Current password could not be verified.', 'err'); return;
    }
    if (!passwordCheck.ok) { showMsg('Current password is incorrect.', 'err'); return; }
    if (!newPw) { showMsg('Enter a new password.', 'err'); return; }
    if (newPw.length < 8) { showMsg('New password must be at least 8 characters.', 'err'); return; }
    if (newPw !== confirmPw) { showMsg('New passwords do not match.', 'err'); return; }
    try {
      await setAccountPassword(STAFF_ACCOUNTS[currentUser.username], newPw);
    } catch (err) {
      showMsg(err.message || 'New password could not be secured.', 'err'); return;
    }
    changed = true;
  }

  if (!changed) { showMsg('No changes to save.', 'err'); return; }
  _saveSession(currentUser);
  await saveStaffAccounts();
  showMsg('Changes saved successfully.', 'ok');
  // clear sensitive fields
  ['pd-current-pw','pd-new-pw','pd-confirm-pw'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  // refresh display
  setUserDisplay(currentUser.display, currentUser.role);
}

const AVATAR_KEY = 'dreco_avatar_v1';

function applyUserAvatar(initials) {
  const saved = localStorage.getItem(AVATAR_KEY);
  const imgHtml = saved ? `<img src="${saved}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : '';
  ['suc-avatar', 'pd-avatar', 'pd-avatar-large'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (saved) { el.innerHTML = imgHtml; el.textContent = ''; }
    else { el.innerHTML = ''; el.textContent = initials; }
  });
  ['topbar-avatar', 'sidebar-avatar'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (saved) { el.innerHTML = imgHtml; el.textContent = ''; }
    else { el.innerHTML = ''; el.textContent = initials; }
  });
  const removeBtn = document.getElementById('pd-avatar-remove');
  if (removeBtn) removeBtn.style.display = saved ? 'block' : 'none';
}

function handleAvatarUpload(event) {
  const file = event.target?.files?.[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('Image must be under 2MB', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    localStorage.setItem(AVATAR_KEY, e.target.result as string);
    const d = currentUser?.display || '';
    const parts = d.replace(/[^a-zA-Z ]/g, '').trim().split(' ');
    const initials = parts.length >= 2 ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase() : d.substring(0,2).toUpperCase() || 'U';
    applyUserAvatar(initials);
    showToast('Profile photo updated', 'success');
  };
  reader.readAsDataURL(file);
}

function handleAccountAvatarUpload(event) {
  handleAvatarUpload(event);
  setTimeout(()=>renderAccountPage(), 80);
}

function removeUserAvatar() {
  localStorage.removeItem(AVATAR_KEY);
  const d = currentUser?.display || '';
  const parts = d.replace(/[^a-zA-Z ]/g, '').trim().split(' ');
  const initials = parts.length >= 2 ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase() : d.substring(0,2).toUpperCase() || 'U';
  applyUserAvatar(initials);
  const inp = document.getElementById('pd-avatar-upload') as HTMLInputElement;
  if (inp) inp.value = '';
  showToast('Profile photo removed', 'success');
}

async function saveAccountPageChanges() {
  const msgEl = document.getElementById('account-profile-msg');
  const showMsg = (txt, type) => {
    if (!msgEl) return;
    msgEl.textContent = txt;
    msgEl.className = 'pd-msg ' + type;
  };
  const newDisplay = ((document.getElementById('account-display-name') as HTMLInputElement)?.value || '').trim();
  const newUsername = ((document.getElementById('account-username') as HTMLInputElement)?.value || '').trim().toLowerCase();
  const newEmail = ((document.getElementById('account-email') as HTMLInputElement)?.value || '').trim().toLowerCase();
  const currentPw = (document.getElementById('account-current-pw') as HTMLInputElement)?.value || '';
  const newPw = (document.getElementById('account-new-pw') as HTMLInputElement)?.value || '';
  const confirmPw = (document.getElementById('account-confirm-pw') as HTMLInputElement)?.value || '';

  let changed = false;
  const originalUsername = currentUser?.username;
  if (!originalUsername || !STAFF_ACCOUNTS[originalUsername]) {
    showMsg('Current account could not be found. Sign in again.', 'err'); return;
  }
  const originalAccount = STAFF_ACCOUNTS[originalUsername];

  if (newDisplay && newDisplay !== currentUser.display) {
    originalAccount.display = newDisplay;
    currentUser.display = newDisplay;
    changed = true;
  }

  if (newUsername && newUsername !== currentUser.username) {
    if (!/^[a-z0-9._-]{3,32}$/.test(newUsername)) {
      showMsg('Use 3-32 letters, numbers, dots, dashes, or underscores for username.', 'err'); return;
    }
    if (STAFF_ACCOUNTS[newUsername]) {
      showMsg('That username is already taken.', 'err'); return;
    }
    STAFF_ACCOUNTS[newUsername] = { ...originalAccount };
    delete STAFF_ACCOUNTS[originalUsername];
    currentUser.username = newUsername;
    changed = true;
  }

  const accountForEmail = STAFF_ACCOUNTS[currentUser.username];
  const oldEmail = String(accountForEmail.email || '').toLowerCase();
  if (newEmail !== oldEmail) {
    if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      showMsg('Enter a valid email address.', 'err'); return;
    }
    accountForEmail.email = newEmail;
    accountForEmail.emailVerified = false;
    currentUser.email = newEmail;
    currentUser.emailVerified = false;
    changed = true;
  }

  if (currentPw || newPw || confirmPw) {
    if (!currentPw) { showMsg('Enter your current password.', 'err'); return; }
    const account = STAFF_ACCOUNTS[currentUser.username];
    let passwordCheck = { ok: false };
    try {
      passwordCheck = await verifyAccountPassword(account, currentPw);
    } catch (err: any) {
      showMsg(err.message || 'Current password could not be verified.', 'err'); return;
    }
    if (!passwordCheck.ok) { showMsg('Current password is incorrect.', 'err'); return; }
    if (!newPw) { showMsg('Enter a new password.', 'err'); return; }
    if (newPw.length < 8) { showMsg('New password must be at least 8 characters.', 'err'); return; }
    if (newPw !== confirmPw) { showMsg('New passwords do not match.', 'err'); return; }
    try {
      await setAccountPassword(STAFF_ACCOUNTS[currentUser.username], newPw);
    } catch (err: any) {
      showMsg(err.message || 'New password could not be secured.', 'err'); return;
    }
    changed = true;
  }

  if (!changed) { showMsg('No changes to save.', 'err'); return; }
  _saveSession(currentUser);
  await saveStaffAccounts();
  setUserDisplay(currentUser.display, currentUser.role);
  showMsg('Changes saved successfully.', 'ok');
  ['account-current-pw','account-new-pw','account-confirm-pw'].forEach(id => {
    const el = document.getElementById(id) as HTMLInputElement; if (el) el.value = '';
  });
  renderAccountPage();
}

async function requestAccountEmailVerification() {
  const msgEl = document.getElementById('account-profile-msg');
  const showMsg = (txt, type) => {
    if (!msgEl) return;
    msgEl.textContent = txt;
    msgEl.className = 'pd-msg ' + type;
  };
  const email = ((document.getElementById('account-email') as HTMLInputElement)?.value || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showMsg('Enter a valid email address first.', 'err'); return;
  }
  try {
    const token = await authToken();
    if (!token) throw new Error('Sign in again before verifying your email.');
    await postAuthAction({ action:'request_email_verification', email }, token);
    const account = STAFF_ACCOUNTS[currentUser.username] || {};
    account.email = email;
    account.emailVerified = false;
    STAFF_ACCOUNTS[currentUser.username] = normalizeAccount(currentUser.username, account);
    currentUser.email = email;
    currentUser.emailVerified = false;
    _saveSession(currentUser);
    await saveStaffAccounts();
    showMsg('Verification code sent. Check your email.', 'ok');
  } catch (e: any) {
    showMsg(e.message || 'Could not send verification email.', 'err');
  }
}

async function verifyAccountEmail() {
  const msgEl = document.getElementById('account-profile-msg');
  const showMsg = (txt, type) => {
    if (!msgEl) return;
    msgEl.textContent = txt;
    msgEl.className = 'pd-msg ' + type;
  };
  const code = ((document.getElementById('account-email-code') as HTMLInputElement)?.value || '').trim();
  if (!code) { showMsg('Enter the verification code.', 'err'); return; }
  try {
    const token = await authToken();
    if (!token) throw new Error('Sign in again before verifying your email.');
    const result = await postAuthAction({ action:'verify_email', code }, token);
    const next = normalizeAccount(currentUser.username, {
      ...(STAFF_ACCOUNTS[currentUser.username] || {}),
      ...(result.account || {}),
      emailVerified: true,
    });
    STAFF_ACCOUNTS[currentUser.username] = next;
    currentUser.email = next.email;
    currentUser.emailVerified = true;
    _saveSession(currentUser);
    await saveStaffAccounts();
    showMsg('Email verified successfully.', 'ok');
    renderAccountPage();
  } catch (e: any) {
    showMsg(e.message || 'Email verification failed.', 'err');
  }
}

function setUserDisplay(display, role) {
  const parts = display.replace(/[^a-zA-Z ]/g, '').trim().split(' ');
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : display.substring(0, 2).toUpperCase();

  ['user-chip','sidebar-user-name','topbar-user-name'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = display;
  });
  const sucName = document.getElementById('suc-name');
  if (sucName) sucName.textContent = display;
  const rEl = document.getElementById('sidebar-user-role');
  if (rEl) rEl.textContent = role === 'admin' ? 'Administrator' : 'Staff';
  const pdName = document.getElementById('pd-name');
  if (pdName) pdName.textContent = display;
  const pdAv = document.getElementById('pd-avatar');
  if (pdAv) { pdAv.textContent = initials; pdAv.className = 'dv5-pd-av'; }
  const sucOrg = document.querySelector('.suc-org');
  if (sucOrg) sucOrg.textContent = role === 'admin' ? 'Admin' : 'Staff';
  const pdRoleEl = document.getElementById('pd-role-text');
  if (pdRoleEl) pdRoleEl.textContent = role === 'admin' ? 'Admin' : 'Staff';
  applyUserAvatar(initials);
  updateWorkspaceLabels();
}

// Wire DV5 module with functions it can't import directly (avoids circular dep)
injectDepsToD5({
  proBalance, proStageValue, lbStageValue, proStageMatches,
  lbRefundPrincipal, lbRefundPaidAmount, lbOwnPassport, lbRefundReturned, lbRefundOutstanding,
  showToast, bindAccountMenuTriggers, fmtDate, getCompanyName, DEFAULT_COMPANY, db,
  proPaidAmount, proPaymentStatus, proPipelineStageValue, lbPipelineStageValue,
  addTimeline, saveTimeline, auditAction, saveLocalStore, getStorageLabel, getCompanyId, dbUpdate, dbDelete, deleteCandidateArtifacts, useCloud,
  getActiveGeneralCountry, getGeneralWorkflowStages, getLBWorkflowStagesForRecord,
});

// â”€â”€â”€ Expose module-scope functions on window â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ES modules don't pollute global scope, so onclick="fn()" handlers need this.
Object.assign(window, {
  // Auth & session
  doLogin, doSignup, doRecoveryReset, sendRecoveryCodeEmail, doLogout, loadAllData, setUserDisplay,
  // Navigation
  switchTab, toggleSidebar, openMobileSidebar, closeMobileSidebar,
  // Pro candidates
  openProForm, editPro, savePro, deletePro, renderPro,
  // LB candidates
  openLBForm, editLB, saveLB, deleteLB, renderLB,
  toggleLBSelect, toggleLBOwnPassport, batchSendProfiles,
  // Documents & checklists
  openFirstDocumentUpload, openPendingTravelView,
  renderDocChecklist, getDocProgress,
  // P&L
  openAddCandidateExpense, removeCandidateExpense,
  // Employers / Job orders
  openEmployerForm, submitEmployerForm, deleteEmployer,
  openJobOrderForm, submitJobOrderForm, deleteJobOrder,
  // Finance
  exportCSV, exportReportPDF,
  deleteExpense, openExpensePrompt, submitQuickExpense,
  openBalancePayment, fillFullBalance, submitBalancePayment,
  openRecordPaymentPrompt, submitRecordPayment, openAddPayment, submitAddPayment, markCommissionCleared,
  submitLBRefundPayment, removeLBRefundPayment, openLBRefundPayment,
  setFinancePeriod, setTrendPeriod, updateTrendTooltip, resetTrendTooltip,
  // Calendar / events
  openCalendarEventPrompt, submitCalendarEvent, deleteCalendarEvent,
  openTravelEventPrompt, submitTravelEvent, calNav, setCalSource,
  // Candidates page
  setCandidateSearch: window.setCandidateSearch || null,
  setProStagePill, setLBPill,
  resetAllFilters, resetSavedFilters, saveUserFilters,
  openQuickAddCandidate, submitQuickAddCandidate,
  openStageModal, submitQuickStage,
  applyWorkflowTemplate, resetWorkflowStages, applyPaymentPreset,
  // Settings & config
  openSettingsModal, openSettings, openHelp,
  addCustomStage, addSettingsCountry, removeSettingsCountry,
  addGeneralCountry, setGeneralCountry, submitQuickCountry,
  saveWorkspaceSettings, saveStages, updateCompanyName: typeof updateCompanyName !== 'undefined' ? updateCompanyName : null,
  downloadBackup, restoreBackupFromFile, exportBackup: typeof exportBackup !== 'undefined' ? exportBackup : null,
  createStaffAccount, createCompanyUser, submitQuickUser, openEditTeamMember, submitEditTeamMember, removeTeamMember,
  clearLBDates, clearProDates,
  // Modals & UI helpers
  closeModal, switchModalTab, togglePassword,
  hideForgotPassword, showForgotPassword, hideSignup, showSignup,
  goPage,
  // Account / profile
  renderAccountPage, saveAccountPageChanges, saveProfileChanges, requestAccountEmailVerification, verifyAccountEmail,
  applyUserAvatar, handleAvatarUpload, handleAccountAvatarUpload, removeUserAvatar,
  // Workspace
  getCompanyName, getCompanyId, getGeneralCountries, getActiveGeneralCountry,
});










// =========================================================
// DRECO OPERATIONS UI REFRESH
// Keeps Supabase/data/auth/save/edit functions from the original app.
// Replaces the internal rendering shell with Home, Pipeline, Candidates,
// Tasks, Finance, Documents, Reports, Clients, and Settings.
// =========================================================
// =============================================================
// DRECO v5 â€” Unified UI Layer (replaces all prior render IIFEs)
// =============================================================
// =============================================================
// DRECO v5 â€” Unified UI Layer
// Clean single IIFE. Replaces both ChatGPT IIFEs.
// Uses: proDB, lbDB, allDocs, allTimelines, currentUser,
//       proBalance, hasDocs, fmtDate, escHTML, exportCSV,
//       openProForm, openLBForm, editPro, editLB, openDocs,
//       switchTab (base), toggleSidebar, toggleProfileDropdown
// =============================================================

