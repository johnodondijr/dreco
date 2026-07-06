// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
// SUPABASE CONFIG - loaded at runtime from /api/dreco-config
// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
let db = null;
const LOCAL_STORE_KEY = 'dreco_local_store_v1';
const LOCAL_STAFF_KEY = 'dreco_staff_accounts_v1';
const CLOUD_ACCOUNTS_KEY = 'dreco_accounts_v2';
const AUTH_API_PATH = '/api/dreco-auth';
const AUTH_EMAIL_DOMAIN = 'dreco.local';
let DEFAULT_COMPANY = {
  id: 'dreco-workspace',
  name: 'Dreco Workspace',
  generalJobsCountries: ['General'],
};
let DEFAULT_ADMIN_USERNAME = 'admin';
let RETIRED_USERNAMES = [];
let BLOCKED_ADMIN_ALIASES = [];

// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
// STAFF ACCOUNTS
// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
const STAFF_ACCOUNTS = {};
// Frozen snapshot of hardcoded accounts — used by doLogin to verify admin
// credentials without touching cloud or localStorage. Never mutated.
const _HARDCODED_SNAPSHOT = Object.freeze(
  Object.fromEntries(Object.entries(STAFF_ACCOUNTS).map(([u, a]) => [u, Object.freeze({ ...a })]))
);
// Recovery via shared code removed — password resets go through admin only.

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
    passwordHash: account.passwordHash || '',
    passwordSalt: account.passwordSalt || '',
    generalJobsCountries: [...new Set(generalJobsCountries.map(c => String(c || '').trim()).filter(Boolean))],
  };
  // Preserve hashVersion — critical for PBKDF2 detection in verifyAccountPassword.
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
    if (isDefaultCompany && (username !== DEFAULT_ADMIN_USERNAME || isBlockedAdminAlias)) delete STAFF_ACCOUNTS[username];
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
  if (url && anonKey && window.supabase) {
    db = window.supabase.createClient(url, anonKey);
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
function makePasswordSalt() {
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
// PBKDF2 with 200,000 iterations – deliberately slow to resist offline brute-force.
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
      // Password correct — re-hash with PBKDF2 and save upgraded hash.
      await setAccountPassword(account, password);
      return { ok: true, migrated: true };
    }
    const hash = await pbkdf2Hex(account.passwordSalt, password);
    return { ok: hash === account.passwordHash, migrated: false };
  }
  // Plaintext password (very old accounts) — upgrade immediately.
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

  // Step 3: Merge — cloud first as the base, then local on top.
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
    if (localIsCustom) return; // deliberate password change — keep it
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
      await db.from('app_settings').upsert({ key: CLOUD_ACCOUNTS_KEY, value: STAFF_ACCOUNTS }, { onConflict: 'key' });
    } catch (_) {}
  }
}
async function saveStaffAccounts() {
  normalizeAllAccounts();
  cleanupLegacyDestinyUsers();
  safeLocalSet(LOCAL_STAFF_KEY, JSON.stringify(STAFF_ACCOUNTS));
  if (db) {
    try {
      await db.from('app_settings').upsert({ key: CLOUD_ACCOUNTS_KEY, value: STAFF_ACCOUNTS }, { onConflict: 'key' });
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

// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
// STATE
// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
let currentUser   = null;
let currentCompany = { ...DEFAULT_COMPANY };
let proDB         = [];
let lbDB          = [];
let allDocs       = {};
let allTimelines  = {};
let proStages     = ['SUBMITTED','INTERVIEW','OFFER LETTER','MEDICAL & ATTESTATION','MOL','VISA','PENDING TRAVEL','TRAVELLED'];
let lbStages      = ['DOCS SUBMITTED','PROFILE SENT','SELECTED','PASSPORT APPLIED','VISA PROCESSING','TRAVELLED','REFUND PENDING','REFUND COMPLETE'];
const PRO_PIPELINE_STAGES = ['PENDING OFFER LETTER','OFFER LETTER','MOL','VISA','PENDING TRAVEL','TRAVELLED'];
const LB_PIPELINE_STAGES = ['SUBMITTED','PROFILE SENT','SELECTED','PASSPORT APPLIED','VISA PROCESSING','TRAVELLED','REFUND PENDING','REFUND COMPLETE'];
let drecoExpenses = JSON.parse(safeLocalGet('dreco_expenses') || '[]');
let drecoEvents   = JSON.parse(safeLocalGet('dreco_events') || '[]');
let drecoAudit    = JSON.parse(safeLocalGet('dreco_audit') || '[]');
let editingEventId = null;
let pendingStageType = null;
let pendingStageSelect = null;
let financePeriod = 'month';
let proPage       = 1;
let lbPage        = 1;
let editingProId  = null;
let editingLbId   = null;
let docsTarget    = null;
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
  renderGeneralCountryTabs(); renderSettingsCountries(); renderLB(); renderDash();
}
async function persistWorkspaceCountries(countries) {
  const clean = [...new Set(countries.map(c => String(c || '').trim()).filter(Boolean))];
  const companyId = getCompanyId();
  Object.keys(STAFF_ACCOUNTS).forEach(username => {
    if ((STAFF_ACCOUNTS[username].companyId || DEFAULT_COMPANY.id) === companyId) {
      STAFF_ACCOUNTS[username].generalJobsCountries = clean;
    }
  });
  currentUser = {...currentUser, generalJobsCountries: clean};
  setCurrentWorkspace(currentUser);
  safeSessionSet('dr_user', JSON.stringify(currentUser));
  await saveStaffAccounts();
}

function getDefaultLocalStore() {
  const isDefaultCompany = getCompanyId() === DEFAULT_COMPANY.id;
  return {
    pro: isDefaultCompany ? JSON.parse(JSON.stringify(PRO_SEED)).map(normalizeProRecord) : [],
    lb: isDefaultCompany ? JSON.parse(JSON.stringify(LB_SEED)).map(normalizeLBRecord) : [],
    docs: {},
    timelines: {},
    proStages: [...proStages],
    lbStages: [...lbStages],
  };
}
function toNumOrNull(v) {
  return v===''||v===null||v===undefined ? null : Number(v);
}
function cleanStage(value, fallback = '') {
  return String(value || fallback || '').trim().toUpperCase();
}
function canonicalProStage(stage) {
  const value = cleanStage(stage);
  const legacyMap = {
    'PENDING OFFER': 'PENDING OFFER LETTER',
    'PENDING OL': 'PENDING OFFER LETTER',
    'OFFER': 'OFFER LETTER',
    'OL': 'OFFER LETTER',
    'MEDICAL': 'MOL',
    'MEDICAL & ATTESTATION': 'MOL',
    'PENDING MOL': 'MOL',
    'WORK PERMIT': 'MOL',
    'PENDING VISA': 'VISA',
    'TICKET BOOKED': 'PENDING TRAVEL',
    'READY TO TRAVEL': 'PENDING TRAVEL',
    'TRAVEL': 'PENDING TRAVEL',
    'TRAVELING': 'TRAVELLED',
    'TRAVELLING': 'TRAVELLED',
    'TRAVELED': 'TRAVELLED',
  };
  return legacyMap[value] || value;
}
function proStageValue(row = {}) {
  return canonicalProStage(row.stage || proStages[0] || 'SUBMITTED');
}
function lbStageValue(row = {}) {
  return cleanStage(row.stage || row.travelStatus || row.travel_status, lbStages[0] || 'DOCS SUBMITTED');
}
function proPipelineStageValue(row = {}) {
  const raw = row.raw || row;
  const stage = canonicalProStage(raw.stage || row.stage);
  if (stage === 'TRAVELLED') return 'TRAVELLED';
  if (toInput(raw.travel || row.travel)) return 'PENDING TRAVEL';
  if (toInput(raw.visa || row.visa)) return 'VISA';
  if (toInput(raw.mol || row.mol)) return 'MOL';
  if (toInput(raw.ol || row.ol)) return 'OFFER LETTER';
  if (PRO_PIPELINE_STAGES.includes(stage)) return stage;
  if (['SUBMITTED','INTERVIEW','PENDING INTERVIEW','NOT YET',''].includes(stage)) return 'PENDING OFFER LETTER';
  return 'PENDING OFFER LETTER';
}
function lbPipelineStageValue(row = {}) {
  const raw = row.raw || row;
  const stage = cleanStage(raw.stage || raw.travelStatus || raw.travel_status || row.stage);
  const map = {
    'DOCS SUBMITTED': 'SUBMITTED',
    'DOCUMENTS SUBMITTED': 'SUBMITTED',
    'NOT YET': 'SUBMITTED',
  };
  return LB_PIPELINE_STAGES.includes(map[stage] || stage) ? (map[stage] || stage) : 'SUBMITTED';
}
function stageListWithData(configured = [], rows = [], getter = row => row.stage, normalizer = cleanStage) {
  const seen = new Set();
  return [...configured, ...rows.map(getter)]
    .map(stage => normalizer(stage))
    .filter(stage => stage && !seen.has(stage) && seen.add(stage));
}
function proStageMatches(row, stages) {
  const stage = proStageValue(row);
  return [].concat(stages).map(canonicalProStage).includes(stage);
}
function proPaidAmount(row = {}) {
  const splitPaid = (Number(row.paid1) || 0) + (Number(row.paid2) || 0);
  const directPaid = Number(row.paid) || 0;
  // Use whichever total is larger: handles legacy paid1/paid2 records and new
  // running-total records where partial payments accumulate into paid directly.
  return Math.max(splitPaid, directPaid);
}
function lbRefundPaidAmount(row = {}) {
  const legacyPaid = (Number(row.r1Amt || row.r1_amt) || 0) + (Number(row.r2Amt || row.r2_amt) || 0);
  const newPaid = (Array.isArray(row.refundPayments) ? row.refundPayments : [])
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return Math.max(legacyPaid, newPaid);
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
    stage:proStageValue(r),
    submitted:normalizeDateField(r.submitted),
    interview:normalizeDateField(r.interview),
    ol:normalizeDateField(r.ol),
    mol:normalizeDateField(r.mol),
    visa:normalizeDateField(r.visa),
    travel:normalizeDateField(r.travel),
    commission:toNumOrNull(r.commission),
    paid1,
    paid2,
    paid:toNumOrNull(r.paid),
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
    proStages,
    lbStages,
  }));
}
function nextLocalId(rows) {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
}

// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
// LOADING
// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
function showLoading(msg = 'Loading...') {
  const el = document.getElementById('loading-text'); if (el) el.textContent = msg;
  document.getElementById('loading-overlay').classList.add('show');
}
function hideLoading() { document.getElementById('loading-overlay').classList.remove('show'); }

// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
// SIDEBAR TOGGLE
// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  if (window.innerWidth <= 640) {
    sb.classList.contains('mobile-open') ? closeMobileSidebar() : openMobileSidebar();
  } else {
    sb.classList.toggle('collapsed');
    document.getElementById('app')?.classList.toggle('sidebar-collapsed', sb.classList.contains('collapsed'));
  }
}
function openMobileSidebar() {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  // Must use setProperty with 'important' priority — CSS display:none!important
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
  sp('background', '#fff');
  sp('box-shadow', '6px 0 32px rgba(0,0,0,.45)');
  sp('border-radius', '0');
  sp('border-right', '1px solid #E2E8F0');
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
    if (dx > MIN_SWIPE && dy < 80 && window.innerWidth <= 640) openMobileSidebar();
    dragging = false;
  }, { passive: true });
})();

// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
// AUTH
// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
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
  document.getElementById('login-main').style.display='none';
  document.getElementById('signup-section').style.display='none';
  document.getElementById('forgot-section').style.display='block';
}
function hideForgotPassword() {
  document.getElementById('forgot-section').style.display='none';
  document.getElementById('signup-section').style.display='none';
  document.getElementById('login-main').style.display='block';
}
function showSignup() {
  document.getElementById('login-main').style.display='none';
  document.getElementById('forgot-section').style.display='none';
  document.getElementById('signup-section').style.display='block';
  const err=document.getElementById('signup-error'); if(err) err.style.display='none';
}
function hideSignup() {
  document.getElementById('signup-section').style.display='none';
  document.getElementById('forgot-section').style.display='none';
  document.getElementById('login-main').style.display='block';
}

// ── Centralised post-login entry point ───────────────────────────────────────
// Replaces three near-identical blocks that previously existed in doLogin,
// doSignup, and the DOMContentLoaded session-restore handler.
function enterApp(user) {
  currentUser = user;
  setCurrentWorkspace(currentUser);
  safeSessionSet('dr_user', JSON.stringify(currentUser));
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('bottom-nav')?.classList.add('visible');
  setUserDisplay(currentUser.display, currentUser.role);
  appStorageMode = db ? 'cloud' : 'local';
  loadAllData();
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
  if(password.length<6) return fail('Password must be at least 6 characters.');
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

// ── Login rate limiter ────────────────────────────────────────────────────────
// Tracks failed attempts in memory per username. After MAX_FAILURES attempts
// the account is locked for LOCKOUT_MS. State lives only in this session so a
// hard refresh resets it – sufficient to block automated scripts without
// requiring server-side state.
const _loginAttempts = {};
const MAX_FAILURES   = 5;
const LOCKOUT_MS     = 30 * 1000; // 30 seconds

function _recordLoginFailure(username) {
  const entry = _loginAttempts[username] || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) entry.lockedUntil = Date.now() + LOCKOUT_MS;
  _loginAttempts[username] = entry;
}
function _checkLoginLockout(username) {
  const entry = _loginAttempts[username];
  if (!entry) return null;
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    const secsLeft = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
    return `Too many failed attempts. Try again in ${secsLeft} seconds.`;
  }
  return null;
}
function _clearLoginFailures(username) {
  delete _loginAttempts[username];
}

async function doLogin() {
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

  // ── HARDCODED ACCOUNTS: verified directly, no cloud involved ─────────────
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
      const remaining = MAX_FAILURES - (_loginAttempts[username]?.count || 0);
      fail(`Incorrect username or password.${remaining > 0 ? ` (${remaining} attempt${remaining!==1?'s':''} left)` : ''}`);
      return;
    }
    _clearLoginFailures(username);
    // Kick off a background cloud load so staff data is available after login,
    // but don't block on it — the hardcoded account is already authoritative.
    loadStaffAccounts().catch(() => {});
    errEl.style.display = 'none';
    setLoginSuccessState();
    enterApp({ username, role: hardcodedEntry.role, display: hardcodedEntry.display, companyId: hardcodedEntry.companyId, companyName: hardcodedEntry.companyName, generalJobsCountries: hardcodedEntry.generalJobsCountries });
    return;
  }

  // ── STAFF ACCOUNTS: loaded from cloud + localStorage ─────────────────────
  await loadStaffAccounts();

  // Try Supabase Auth first (gives us a live session token)
  try {
    const authLogin = await signInWithSupabaseAuth(username, password);
    if (authLogin?.account) {
      _clearLoginFailures(username);
      // Preserve password fields — Supabase Auth doesn't store them
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
    const remaining = MAX_FAILURES - (_loginAttempts[username]?.count || 0);
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
  if (db?.auth) db.auth.signOut().catch(err => console.warn('Supabase sign out failed:', err));
  safeSessionRemove('dr_user'); currentUser=null;
  document.getElementById('app').style.display='none';
  document.getElementById('bottom-nav')?.classList.remove('visible');
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('pw-input').value='';
  document.getElementById('username-input').value='';
  document.getElementById('login-error').style.display='none';
  setLoginBusy(false);
  hideForgotPassword();
}

window.addEventListener('DOMContentLoaded', async () => {
  await loadRuntimeConfig();
  await loadStaffAccounts();
  initLoginInteractions();
  const saved=safeSessionGet('dr_user');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      const account = STAFF_ACCOUNTS[parsed.username];
      if (!account) throw new Error('Unknown saved user');
      enterApp({
        username: parsed.username,
        role: account.role,
        display: account.display,
        companyId: account.companyId,
        companyName: account.companyName,
        generalJobsCountries: account.generalJobsCountries,
      });
    } catch { safeSessionRemove('dr_user'); }
  }
  rebuildStageSelects();
  // Delegated listener for docs buttons – avoids interpolating candidate names
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

// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
// DATA LOADING
// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
async function loadAllData() {
  if (!useCloud()) {
    appStorageMode='local';
    const local = loadLocalStore();
    proDB = local.pro;
    lbDB = local.lb;
    allDocs = local.docs;
    allTimelines = local.timelines;
    proStages = local.proStages;
    lbStages = local.lbStages;
    rebuildStageSelects();
    restoreUserFilters();
    hideLoading();
    if (typeof window.dv5Init === 'function') window.dv5Init();
    switchTab('dash');
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
    if (proRes.data&&proRes.data.length>0) proDB=proRes.data.map(normalizeProRecord); else if(companyId===DEFAULT_COMPANY.id) await seedProData(); else proDB=[];
    if (lbRes.data&&lbRes.data.length>0)   lbDB=lbRes.data.map(normalizeLBRecord);   else if(companyId===DEFAULT_COMPANY.id) await seedLBData(); else lbDB=[];
    allDocs={};
    allTimelines={};
    if (docsRes.data)   docsRes.data.forEach(r=>{ if(companyId===DEFAULT_COMPANY.id&&!String(r.key).includes(':')) allDocs[r.key]=r.data; else if(String(r.key).startsWith(`${companyId}:`)) allDocs[stripCompanyScopedKey(r.key)]=r.data; });
    if (tlRes.data)     tlRes.data.forEach(r=>{ if(companyId===DEFAULT_COMPANY.id&&!String(r.key).includes(':')) allTimelines[r.key]=r.entries; else if(String(r.key).startsWith(`${companyId}:`)) allTimelines[stripCompanyScopedKey(r.key)]=r.entries; });
    if (stagesRes.data) {
      const ps=stagesRes.data.find(r=>r.key===getCompanyScopedKey('pro_stages')) || stagesRes.data.find(r=>r.key==='pro_stages'&&companyId===DEFAULT_COMPANY.id);
      const ls=stagesRes.data.find(r=>r.key===getCompanyScopedKey('lb_stages')) || stagesRes.data.find(r=>r.key==='lb_stages'&&companyId===DEFAULT_COMPANY.id);
      if (ps) proStages=ps.value;
      if (ls) lbStages=ls.value;
    }
  } catch(err) {
    console.warn('Supabase error, falling back to local data:',err);
    appStorageMode='local';
    lastSyncError=err.message||'Supabase connection failed';
    const local=loadLocalStore();
    proDB=local.pro;
    lbDB=local.lb;
    allDocs=local.docs;
    allTimelines=local.timelines;
    proStages=local.proStages;
    lbStages=local.lbStages;
    showToast('Cloud sync unavailable. Using local mode.','error');
  }
  rebuildStageSelects();
  restoreUserFilters();
  hideLoading();
  // Signal DV5 that data is ready - ensure sidebar and sections exist before render
  if (typeof window.dv5Init === 'function') window.dv5Init();
  switchTab('dash');
}

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
  if(data&&data.length) proDB=data.map(normalizeProRecord); else { console.warn('Seed insert failed',error); proDB=JSON.parse(JSON.stringify(PRO_SEED)).map(normalizeProRecord); }
}
async function seedLBData() {
  const seed=JSON.parse(JSON.stringify(LB_SEED)).map(r=>{
    ['travelDate','r1Date','r2Date'].forEach(f=>r[f]=normalizeDateField(r[f])); r.company_id=getCompanyId(); r.country=getGeneralJobsCountries()[0]||'General'; delete r.id; return r;
  });
  const {data,error}=await db.from('lb_candidates').insert(seed).select();
  if(data&&data.length) lbDB=data.map(normalizeLBRecord); else { console.warn('Seed insert failed',error); lbDB=JSON.parse(JSON.stringify(LB_SEED)).map(normalizeLBRecord); }
}

// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
// SAVE STATUS
// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
function setSaveStatus(s) {
  const dot=document.getElementById('save-dot');
  const lbl=document.getElementById('save-label');
  if (!dot||!lbl) return;
  dot.className='save-dot'+(s==='saving'?' saving':'');
  lbl.textContent=s==='saving'?'Saving...':`${appStorageMode==='cloud'?'Cloud saved':'Local saved'} ${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`;
}

// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
// SUPABASE WRITES
// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
function useCloud() { return db && appStorageMode==='cloud'; }
async function dbInsert(table, rec) {
  const ts={...rec, company_id:getCompanyId()}; delete ts.id;
  const {data,error}=await db.from(table).insert(ts).select().single();
  if(error) throw error;
  return data;
}
async function dbUpdate(table, id, rec) {
  const ts={...rec, company_id:getCompanyId()}; delete ts.id;
  const {error}=await db.from(table).update(ts).eq('id',id).eq('company_id',getCompanyId());
  if(error) throw error;
}
async function dbDelete(table, id) {
  const {error}=await db.from(table).delete().eq('id',id).eq('company_id',getCompanyId());
  if(error) throw error;
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
  if (lbl) lbl.textContent = 'Local only – cloud unavailable';
}
async function saveProRecord(rec) {
  setSaveStatus('saving');
  if (!useCloud()) {
    saveLocalStore();
    setSaveStatus('saved');
    return;
  }
  const tempId=rec.id;
  try {
    if (editingProId) {
      await dbUpdate('pro_candidates',rec.id,rec);
    } else {
      const data=await dbInsert('pro_candidates',rec);
      if (data) {
        const oldId=rec.id;
        rec.id=data.id;
        const i=proDB.findIndex(x=>x.id==oldId); if(i>-1) proDB[i].id=data.id;
        if(allTimelines[`pro_${tempId}`]){allTimelines[`pro_${rec.id}`]=allTimelines[`pro_${tempId}`];delete allTimelines[`pro_${tempId}`];}
        renderPro();
      }
    }
    await saveTimeline(`pro_${rec.id}`);
    setSaveStatus('saved');
  } catch(e){ fallBackToLocal(e); setSaveStatus('saved'); }
}
async function saveLBRecord(rec) {
  setSaveStatus('saving');
  if (!useCloud()) {
    saveLocalStore();
    setSaveStatus('saved');
    return;
  }
  const tempId=rec.id;
  try {
    if (editingLbId) {
      await dbUpdate('lb_candidates',rec.id,rec);
    } else {
      const data=await dbInsert('lb_candidates',rec);
      if (data) {
        const oldId=rec.id;
        rec.id=data.id;
        const i=lbDB.findIndex(x=>x.id==oldId); if(i>-1) lbDB[i].id=data.id;
        if(allTimelines[`lb_${tempId}`]){allTimelines[`lb_${rec.id}`]=allTimelines[`lb_${tempId}`];delete allTimelines[`lb_${tempId}`];}
        renderLB();
      }
    }
    await saveTimeline(`lb_${rec.id}`);
    setSaveStatus('saved');
  } catch(e){ fallBackToLocal(e); setSaveStatus('saved'); }
}
async function deleteProRecord(id) {
  setSaveStatus('saving');
  if (!useCloud()) { saveLocalStore(); setSaveStatus('saved'); return; }
  try {
    await dbDelete('pro_candidates', id);
    setSaveStatus('saved');
  } catch (e) { fallBackToLocal(e); setSaveStatus('saved'); }
}
async function deleteLBRecord(id) {
  setSaveStatus('saving');
  if (!useCloud()) { saveLocalStore(); setSaveStatus('saved'); return; }
  try {
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
  try{ const {error}=await db.from('app_settings').upsert([{key:getCompanyScopedKey('pro_stages'),value:proStages,company_id:getCompanyId()},{key:getCompanyScopedKey('lb_stages'),value:lbStages,company_id:getCompanyId()}],{onConflict:'key'}); if(error) throw error; setSaveStatus('saved'); }
  catch(e){fallBackToLocal(e);setSaveStatus('saved');}
}

// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
// TIMELINE
// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
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

// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
// HELPERS
// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
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
function isInProcessPro(r){ return ['SUBMITTED','INTERVIEW','OFFER LETTER','MEDICAL & ATTESTATION','MOL','VISA','PENDING TRAVEL',
  // legacy stage names for backward compat
  'PENDING OFFER LETTER','PENDING MOL','PENDING VISA'].includes(r.stage); }
function isInProcessLB(r){
  const ts=lbStageValue(r);
  return !['TRAVELLED','REFUND PENDING','REFUND COMPLETE','NOT TRAVELLED'].includes(ts)&&!lbOwnPassport(r);
}
function stageBadge(s){
  const map={'PENDING OFFER LETTER':'b-pol','PENDING MOL':'b-mol','PENDING VISA':'b-visa','PENDING TRAVEL':'b-travel','TRAVELLED':'b-travelled'};
  return `<span class="badge ${map[s]||'b-na'}">${escHTML(s)}</span>`;
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

// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
// TABS + MODALS
// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
function switchTab(tab){
  if (window.innerWidth <= 640) closeMobileSidebar();
  // DV5 unified tab router — handles both legacy and new tabs
  const DV5_TABS = ['dash','pipeline','candidates','finance','documents','reports','clients','settings'];
  const DV5_ALIASES = {
    pro:'candidates', lb:'candidates',
    kanban:'pipeline', travel:'pipeline', tasks:'pipeline',
    calendar:'pipeline',
    commissions:'finance', repayments:'finance', expenses:'finance',
    team:'settings', help:'settings'
  };
  const DV5_TITLES = {
    dash:'Home', pipeline:'Pipeline', candidates:'Candidates',
    tasks:'Tasks', finance:'Finance', documents:'Documents',
    reports:'Reports', clients:'Clients', settings:'Settings'
  };

  const t = DV5_ALIASES[tab] || tab || 'dash';

  // Hide all known sections
  const allSections = [
    ...DV5_TABS,
    'pro','lb','kanban','travel','calendar',
    'commissions','repayments','expenses','team','help'
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

  // Route to renderer — use window.renderX so DV5 overrides are picked up
  const renderers = {
    dash: ()=> (window.renderDash || renderDash)(),
    pipeline: ()=> window.renderPipelinePage?.(),
    candidates: ()=> window.renderCandidatesPage?.(),
    finance: ()=> window.renderFinancePage?.(),
    documents: ()=> window.renderDocumentsPage?.(),
    reports: ()=> window.renderReportsPage?.(),
    clients: ()=> window.renderClientsPage?.(),
    settings: ()=> (typeof renderSettingsPage === 'function') && renderSettingsPage(),
    // Legacy fallbacks
    pro: ()=> { if(typeof rebuildProPills==='function') rebuildProPills(); if(typeof renderPro==='function') renderPro(); },
    lb: ()=> (typeof renderLB === 'function') && renderLB(),
    travel: ()=> (typeof renderTravel === 'function') && renderTravel(),
    calendar: ()=> (typeof renderCalendar === 'function') && renderCalendar(),
    team: ()=> (typeof renderTeam === 'function') && renderTeam(),
    help: ()=> (typeof renderHelpPage === 'function') && renderHelpPage(),
  };
  if (renderers[t]) renderers[t]();
}
function setBottomNav(t){
  document.querySelectorAll('.bottom-nav-item').forEach(btn=>btn.classList.remove('active'));
  const active=document.getElementById('bnav-'+t);
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
      [['interview','Interview','cal-ev-interview'],['ol','Offer letter','cal-ev-ol'],['mol','MOL','cal-ev-mol'],['visa','Visa','cal-ev-visa'],['travel','Travel','cal-ev-travel']].forEach(([field,label,cls])=>{
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
  const proTravelled=proDB.filter(r=>r.stage==='TRAVELLED').length;
  const lbTravelled=lbDB.filter(r=>(r.travelStatus||r.travel_status)==='TRAVELLED').length;
  const totalComm=proDB.reduce((sum,r)=>sum+(Number(r.commission)||0),0);
  const totalPaid=proDB.reduce((sum,r)=>sum+(Number(r.paid)||0),0);
  const refundOpen=lbDB.filter(r=>getRefundStatus(r)==='incomplete').length;
  const proActionCount=proDB.filter(proNeedsAction).length;
  const lbActionCount=lbDB.filter(lbNeedsAction).length;
  const missingDocs=proDB.filter(r=>!hasDocs('pro',r.id)).length+lbDB.filter(r=>!hasDocs('lb',r.id)).length;
  const stalledStages=proStages.map(stage=>({stage,count:proDB.filter(r=>r.stage===stage).length})).sort((a,b)=>b.count-a.count)[0];
  const money=n=>'KES '+Number(n||0).toLocaleString();
  const short=s=>{
    const v=String(s||'-').replace(/^PENDING\s+/,'').trim();
    return v.length>11?v.slice(0,10)+'...':v;
  };
  const palette=['#5347CE','#887CFD','#4896FE','#16C8C7','#DDEBFF','#EFEEFF','#E8FAF7','#F8FAFC'];
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
    value:proDB.filter(r=>r.stage===stage).length,
    color:palette[i%palette.length]
  })).filter(x=>x.value>0);
  const maxStage=Math.max(1,...stageData.map(x=>x.value));

  const positionMap={};
  proDB.forEach(r=>{
    const key=(r.position||'Unassigned').trim()||'Unassigned';
    if(!positionMap[key]) positionMap[key]={position:key,total:0,travelled:0,inProcess:0,billed:0,paid:0};
    positionMap[key].total++;
    if(r.stage==='TRAVELLED') positionMap[key].travelled++;
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
      <td class="name-cell">${row.position}</td>
      <td>${row.total}</td>
      <td>${row.travelled}</td>
      <td>${row.inProcess}</td>
      <td>${money(row.billed)}</td>
      <td>${money(row.paid)}</td>
      <td><span class="conversion-pill ${conv>=50?'high':'low'}">${conv}%</span></td>
    </tr>`;
  }).join(''):`<tr><td colspan="7"><div class="empty">No position data yet</div></td></tr>`;

  wrap.innerHTML=`<div class="action-grid">
    <div class="action-card warn"><i class="ti ti-alert-triangle"></i><div><strong>${proActionCount}</strong><span>Professional records need attention: missing docs, pending travel, or outstanding balance.</span></div></div>
    <div class="action-card danger"><i class="ti ti-receipt-refund"></i><div><strong>${lbActionCount}</strong><span>General Jobs records need attention, including ${refundOpen} open balances.</span></div></div>
    <div class="action-card good"><i class="ti ti-file-check"></i><div><strong>${missingDocs}</strong><span>Candidate records are missing document links across both pipelines.</span></div></div>
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
      <div class="report-note">${positionStats.slice(0,5).map(r=>`${r.position}: ${r.total}`).join('  |  ')||'No position records yet'}</div>
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
    <span style="display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:999px;background:#F8FAFC;padding:7px 9px;font-size:12px;font-weight:800;color:var(--ink)">
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
  renderDash();
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
  renderDash();
  showToast('Country removed','success');
}
function getCompanyUsers() {
  const companyId = getCompanyId();
  return Object.entries(STAFF_ACCOUNTS)
    .filter(([, account]) => (account.companyId || DEFAULT_COMPANY.id) === companyId)
    .sort(([a], [b]) => a.localeCompare(b));
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
        <div style="font-size:13px;font-weight:800;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHTML(account.display || username)}</div>
        <div style="font-size:11px;color:var(--text-3)">@${escHTML(username)}</div>
      </div>
      <span style="font-size:10px;font-weight:800;text-transform:uppercase;color:${account.role === 'admin' ? 'var(--nexus-purple)' : 'var(--text-3)'}">${account.role === 'admin' ? 'Admin' : 'Staff'}</span>
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
  if (password.length < 6) return fail('Temporary password must be at least 6 characters.');
  if (db?.auth) {
    try {
      const { data: sessionData } = await db.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token) {
        const authResult = await postAuthAction({ action:'create_user', display, username, password, role }, token);
        STAFF_ACCOUNTS[username] = normalizeAccount(username, authResult.account);
        await saveStaffAccounts();
        ['new-user-display','new-user-username','new-user-password'].forEach(id => {
          const el = document.getElementById(id); if (el) el.value = '';
        });
        const roleEl = document.getElementById('new-user-role'); if (roleEl) roleEl.value = 'staff';
        if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
        renderCompanyUsers();
        showToast('User added','success');
        return;
      }
    } catch (err) {
      console.warn('Supabase Auth user creation unavailable; using local account registry:', err);
    }
  }
  STAFF_ACCOUNTS[username] = normalizeAccount(username, {
    role,
    display,
    companyId: getCompanyId(),
    companyName: getCompanyName(),
    generalJobsCountries: getGeneralCountries(),
  });
  try {
    await setAccountPassword(STAFF_ACCOUNTS[username], password);
    await saveStaffAccounts();
  } catch (err) {
    delete STAFF_ACCOUNTS[username];
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
  currentUser={...currentUser,companyName};
  setCurrentWorkspace(currentUser);
  safeSessionSet('dr_user',JSON.stringify(currentUser));
  await saveStaffAccounts();
  setUserDisplay(currentUser.display,currentUser.role);
  renderDash(); renderLB(); renderReports();
  showToast('Workspace updated','success');
}
function openHelp(){ closeProfileDropdown(); switchTab('help'); }
function downloadBackup(){
  // Strip credential fields before export – hashes must never leave the browser
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
    staffAccounts: safeAccounts,
  };
  const a=Object.assign(document.createElement('a'),{
    href:URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'})),
    download:`Dreco_Backup_${new Date().toISOString().split('T')[0]}.json`
  });
  a.click();
  showToast('Backup downloaded','success');
}
function restoreBackupFromFile(file){
  if(!file) return;
  if(!confirm('Restore this backup into the current browser workspace? This replaces the records currently loaded in Dreco.')) return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const data=JSON.parse(reader.result);
      proDB=(data.pro||[]).map(normalizeProRecord);
      lbDB=(data.lb||[]).map(normalizeLBRecord);
      allDocs=data.docs||{};
      allTimelines=data.timelines||{};
      proStages=Array.isArray(data.proStages)&&data.proStages.length?data.proStages:[...proStages];
      lbStages=Array.isArray(data.lbStages)&&data.lbStages.length?data.lbStages:[...lbStages];
      if(data.staffAccounts&&typeof data.staffAccounts==='object'){
        // Validate each restored account before merging – a crafted backup file
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
  const tabs=modal==='pro'?['details','pipeline','commission','timeline']:['details','refunds','timeline'];
  tabs.forEach(tt=>{ const el=document.getElementById(`${modal}-tab-${tt}`); if(el) el.style.display=tt===tab?'':'none'; });
  btn.closest('.modal-tabs').querySelectorAll('.modal-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}
function closeModal(id){ const el=document.getElementById(id); if(el) el.classList.remove('open'); }

function moneyKES(v){ return 'KES '+Number(v||0).toLocaleString(); }
function moneyUSD(v){ return '$'+Number(v||0).toLocaleString(); }
function proBalance(r){
  return Math.max((Number(r.commission)||0)-proPaidAmount(r),0);
}
function proNeedsAction(r){
  const stage=r.stage||'';
  return !hasDocs('pro',r.id) || (stage!=='TRAVELLED'&&!toInput(r.travel)) || proBalance(r)>0;
}
function lbNeedsAction(r){
  return !hasDocs('lb',r.id) || getRefundStatus(r)==='incomplete' || ((r.travelStatus||r.travel_status)==='NOT YET');
}
function validateProRecord(rec) {
  if(!rec.name) return 'Full name is required.';
  if(!rec.stage) return 'Current stage is required.';
  if(rec.commission!==null && rec.commission<0) return 'Commission cannot be negative.';
  if(rec.paid!==null && rec.paid<0) return 'Amount paid cannot be negative.';
  const totalPaid = proPaidAmount(rec);
  if(rec.commission!==null && totalPaid > (Number(rec.commission)||0)) return 'Amount paid cannot exceed commission billed.';
  const TRAVEL_STAGES = ['PENDING TRAVEL','TRAVELLED'];
  if(TRAVEL_STAGES.includes(String(rec.stage||'').toUpperCase()) && !rec.travel) return 'Travel date is required when stage is Pending Travel or Travelled.';
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
  if(String(rec.travelStatus||'').toUpperCase()==='TRAVELLED' && !lbOwnPassport(rec) && !rec.toRefund) return 'Please enter the refund amount before marking as Travelled.';
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
  const rec=r||{name:'New professional candidate',pp:'Passport pending',position:'Position not set',company:'Company not set',stage:proStages[0]||'PENDING OFFER LETTER',commission:0,paid:0};
  const bal=proBalance(rec);
  el.innerHTML=`<div class="candidate-summary-main">
    <div class="candidate-summary-name">${rec.name||'New professional candidate'}</div>
    <div class="candidate-summary-meta">
      <span><i class="ti ti-id"></i>${rec.pp||'No passport'}</span>
      <span><i class="ti ti-briefcase"></i>${rec.position||'No position'}</span>
      <span><i class="ti ti-building"></i>${rec.company||'No company'}</span>
      <span class="summary-status">${stageBadge(rec.stage||'PENDING OFFER LETTER')}</span>
    </div>
  </div>
  <div class="candidate-summary-kpis">
    <div class="candidate-kpi"><strong>${isNew?'-':moneyKES(rec.commission)}</strong><span>Billed</span></div>
    <div class="candidate-kpi"><strong>${isNew?'-':moneyKES(Math.max(0,bal))}</strong><span>Balance</span></div>
  </div>`;
}
function renderLBSummary(r){
  const el=document.getElementById('lb-summary'); if(!el) return;
  const isNew=!r;
  const rec=r||{name:'New General Jobs candidate',phone:'No phone',ppStatus:'APPLIED',travelStatus:lbStages[0]||'NOT YET',toRefund:0,r1Amt:0,r2Amt:0};
  const paid=(Number(rec.r1Amt||rec.r1_amt)||0)+(Number(rec.r2Amt||rec.r2_amt)||0);
  const owed=Number(rec.toRefund||rec.to_refund)||0;
  el.innerHTML=`<div class="candidate-summary-main">
    <div class="candidate-summary-name">${rec.name||'New General Jobs candidate'}</div>
    <div class="candidate-summary-meta">
      <span><i class="ti ti-phone"></i>${rec.phone||'No phone'}</span>
      <span class="summary-status">${ppBadge(rec.ppStatus||rec.pp_status||'APPLIED')}</span>
      <span class="summary-status">${travelBadge(rec.travelStatus||rec.travel_status||'NOT YET')}</span>
      <span class="summary-status">${refundBadge(isNew?'N/A':getRefundStatus(rec))}</span>
    </div>
  </div>
  <div class="candidate-summary-kpis">
    <div class="candidate-kpi"><strong>${isNew?'-':moneyUSD(owed)}</strong><span>To refund</span></div>
    <div class="candidate-kpi"><strong>${isNew?'-':moneyUSD(Math.max(0,owed-paid))}</strong><span>Balance</span></div>
  </div>`;
}
function readProFormSummary(){
  return {
    name:document.getElementById('pf-name')?.value||'New professional candidate',
    pp:document.getElementById('pf-pp')?.value||'',
    position:document.getElementById('pf-position')?.value||'',
    company:document.getElementById('pf-company')?.value||'',
    stage:document.getElementById('pf-stage')?.value||proStages[0],
    commission:Number(document.getElementById('pf-comm')?.value)||0,
    paid:(Number(document.getElementById('pf-paid1')?.value)||0)+(Number(document.getElementById('pf-paid2')?.value)||0),
  };
}
function readLBFormSummary(){
  return {
    name:document.getElementById('lf-name')?.value||'New General Jobs candidate',
    phone:document.getElementById('lf-phone')?.value||'',
    ppStatus:document.getElementById('lf-pp')?.value||'APPLIED',
    travelStatus:document.getElementById('lf-stage')?.value||document.getElementById('lf-travel')?.value||lbStages[0],
    toRefund:Number(document.getElementById('lf-torefund')?.value)||0,
    r1Amt:Number(document.getElementById('lf-r1amt')?.value)||0,
    r2Amt:Number(document.getElementById('lf-r2amt')?.value)||0,
  };
}
function bindModalSummaries(){
  ['pf-name','pf-pp','pf-position','pf-company','pf-stage','pf-comm','pf-paid1','pf-paid2'].forEach(id=>{
    const el=document.getElementById(id); if(el){ el.addEventListener('input',()=>renderProSummary(readProFormSummary())); el.addEventListener('change',()=>renderProSummary(readProFormSummary())); }
  });
  ['lf-name','lf-phone','lf-pp','lf-stage','lf-travel','lf-torefund','lf-r1amt','lf-r2amt'].forEach(id=>{
    const el=document.getElementById(id); if(el){ el.addEventListener('input',()=>renderLBSummary(readLBFormSummary())); el.addEventListener('change',()=>renderLBSummary(readLBFormSummary())); }
  });
}

// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
// STAGES + PILLS
// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
function rebuildStageSelects(){
  const proSel=document.getElementById('pf-stage');
  if(proSel) proSel.innerHTML=proStages.map(s=>`<option value="${s}">${s}</option>`).join('')+`<option value="__add_new__">+ Add new stage...</option>`;
  const lbSel=document.getElementById('lf-stage');
  if(lbSel)  lbSel.innerHTML=lbStages.map(s=>`<option value="${s}">${s}</option>`).join('')+`<option value="__add_new__">+ Add new stage...</option>`;
  const lbSel2=document.getElementById('lf-travel');
  if(lbSel2) lbSel2.innerHTML=lbStages.map(s=>`<option value="${s}">${s}</option>`).join('')+`<option value="__add_new__">+ Add new status...</option>`;
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

// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
// DASHBOARD
// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
function renderDash(){
  const proTravelled=proDB.filter(r=>r.stage==='TRAVELLED').length;
  const proInProcess=proDB.filter(isInProcessPro).length;
  let totalComm=0,totalPaid=0;
  proDB.forEach(r=>{
    if(r.commission) totalComm+=Number(r.commission);
    const p=(Number(r.paid1)||0)+(Number(r.paid2)||0)||(Number(r.paid)||0);
    totalPaid+=p;
  });

  const lbTravelled=lbDB.filter(r=>(r.stage||r.travelStatus||r.travel_status)==='TRAVELLED').length;
  const lbInProcess=lbDB.filter(isInProcessLB).length;
  let lbOwed=0,lbPaid=0,lbFees=0;
  lbDB.forEach(r=>{
    const ts=r.stage||r.travelStatus||r.travel_status;
    const pp=r.ppStatus||r.pp_status;
    const notes=(r.notes||'').trim().toUpperCase();
    if(ts==='TRAVELLED'&&pp!=='HAD PP'&&notes!=='RETURNED'){
      const toR=Number(r.toRefund||r.to_refund)||0;
      const paid=(Number(r.r1Amt||r.r1_amt)||0)+(Number(r.r2Amt||r.r2_amt)||0);
      lbOwed+=toR; lbPaid+=paid; lbFees+=paid;
    }
  });

  const lbIncomplete=lbDB.filter(r=>(r.travelStatus||r.travel_status)==='TRAVELLED'&&getRefundStatus(r)==='incomplete').length;
  const totalCandidates=proDB.length+lbDB.length;
  const totalInProcess=proInProcess+lbInProcess;
  const totalTravelled=proTravelled+lbTravelled;
  const companyName=typeof getCompanyName==='function' ? getCompanyName() : DEFAULT_COMPANY.name;
  const firstName=currentUser?.display?.split(' ')[0] || 'John';

  const workspaceEl=document.getElementById('topbar-workspace-name');
  if(workspaceEl) workspaceEl.textContent=companyName;

  const stageColors=['#5A49F8','#3B82F6','#10B981','#F59E0B','#5DD6C4','#FB9A65','#8B5CF6','#DDE2EC'];
  const stageData=[
    {label:'Submitted', value:proDB.filter(r=>r.stage==='SUBMITTED').length, icon:'ti-clipboard-list', color:stageColors[0]},
    {label:'Interview', value:proDB.filter(r=>r.stage==='INTERVIEW').length, icon:'ti-users', color:stageColors[1]},
    {label:'Offer', value:proDB.filter(r=>r.stage==='OFFER LETTER').length, icon:'ti-file-description', color:stageColors[2]},
    {label:'Medical', value:proDB.filter(r=>r.stage==='MEDICAL & ATTESTATION').length, icon:'ti-stethoscope', color:stageColors[3]},
    {label:'MOL', value:proDB.filter(r=>r.stage==='MOL').length, icon:'ti-building-bank', color:stageColors[4]},
    {label:'Visa', value:proDB.filter(r=>r.stage==='VISA').length, icon:'ti-id-badge-2', color:stageColors[5]},
    {label:'Travel', value:proDB.filter(r=>r.stage==='PENDING TRAVEL').length, icon:'ti-plane', color:stageColors[6]},
    {label:'Travelled', value:proTravelled, icon:'ti-plane-departure', color:stageColors[7]}
  ];
  const lbStageData=[
    {label:'Docs In', value:lbDB.filter(r=>(r.stage||r.travelStatus||r.travel_status)==='DOCS SUBMITTED').length, icon:'ti-folder', color:stageColors[0]},
    {label:'Sent', value:lbDB.filter(r=>(r.stage||r.travelStatus||r.travel_status)==='PROFILE SENT').length, icon:'ti-send', color:stageColors[1]},
    {label:'Selected', value:lbDB.filter(r=>(r.stage||r.travelStatus||r.travel_status)==='SELECTED').length, icon:'ti-star', color:stageColors[2]},
    {label:'Passport', value:lbDB.filter(r=>(r.stage||r.travelStatus||r.travel_status)==='PASSPORT APPLIED').length, icon:'ti-passport', color:stageColors[3]},
    {label:'Visa', value:lbDB.filter(r=>(r.stage||r.travelStatus||r.travel_status)==='VISA PROCESSING').length, icon:'ti-id-badge-2', color:stageColors[4]},
    {label:'Travelled', value:lbDB.filter(r=>(r.stage||r.travelStatus||r.travel_status)==='TRAVELLED').length, icon:'ti-plane-departure', color:stageColors[5]},
  ];
  const stageTotal=Math.max(stageData.reduce((sum,item)=>sum+item.value,0),1);

  const pendingTravel=proDB.filter(r=>r.stage==='PENDING TRAVEL');
  const upcoming=(pendingTravel.length?pendingTravel:proDB.filter(r=>r.stage!=='TRAVELLED')).slice(0,3);
  const upcomingHTML=upcoming.length?upcoming.map((r,i)=>`<div class="ref-travel-item">
    <div class="ref-travel-icon"><i class="ti ti-plane"></i></div>
    <div><div class="ref-travel-name">${escHTML(r.name)}</div><div class="ref-travel-meta">${escHTML(r.company||'-')} | ${escHTML(r.position||'-')}</div></div>
    <div class="ref-travel-date">${r.travel?fmtDate(r.travel):'No date'}</div>
  </div>`).join(''):'<div class="ref-empty">No upcoming travels</div>';

  const recentActivity=Object.entries(allTimelines)
    .flatMap(([key,entries])=>(entries||[]).map(e=>({...e,key})))
    .sort((a,b)=>new Date(b.ts)-new Date(a.ts)).slice(0,3);
  function timeAgo(ts){
    if(!ts) return '';
    const diff=Date.now()-new Date(ts).getTime();
    const mins=Math.floor(diff/60000);
    if(mins<60) return `${mins}m ago`;
    const hrs=Math.floor(mins/60);
    if(hrs<24) return `${hrs}h ago`;
    return `${Math.floor(hrs/24)}d ago`;
  }
  const recentHTML=recentActivity.length?recentActivity.map((item)=>{
    const initials=(item.user||'DR').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    return `<div class="ref-activity-item">
    <div class="ref-avatar-mini">${initials}</div>
    <div><div class="ref-activity-name">${escHTML(item.user||'Dreco')}</div><div class="ref-activity-meta">${escHTML(item.action||'Candidate updated')}</div></div>
    <div class="ref-activity-time">${timeAgo(item.ts)}</div>
  </div>`;
  }).join(''):`
    <div class="ref-empty" style="padding:18px;text-align:center;color:var(--text-3);font-size:12px">No activity yet — actions will appear here as candidates are added and updated.</div>`;

  const dash=document.getElementById('dash-section');
  if(!dash) return;
  dash.innerHTML=`
    <div class="ref-dashboard">
      <div class="ref-dashboard-head">
        <div><h1>Good afternoon, ${escHTML(firstName)}</h1><p>Here's what's happening in your workspace today.</p></div>
      </div>

      <div class="ref-board-grid">
        <div class="ref-main-column">
          <div class="ref-kpi-row">
            ${renderRefKpi('Total Candidates',totalCandidates,'All active records','ti-clipboard-list','#EFEAFF','','switchTab(\'pro\')')}
            ${renderRefKpi('In Process',totalInProcess,'Active pipeline','ti-briefcase','#EAF2FF','','switchTab(\'kanban\')')}
            ${renderRefKpi('Travelled',totalTravelled,'Successful placements','ti-plane-departure','#EFEAFF','','openTravelledView()')}
            ${renderRefKpi('Professional Collected','KES '+totalPaid.toLocaleString(),'Revenue collected','ti-coin','#EAFBF3','wide','switchTab(\'reports\')')}
          </div>

          ${renderSmartAlertsHTML()}

          <section class="ref-card ref-pipeline-overview">
            <div class="ref-card-title">Professional Jobs Pipeline <i class="ti ti-info-circle"></i></div>
            <div class="ref-stage-row">
              ${stageData.map((item,i)=>`<div class="ref-stage-box"><div class="ref-stage-icon"><i class="ti ${item.icon}"></i></div><div><div class="ref-stage-label">${item.label}</div><div class="ref-stage-value">${item.value}</div></div><div class="ref-stage-percent">${Math.round(item.value/stageTotal*100)}%</div></div>${i<stageData.length-1?'<i class="ti ti-arrow-right ref-stage-arrow"></i>':''}`).join('')}
            </div>
            <div class="ref-pipe-line"><span style="width:${Math.max(6,Math.round(proInProcess/Math.max(proDB.length,1)*100))}%"></span></div>
            <div class="ref-pipe-foot"><span>${proInProcess} in process</span><span>${proTravelled} travelled</span></div>
          </section>

          <section class="ref-card ref-pipeline-overview">
            <div class="ref-card-title">General Jobs Pipeline <i class="ti ti-info-circle"></i></div>
            <div class="ref-stage-row">
              ${lbStageData.map((item,i)=>`<div class="ref-stage-box"><div class="ref-stage-icon"><i class="ti ${item.icon}"></i></div><div><div class="ref-stage-label">${item.label}</div><div class="ref-stage-value">${item.value}</div></div></div>${i<lbStageData.length-1?'<i class="ti ti-arrow-right ref-stage-arrow"></i>':''}`).join('')}
            </div>
            <div class="ref-pipe-line"><span style="width:${Math.max(6,Math.round(lbInProcess/Math.max(lbDB.length,1)*100))}%"></span></div>
            <div class="ref-pipe-foot"><span>${lbInProcess} in process</span><span>${lbTravelled} travelled</span></div>
          </section>

          <div class="ref-chart-grid">
            <section class="ref-card ref-trend-card">
              <div class="ref-card-head"><div class="ref-card-title">Pipeline Trend</div><button onclick="setTrendPeriod()">This Month <i class="ti ti-chevron-down"></i></button></div>
              <div class="ref-legend"><span><b></b>In Process</span><span><b></b>Travelled</span></div>
              <div class="ref-line-chart" onmousemove="updateTrendTooltip(event)" onmouseleave="resetTrendTooltip()">
                <svg viewBox="0 0 620 210" preserveAspectRatio="none" aria-hidden="true">
                  <defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5A49F8" stop-opacity=".20"/><stop offset="1" stop-color="#5DD6C4" stop-opacity=".04"/></linearGradient></defs>
                  <path d="M0 150 C80 120 95 90 160 86 C235 82 235 112 310 92 C390 70 420 88 480 92 C545 96 570 58 620 42 L620 210 L0 210 Z" fill="url(#trendFill)"/>
                  <path d="M0 150 C80 120 95 90 160 86 C235 82 235 112 310 92 C390 70 420 88 480 92 C545 96 570 58 620 42" fill="none" stroke="#5A49F8" stroke-width="4" stroke-linecap="round"/>
                  <path d="M0 178 C80 160 105 130 170 126 C245 122 255 132 320 116 C398 96 428 118 492 114 C552 110 580 88 620 78" fill="none" stroke="#5DD6C4" stroke-width="4" stroke-linecap="round"/>
                  <line x1="318" y1="52" x2="318" y2="210" stroke="#B9C2D7" stroke-dasharray="4 6"/>
                </svg>
                <div class="ref-tooltip dynamic" id="trend-tooltip"><strong id="trend-tip-date">May 15, 2025</strong><span><b></b>In Process <em id="trend-tip-process">${totalInProcess}</em></span><span><b></b>Travelled <em id="trend-tip-travelled">${totalTravelled}</em></span></div>
                <div class="ref-axis"><span>May 12</span><span>May 13</span><span>May 14</span><span>May 15</span><span>May 16</span><span>May 17</span><span>May 18</span></div>
              </div>
            </section>

            <section class="ref-card ref-breakdown-card">
              <div class="ref-card-title">Stage Breakdown</div>
              <div class="ref-donut-wrap">
                <div class="ref-donut" style="background:${buildConic(stageData.map(x=>({count:x.value,color:x.color})),stageTotal)}"><div><strong>${totalInProcess}</strong><span>In Process</span></div></div>
                <div class="ref-donut-legend">${stageData.map(item=>`<div><span><b style="background:${item.color}"></b>${item.label}</span><strong>${item.value} (${Math.round(item.value/stageTotal*100)}%)</strong></div>`).join('')}</div>
              </div>
            </section>
          </div>

          <div class="ref-bottom-grid">
            <section class="ref-card"><div class="ref-card-title">Recent Activity</div><div class="ref-list">${recentHTML}</div></section>
            <section class="ref-card"><div class="ref-card-head"><div class="ref-card-title">Tasks</div><button onclick="switchTab('kanban')">View All</button></div><div class="ref-task-list">
              ${renderRefTask('Review pending visa documents', `${proDB.filter(r=>r.stage==='PENDING VISA').length} candidates`, 'Overdue')}
              ${renderRefTask('Follow up with MOL for candidates', `${proDB.filter(r=>r.stage==='PENDING MOL').length} candidates`, 'Due today')}
              ${renderRefTask('Confirm travel for candidates', `${pendingTravel.length} candidates`, 'Due tomorrow')}
            </div></section>
          </div>
        </div>

        <aside class="ref-side-column">
          <section class="ref-fin-card">
            <div class="ref-fin-head"><span>Financial Summary</span>${renderFinancePeriodSelect()}</div>
            <div class="ref-fin-block"><p>Professional Jobs</p><h2>KES ${totalComm.toLocaleString()}</h2><div><span>Collected</span><strong>KES ${totalPaid.toLocaleString()}</strong></div><div><span>Outstanding</span><strong>KES ${(totalComm-totalPaid).toLocaleString()}</strong></div></div>
            <div class="ref-fin-block"><p>General Jobs</p><h2>${moneyUSD(lbFees)}</h2><div><span>Collected</span><strong>${moneyUSD(lbPaid)}</strong></div><div><span>Outstanding</span><strong>${moneyUSD(lbOwed-lbPaid)}</strong></div><div><span>Open Balances</span><strong>${lbIncomplete}</strong></div></div>
            <button class="ref-fin-report" onclick="switchTab('reports')"><i class="ti ti-report-money"></i>View Financial Report<i class="ti ti-chevron-right"></i></button>
          </section>
          <section class="ref-card ref-upcoming"><div class="ref-card-head"><div class="ref-card-title">Upcoming Travels</div><button onclick="openPendingTravelView()">View All</button></div>${upcomingHTML}<button class="ref-total-link" onclick="openPendingTravelView()">Total ${pendingTravel.length} upcoming</button></section>
          <section class="ref-card ref-quick"><div class="ref-card-title">Quick Actions</div><div class="ref-quick-grid">
            <button onclick="openQuickAddCandidate()"><i class="ti ti-user-plus"></i>Add Candidate</button>
            <button onclick="createStaffAccount()"><i class="ti ti-user-plus"></i>Add User</button>
            <button onclick="openRecordPaymentPrompt('commission')"><i class="ti ti-report-money"></i>Record Payment</button>
            <button onclick="openFirstDocumentUpload()"><i class="ti ti-file-upload"></i>Upload Document</button>
          </div></section>
        </aside>
      </div>
      <button class="ref-chat-btn"><i class="ti ti-message-circle"></i></button>
    </div>`;
}

function openTravelledView(){
  window.proStagePillFilter='TRAVELLED';
  switchTab('pro');
  if (typeof rebuildProPills === 'function') rebuildProPills();
  if (typeof renderPro === 'function') renderPro();
  if (typeof showToast === 'function') showToast('Showing travelled candidates','success');
}
function openPendingTravelView(){
  window.proStagePillFilter='PENDING TRAVEL';
  switchTab('pro');
  if (typeof rebuildProPills === 'function') rebuildProPills();
  if (typeof renderPro === 'function') renderPro();
  if (typeof showToast === 'function') showToast('Showing candidates pending travel','success');
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
  const travelled=Math.max(0,Math.round((proDB.filter(r=>r.stage==='TRAVELLED').length+lbDB.filter(r=>(r.travelStatus||r.travel_status)==='TRAVELLED').length)*(0.7+pct*.45)));
  document.getElementById('trend-tip-date').textContent=`May ${day}, 2025`;
  document.getElementById('trend-tip-process').textContent=inProcess;
  document.getElementById('trend-tip-travelled').textContent=travelled;
  tip.style.left=`${Math.min(Math.max(event.clientX-rect.left-70,10),rect.width-150)}px`;
  tip.style.top='64px';
  tip.style.display='block';
}
function resetTrendTooltip(){ const tip=document.getElementById('trend-tooltip'); if(tip) tip.style.display=''; }
function persistExpenses(){ safeLocalSet('dreco_expenses', JSON.stringify(drecoExpenses)); }
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
  const oldMol=proDB.filter(r=>r.stage==='PENDING MOL' && drecoDateValue(r.submitted) && now-drecoDateValue(r.submitted)>7*day);
  const oldVisa=proDB.filter(r=>r.stage==='PENDING VISA' && Math.max(drecoDateValue(r.mol),drecoDateValue(r.submitted)) && now-Math.max(drecoDateValue(r.mol),drecoDateValue(r.submitted))>10*day);
  const unpaid=proDB.filter(r=>proBalance(r)>0).sort((a,b)=>proBalance(b)-proBalance(a));
  const travel=proDB.filter(r=>r.stage==='PENDING TRAVEL');
  return [
    {label:'MOL overdue',value:oldMol.length,icon:'ti-clock-exclamation',tone:'warn',target:"switchTab('pro')"},
    {label:'Visa pending too long',value:oldVisa.length,icon:'ti-id-badge-2',tone:'violet',target:"switchTab('pro')"},
    {label:'Unpaid commissions',value:unpaid.length,icon:'ti-cash-banknote',tone:'money',target:"switchTab('commissions')"},
    {label:'Pending travel',value:travel.length,icon:'ti-plane',tone:'blue',target:'openPendingTravelView()'}
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
function setFinancePeriod(value){ financePeriod=value||'month'; renderDash(); }
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
  const pro=proDB.map(r=>({type:'pro',id:r.id,name:r.name,workflow:'Professional Jobs',company:r.company||r.country||'-',status:r.position||r.stage||'-',date:r.travel,travelled:r.stage==='TRAVELLED',airline:r.airline||'Not recorded',time:r.travelTime||'Not recorded',notes:r.travelNotes||getLatestTimelineText('pro',r.id)}));
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
  const rows=[...proDB].sort((a,b)=>latestCommissionTs(b)-latestCommissionTs(a) || proPaidAmount(b)-proPaidAmount(a));
  renderMetricCards('commission-metrics',[{label:'Billed',value:moneyKES(billed),cls:'mc-ink',small:true},{label:'Received',value:moneyKES(paid),cls:'mc-green',small:true},{label:'Outstanding',value:moneyKES(billed-paid),cls:'mc-amber',small:true}]);
  renderTransactionHistory('commission-history', getCommissionTransactions(), moneyKES);
  const tb=document.getElementById('commissions-tbody'); if(!tb) return;
  tb.innerHTML=rows.length?rows.map(r=>{
    const bal=proBalance(r);
    const actions=`<button class="action-link" onclick="event.stopPropagation();openAddPayment(${r.id})" title="Add payment">+ Pay</button>`
      +(bal>0?` <button class="action-link" style="color:var(--green,#22A06B)" onclick="event.stopPropagation();markCommissionCleared(${r.id})" title="Mark fully paid">✓ Cleared</button>`:'');
    return `<tr onclick="editPro(${r.id})"><td class="name-cell">${escHTML(r.name)}</td><td>${escHTML(r.company||'-')}</td><td>${escHTML(r.position||'-')}</td><td>${moneyKES(r.commission)}</td><td>${moneyKES(proPaidAmount(r))}</td><td class="${bal>0?'balance-owed':''}">${moneyKES(bal)}</td><td>${escHTML(getLatestTimelineText('pro',r.id))}</td><td onclick="event.stopPropagation()" style="white-space:nowrap">${actions}</td></tr>`;
  }).join(''):'<tr><td colspan="8"><div class="mini-empty">No commission records yet</div></td></tr>';
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
  const newTotal = alreadyPaid + amount;
  r.paid = newTotal;
  try {
    if (useCloud()) await dbUpdate('pro_candidates', id, { paid: newTotal });
    else saveLocalStore();
    addTimeline('pro', id, `Payment received: ${moneyKES(amount)} on ${date}`);
    auditAction('Finance', 'Commission payment received', `${r.name} — ${moneyKES(amount)}`);
  } catch(e) { r.paid = alreadyPaid; return fail(e.message || 'Save failed.'); }
  closeModal('ap-modal');
  renderCommissions();
  renderDash();
  showToast(`${moneyKES(amount)} recorded`, 'success');
}
async function markCommissionCleared(id) {
  const r = proDB.find(x => x.id === id); if (!r) return;
  const commission = Number(r.commission) || 0;
  if (!commission) { showToast('No commission amount set on this candidate.', 'error'); return; }
  if (!confirm(`Mark ${r.name} as fully paid (${moneyKES(commission)})?`)) return;
  const prev = proPaidAmount(r);
  r.paid = commission;
  try {
    if (useCloud()) await dbUpdate('pro_candidates', id, { paid: commission });
    else saveLocalStore();
    addTimeline('pro', id, `Commission cleared: ${moneyKES(commission)}`);
    auditAction('Finance', 'Commission marked cleared', `${r.name} — ${moneyKES(commission)}`);
  } catch(e) { r.paid = prev; showToast(e.message || 'Save failed.', 'error'); return; }
  renderCommissions();
  renderDash();
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
  grid.innerHTML=list.map(u=>`<div class="team-card"><div class="team-card-head"><div class="team-avatar">${escHTML((u.display||u.username||'U').slice(0,2).toUpperCase())}</div><div><div class="team-name">${escHTML(u.display||u.username||'User')}</div><div class="team-role">${u.role==='admin'?'Administrator':'Staff'} @${escHTML(u.username||'user')}</div></div></div><div class="team-perms"><span>Dashboard</span><span>Professional Jobs</span><span>General Jobs</span><span>Finance</span><span>Reports</span></div></div>`).join('');
}
function renderSettingsPage(){
  const el=document.getElementById('settings-page-content'); if(!el) return;
  const syncCopy=appStorageMode==='cloud'?'Supabase cloud sync is active. Local fallback remains available if a write fails.':'Local mode is active. Configure Supabase to enable shared office sync.';
  el.innerHTML=`<div class="settings-page-card"><h3>Workspace</h3><p>Manage company identity and data mode.</p><div class="setting-row"><span>Company</span><button onclick="openSettingsModal()">Edit</button></div><div class="setting-row"><span>Storage</span><span class="settings-pill">${appStorageMode==='cloud'?'Cloud':'Local'}</span></div></div><div class="settings-page-card"><h3>Pipeline</h3><p>Adjust workflow stages and country options from their respective screens.</p><div class="setting-row"><span>Professional stages</span><button onclick="switchTab('pro')">Open</button></div><div class="setting-row"><span>General countries</span><button onclick="switchTab('lb')">Open</button></div></div><div class="settings-page-card"><h3>Team & permissions</h3><p>Add staff and review roles from the Team page.</p><div class="setting-row"><span>Team members</span><button onclick="switchTab('team')">Manage</button></div></div><div class="settings-page-card"><h3>Data</h3><p>Export backups or reset local filters.</p><div class="setting-row"><span>Backup</span><button onclick="downloadBackup()">Download</button></div><div class="setting-row"><span>Saved filters</span><button onclick="resetSavedFilters()">Reset</button></div></div><div class="settings-page-card"><h3>Sync health</h3><p>${syncCopy}</p><div class="setting-row"><span>Mode</span><span class="settings-pill">${appStorageMode==='cloud'?'Cloud first':'Local fallback'}</span></div><div class="setting-row"><span>Last sync issue</span><span>${escHTML(lastSyncError||'None')}</span></div></div><div class="settings-page-card"><h3>Audit log</h3><p>Recent system activity across candidates, finance, users, and documents.</p>${drecoAudit.slice(0,6).map(a=>`<div class="audit-row"><strong>${escHTML(a.action)}</strong><span>${escHTML(a.area)} - ${fmtDate(a.ts)}</span></div>`).join('')||'<div class="mini-empty">No audited actions yet</div>'}</div>`;
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
  if(password.length<6) return fail('Temporary password must be at least 6 characters.');
  STAFF_ACCOUNTS[username]=normalizeAccount(username,{role,display,companyId:getCompanyId(),companyName:getCompanyName(),generalJobsCountries:getGeneralCountries()});
  try{ await setAccountPassword(STAFF_ACCOUNTS[username],password); await saveStaffAccounts(); }
  catch(e){ delete STAFF_ACCOUNTS[username]; return fail(e.message||'User could not be created.'); }
  closeModal('quick-user-modal'); renderTeam(); renderCompanyUsers(); showToast('User added','success');
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
  sel.innerHTML='<option value="">— select —</option>'+rows.map(r=>`<option value="${r.id}">${escHTML(r.name)}</option>`).join('');
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
    content.innerHTML=`<strong>${escHTML(r.name)}</strong><br>To refund: ${moneyUSD(owed)} &nbsp;|&nbsp; Paid: ${moneyUSD(paid)} &nbsp;|&nbsp; Outstanding: ${moneyUSD(owed-paid)}<br><small>Installment 1: ${r.r1Amt?moneyUSD(r.r1Amt)+' on '+fmtDate(r.r1Date):'—'} &nbsp;|&nbsp; Installment 2: ${r.r2Amt?moneyUSD(r.r2Amt)+' on '+fmtDate(r.r2Date):'—'}</small>`;
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
    const updates={};
    if(!r.paid1){ updates.paid1=amount; r.paid1=amount; }
    else if(!r.paid2){ updates.paid2=amount; r.paid2=amount; }
    else return fail('Both payment slots are filled. Open the candidate to edit.');
    updates.paid=(r.paid1||0)+(r.paid2||0);
    r.paid=updates.paid;
    try{ if(useCloud()) await dbUpdate('pro_candidates',id,updates); else saveLocalStore(); addTimeline('pro',id,`Commission payment: ${moneyKES(amount)}`); auditAction('Finance','Commission payment recorded',`${r.name} - ${moneyKES(amount)}`); }
    catch(e){ return fail(e.message||'Save failed.'); }
  }
  closeModal('quick-payment-modal');
  if(type==='repayment') renderRepayments(); else renderCommissions();
  renderDash();
  showToast('Payment recorded','success');
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
  persistExpenses(); closeModal('quick-expense-modal'); renderExpenses(); showToast('Expense recorded','success');
}
function deleteExpense(id){ if(!requireFinanceAction('Deleting expenses')) return; const item=drecoExpenses.find(e=>e.id===id); drecoExpenses=drecoExpenses.filter(e=>e.id!==id); auditAction('Expenses','Expense deleted',item?.client||''); persistExpenses(); renderExpenses(); }
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
    sel.innerHTML='<option value="">— select —</option>'+all.map(r=>`<option value="${r.type}:${r.id}">${escHTML(r.label)}</option>`).join('');
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
    ?{travel:date,airline,travelTime:time,travelNotes:notes,stage:'PENDING TRAVEL'}
    :{travelDate:date,airline,travelTime:time,notes:notes||r.notes};
  Object.assign(r,updates);
  try{ if(useCloud()) await dbUpdate(table,id,updates); else saveLocalStore(); addTimeline(type,id,`Travel recorded: ${airline||'No airline'} on ${date}`); auditAction('Travel','Travel details saved',`${r.name} - ${date}`); }
  catch(e){ return fail(e.message||'Save failed.'); }
  closeModal('quick-travel-modal');
  renderTravel();
  renderDash();
  showToast('Travel details saved','success');
}
function renderHelpPage(){
  const el=document.getElementById('help-section-content'); if(!el) return;
  el.innerHTML=`<div class="settings-page-card"><h3>Daily workflow</h3><p>Use Dashboard for an overview, Pipeline to move candidates through stages, and Reports for management review.</p><div class="setting-row"><span>Pipeline</span><button onclick="switchTab('pipeline')">Open</button></div></div><div class="settings-page-card"><h3>Records</h3><p>Professional Jobs and General Jobs are separate workflows. Travel combines both lists and sorts latest travel first.</p><div class="setting-row"><span>Professional Jobs</span><button onclick="switchTab('pro')">Open</button></div><div class="setting-row"><span>General Jobs</span><button onclick="switchTab('lb')">Open</button></div></div><div class="settings-page-card"><h3>Finance</h3><p>Commissions focus on professional job income. Repayments only track travelled general-job clients. Expenses capture money spent on clients.</p><div class="setting-row"><span>Commissions</span><button onclick="switchTab('commissions')">Open</button></div><div class="setting-row"><span>Expenses</span><button onclick="switchTab('expenses')">Open</button></div></div><div class="settings-page-card"><h3>Support note</h3><p>For shared multi-user work, keep Supabase configured. Local mode is useful for solo testing, but cloud mode is better for office use.</p><div class="setting-row"><span>Settings</span><button onclick="switchTab('settings')">Open</button></div></div>`;
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
// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
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
      (action==='outstanding'&&outstanding) ||
      (action==='no-docs'&&!hasDocs('pro',r.id));
    let dateMatch=true;
    if(dateFrom||dateTo){
      const sub=toInput(r.submitted);
      if(!sub){ dateMatch=false; }
      else {
        if(dateFrom&&sub<dateFrom) dateMatch=false;
        if(dateTo&&sub>dateTo) dateMatch=false;
      }
    }
    return (!q||text.includes(q))&&(!stage||r.stage===stage)&&(!comp||r.company===comp)&&(!pos||r.position===pos)&&actionMatch&&dateMatch;
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
    <div class="metric-card mc-green"><div class="mc-icon"><i class="ti ti-plane-departure"></i></div><div class="metric-label">Travelled</div><div class="metric-val green">${proDB.filter(r=>r.stage==='TRAVELLED').length}</div></div>
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
      const hd=hasDocs('pro',r.id);
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
        <td onclick="event.stopPropagation()"><button class="action-btn docs dreco-open-docs" data-type="pro" data-id="${r.id}" data-name="${escHTML(r.name)}"><i class="ti ti-paperclip"></i>${hd?' <i class="ti ti-check" style="color:var(--green);font-size:10px"></i>':''}</button></td>
        <td onclick="event.stopPropagation()"><button class="action-btn del" onclick="deletePro(${r.id})"><i class="ti ti-trash"></i></button></td>
      </tr>`;
    }).join('');
  }
  renderPagination('pro-pagination',proPage,totalPages,data.length,'pro');
}

function openProForm(){
  editingProId=null;
  document.getElementById('pro-modal-title').textContent='Add professional candidate';
  ['pf-name','pf-pp','pf-phone','pf-position','pf-company','pf-country','pf-submitted','pf-interview','pf-ol','pf-medical','pf-mol','pf-visa','pf-travel','pf-comm','pf-paid','pf-paid1','pf-paid2']
    .forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  const stEl=document.getElementById('pf-stage'); if(stEl){ stEl.value=proStages[0]||'SUBMITTED'; stEl.dataset.prev=stEl.value; }
  renderProSummary(null);
  document.getElementById('pro-form-timeline').innerHTML='<div class="tl-empty">Save candidate first to see timeline.</div>';
  document.getElementById('pro-tab-details').style.display='';
  ['pipeline','commission','timeline'].forEach(t=>{ const el=document.getElementById(`pro-tab-${t}`); if(el) el.style.display='none'; });
  document.getElementById('pro-modal').querySelectorAll('.modal-tab').forEach((b,i)=>b.classList.toggle('active',i===0));
  document.getElementById('pro-modal').classList.add('open');
}
function editPro(id){
  const r=proDB.find(x=>x.id==id); if(!r) return;
  editingProId=id;
  document.getElementById('pro-modal-title').textContent='Edit - '+r.name;
  document.getElementById('pf-name').value=r.name; document.getElementById('pf-pp').value=r.pp||'';
  document.getElementById('pf-phone').value=r.phone||''; document.getElementById('pf-position').value=r.position||'';
  document.getElementById('pf-company').value=r.company||''; document.getElementById('pf-country').value=r.country||'';
  const stEl=document.getElementById('pf-stage'); if(stEl){ stEl.value=r.stage; stEl.dataset.prev=r.stage; }
  document.getElementById('pf-comm').value=r.commission||'';
  // Split paid: use paid1/paid2 if present, else treat old r.paid as paid1
  const p1=r.paid1!=null?r.paid1:(r.paid!=null&&r.paid2==null?r.paid:0);
  const p2=r.paid2!=null?r.paid2:0;
  const pfp1=document.getElementById('pf-paid1'); if(pfp1) pfp1.value=p1||'';
  const pfp2=document.getElementById('pf-paid2'); if(pfp2) pfp2.value=p2||'';
  const pfp=document.getElementById('pf-paid'); if(pfp) pfp.value=(Number(p1)||0)+(Number(p2)||0)||'';
  document.getElementById('pf-submitted').value=toInput(r.submitted); document.getElementById('pf-interview').value=toInput(r.interview);
  document.getElementById('pf-ol').value=toInput(r.ol);
  const pfMed=document.getElementById('pf-medical'); if(pfMed) pfMed.value=toInput(r.medical);
  document.getElementById('pf-mol').value=toInput(r.mol);
  document.getElementById('pf-visa').value=toInput(r.visa); document.getElementById('pf-travel').value=toInput(r.travel);
  const pfFollowup=document.getElementById('pf-followup'); if(pfFollowup) pfFollowup.value=toInput(r.followUp||r.follow_up);
  renderProSummary(r);
  document.getElementById('pro-form-timeline').innerHTML=renderTimelineHTML('pro',id);
  document.getElementById('pro-tab-details').style.display='';
  ['pipeline','commission','timeline'].forEach(t=>{ const el=document.getElementById(`pro-tab-${t}`); if(el) el.style.display='none'; });
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
    paid1:document.getElementById('pf-paid1')?.value?Number(document.getElementById('pf-paid1').value):null,
    paid2:document.getElementById('pf-paid2')?.value?Number(document.getElementById('pf-paid2').value):null,
    paid:(Number(document.getElementById('pf-paid1')?.value)||0)+(Number(document.getElementById('pf-paid2')?.value)||0)||null,
  };
  const validationError=validateProRecord(rec);
  if(validationError){ showToast(validationError,'error'); return; }
  if(editingProId){
    rec.id=editingProId; const i=proDB.findIndex(x=>x.id==editingProId); proDB[i]={...proDB[i],...rec};
    const changes=recordChanges(oldRec,rec,[['name','Name'],['pp','Passport'],['phone','Phone'],['position','Position'],['company','Company'],['country','Country'],['stage','Stage'],['commission','Commission'],['paid','Paid'],['travel','Travel date']]);
    addTimeline('pro',editingProId,changes.length?`Updated: ${changes.slice(0,4).join('; ')}${changes.length>4?'...':''}`:'Details reviewed');
    auditAction('Professional Jobs','Candidate updated',rec.name);
    showToast('Candidate updated ✓','success');
  } else {
    rec.id=Date.now(); proDB.push(rec);
    addTimeline('pro',rec.id,`Added - Stage: ${newStage}`);
    auditAction('Professional Jobs','Candidate added',rec.name);
    showToast('Candidate added ✓','success');
  }
  editingProId = null;
  closeModal('pro-modal'); renderPro(); renderDash(); await saveProRecord(rec);
}
async function deletePro(id){
  const r=proDB.find(x=>x.id==id);
  if(!confirm(`Delete ${r?r.name:'this candidate'}? Cannot be undone.`)) return;
  proDB=proDB.filter(x=>x.id!=id); auditAction('Professional Jobs','Candidate deleted',r?.name||''); showToast('Deleted','success'); renderPro(); renderDash(); await deleteProRecord(id);
}

// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
// LB JOBS
// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
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
      (action==='incomplete-refund'&&rs==='incomplete') ||
      (action==='no-docs'&&!hasDocs('lb',r.id));
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
      const hd=hasDocs('lb',r.id);
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
        <td onclick="event.stopPropagation()"><button class="action-btn docs dreco-open-docs" data-type="lb" data-id="${r.id}" data-name="${escHTML(r.name)}"><i class="ti ti-paperclip"></i>${hd?' <i class="ti ti-check" style="color:var(--green);font-size:10px"></i>':''}</button></td>
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
  ['lf-name','lf-phone','lf-tdate','lf-torefund','lf-r1date','lf-r1amt','lf-r2date','lf-r2amt','lf-notes','lf-submitted-date','lf-selected-date','lf-passport-date','lf-visa-date']
    .forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('lf-pp').value='APPLIED';
  const ownEl=document.getElementById('lf-own-passport'); if(ownEl) ownEl.checked=false;
  toggleLBOwnPassport(false);
  const stEl=document.getElementById('lf-stage'); if(stEl){ stEl.value=lbStages[0]||'DOCS SUBMITTED'; stEl.dataset.prev=stEl.value; }
  const tvEl=document.getElementById('lf-travel'); if(tvEl){ tvEl.value=lbStages[0]||'DOCS SUBMITTED'; tvEl.dataset.prev=tvEl.value; }
  renderLBSummary(null);
  document.getElementById('lb-form-timeline').innerHTML='<div class="tl-empty">Save candidate first to see timeline.</div>';
  document.getElementById('lb-tab-details').style.display='';
  ['refunds','timeline'].forEach(t=>{ const el=document.getElementById(`lb-tab-${t}`); if(el) el.style.display='none'; });
  document.getElementById('lb-modal').querySelectorAll('.modal-tab').forEach((b,i)=>b.classList.toggle('active',i===0));
  document.getElementById('lb-modal').classList.add('open');
}
function editLB(id){
  const r=lbDB.find(x=>x.id==id); if(!r) return;
  editingLbId=id;
  document.getElementById('lb-modal-title').textContent='Edit - '+r.name;
  document.getElementById('lf-name').value=r.name; document.getElementById('lf-phone').value=r.phone||'';
  document.getElementById('lf-pp').value=r.ppStatus||r.pp_status||'APPLIED';
  const ownPP=!!r.own_passport;
  const ownEl=document.getElementById('lf-own-passport'); if(ownEl) ownEl.checked=ownPP;
  toggleLBOwnPassport(ownPP);
  const lbStageVal=r.stage||r.travelStatus||r.travel_status||lbStages[0]||'DOCS SUBMITTED';
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
  ['refunds','timeline'].forEach(t=>{ const el=document.getElementById(`lb-tab-${t}`); if(el) el.style.display='none'; });
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
  const newTravel=newStageEl?.value||document.getElementById('lf-travel')?.value||lbStages[0];
  const rec={
    company_id:getCompanyId(),
    country:getActiveGeneralCountry(),
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
    showToast('Candidate updated ✓','success');
  } else {
    rec.id=Date.now(); lbDB.push(rec);
    addTimeline('lb',rec.id,`Added - Stage: ${newTravel}${own_passport?' (Own PP)':''}`);
    auditAction('General Jobs','Candidate added',rec.name);
    showToast('Candidate added ✓','success');
  }
  editingLbId = null;
  closeModal('lb-modal'); renderLB(); renderDash(); await saveLBRecord(rec);
}
async function deleteLB(id){
  const r=lbDB.find(x=>x.id==id);
  if(!confirm(`Delete ${r?r.name:'this candidate'}? Cannot be undone.`)) return;
  lbDB=lbDB.filter(x=>x.id!=id); auditAction('General Jobs','Candidate deleted',r?.name||''); showToast('Deleted','success'); renderLB(); renderDash(); await deleteLBRecord(id);
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
      <div class="modal-header"><h2>Record Refund Payment — ${h(r.name)}</h2><button class="modal-close" onclick="closeModal('lb-refund-modal')">×</button></div>
      <div class="modal-body">
        <div style="display:flex;gap:12px;margin-bottom:12px">
          <div style="flex:1;background:#f0fdf4;border-radius:8px;padding:10px 12px;text-align:center"><div style="font-size:11px;color:#16a34a;font-weight:700">Total to Refund</div><div style="font-size:16px;font-weight:800">${moneyUSD(r.toRefund||r.to_refund||0)}</div></div>
          <div style="flex:1;background:#fffbeb;border-radius:8px;padding:10px 12px;text-align:center"><div style="font-size:11px;color:#d97706;font-weight:700">Remaining</div><div style="font-size:16px;font-weight:800">${moneyUSD(owing)}</div></div>
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
  showToast('Payment recorded ✓','success');
  closeModal('lb-refund-modal');
  await saveLBRecord(lbDB[i]);
  renderLB(); renderDash(); renderFinance();
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
  renderLB(); renderDash();
}

// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
// DOCUMENTS
// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
function hasDocs(type,id){ const v=allDocs[`${type}_${id}`]; return typeof v==='string'&&v.trim().length>0; }
function openDocs(type,id,name){
  docsTarget={type,id,name};
  document.getElementById('docs-modal-title').textContent=`Documents - ${name}`;
  let existing=allDocs[`${type}_${id}`]; if(typeof existing!=='string') existing='';
  const input=document.getElementById('docs-link-input');
  const openBtn=document.getElementById('docs-open-btn');
  input.value=existing; openBtn.disabled=!existing.trim(); renderDocChecklist(type,id);
  const dm=document.getElementById('docs-modal');
  // Elevate z-index above any open profile/lb modal (z-index:200) so docs always appears on top
  dm.style.setProperty('z-index','19999','important');
  dm.classList.add('open');
}
function onDocsLinkInput(){ document.getElementById('docs-open-btn').disabled=!document.getElementById('docs-link-input').value.trim(); }
function openCurrentDocLink(){ const v=document.getElementById('docs-link-input').value.trim(); if(v) window.open(v,'_blank'); }
function renderDocChecklist(type,id){
  const el=document.getElementById('docs-checklist'); if(!el) return;
  const record=(type==='pro'?proDB:lbDB).find(r=>String(r.id)===String(id))||{};
  const hasFolder=!!String(allDocs[`${type}_${id}`]||'').trim();
  const items=type==='pro'
    ? [{label:'Passport',done:!!record.pp},{label:'Offer letter',done:!!record.ol},{label:'MOL',done:!!record.mol},{label:'Visa',done:!!record.visa},{label:'Travel ticket',done:!!record.travel},{label:'Drive folder',done:hasFolder}]
    : [{label:'Passport',done:String(record.ppStatus||record.pp_status||'')==='HAD PP'},{label:'Travel details',done:!!(record.travelDate||record.travel_date)},{label:'Repayment record',done:!!(record.r1Amt||record.r1_amt||record.r2Amt||record.r2_amt)},{label:'Drive folder',done:hasFolder}];
  el.innerHTML=`<div class="doc-checklist-title">Document checklist</div><div class="doc-checklist-grid">${items.map(item=>`<span class="doc-check ${item.done?'done':'missing'}"><i class="ti ${item.done?'ti-circle-check':'ti-alert-circle'}"></i>${item.label}</span>`).join('')}</div>`;
}
async function saveDocs(){
  if(!docsTarget) return;
  const {type,id}=docsTarget;
  const link=document.getElementById('docs-link-input').value.trim();
  const dbKey=`${type}_${id}`;
  allDocs[dbKey]=link;
  addTimeline(type,id,link?'Documents link updated':'Documents link removed');
  auditAction('Documents',link?'Documents link updated':'Documents link removed',docsTarget.name||'Candidate');
  docsTarget = null;
  closeModal('docs-modal'); showToast('Documents saved','success');
  if(type==='pro') renderPro(); else renderLB();
  await saveDocsToDB(dbKey,link);
}

// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
// EXPORT CSV
// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
function exportCSV(type){
  let headers,rows,filename,isFiltered=false;
  if(type==='pro'){
    headers=['#','Name','Passport','Phone','Position','Company','Country','Stage','Commission (KES)','Paid (KES)','Balance (KES)','Submitted','Interview','Offer Letter','MOL','Visa','Travel Date'];
    const src=lastProFiltered.length?lastProFiltered:proDB;
    isFiltered=src.length<proDB.length;
    rows=src.map((r,i)=>[i+1,r.name,r.pp||'',r.phone||'',r.position||'',r.company||'',r.country||'',r.stage,
      r.commission||'',r.paid||'',(r.commission&&r.paid)?Number(r.commission)-Number(r.paid):'',
      fmtDate(r.submitted),fmtDate(r.interview),fmtDate(r.ol),fmtDate(r.mol),fmtDate(r.visa),fmtDate(r.travel)]);
    filename=isFiltered?'Dreco_Professional_Filtered':'Dreco_Professional';
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
    filename=isFiltered?'Dreco_General_Filtered':'Dreco_LB';
  }
  const esc=v=>`"${String(v==null?'':v).replace(/"/g,'""')}"`;
  const csv=[headers.map(esc).join(','),...rows.map(r=>r.map(esc).join(','))].join('\n');
  const a=Object.assign(document.createElement('a'),{
    href:URL.createObjectURL(new Blob([csv],{type:'text/csv'})),
    download:`${filename}_${new Date().toISOString().split('T')[0]}.csv`
  });
  a.click(); showToast('Export downloaded','success');
}

// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
// PAGINATION
// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
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

// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
// TOAST
// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
function showToast(msg,type=''){
  const t=document.getElementById('toast'); if(!t) return;
  const icon=type==='error'?'ti-alert-circle':'ti-circle-check';
  t.className='toast '+type;
  t.innerHTML=`<i class="ti ${icon}"></i><span>${msg}</span>`;
  void t.offsetWidth; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2800);
}

// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
// PROFILE DROPDOWN
// *Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â*Â
function toggleProfileDropdown(e) {
  e?.stopPropagation?.();
  const menu = document.getElementById('acct-menu');
  if (!menu) return;
  if (menu.style.display === 'block') { menu.style.display = 'none'; return; }

  const trigger = (e?.currentTarget || e?.target)?.closest?.('.sidebar-account-trigger,.topbar-profile-btn');
  if (trigger) {
    const r = trigger.getBoundingClientRect();
    const w = Math.min(268, window.innerWidth - 20);
    menu.style.width = w + 'px';
    menu.style.left = Math.max(10, Math.min(r.left, window.innerWidth - w - 10)) + 'px';
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
    if (newPw.length < 6) { showMsg('New password must be at least 6 characters.', 'err'); return; }
    if (newPw !== confirmPw) { showMsg('New passwords do not match.', 'err'); return; }
    try {
      await setAccountPassword(STAFF_ACCOUNTS[currentUser.username], newPw);
    } catch (err) {
      showMsg(err.message || 'New password could not be secured.', 'err'); return;
    }
    changed = true;
  }

  if (!changed) { showMsg('No changes to save.', 'err'); return; }
  safeSessionSet('dr_user', JSON.stringify(currentUser));
  await saveStaffAccounts();
  showMsg('Changes saved successfully.', 'ok');
  // clear sensitive fields
  ['pd-current-pw','pd-new-pw','pd-confirm-pw'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  // refresh display
  setUserDisplay(currentUser.display, currentUser.role);
}

function setUserDisplay(display, role) {
  // original fields
  const parts = display.replace(/[^a-zA-Z ]/g, '').trim().split(' ');
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : display.substring(0, 2).toUpperCase();

  ['user-chip','sidebar-user-name'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = display;
  });
  ['topbar-avatar','sidebar-avatar','pd-avatar','suc-avatar'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = initials;
  });
  // suc-name = first name only for card
  const sucName = document.getElementById('suc-name');
  if (sucName) sucName.textContent = display;
  // sidebar role
  const rEl = document.getElementById('sidebar-user-role');
  if (rEl) rEl.textContent = role === 'admin' ? 'Administrator' : 'Staff';
  // pd name + email (shadcn style)
  const pdName = document.getElementById('pd-name');
  if (pdName) pdName.textContent = display;
  const pdRoleText = document.getElementById('pd-role-text');
  if (pdRoleText) pdRoleText.textContent = (currentUser?.username||'user') + '@dreco.app';
  // suc email
  const sucEmail = document.getElementById('suc-email');
  if (sucEmail) sucEmail.textContent = (currentUser?.username||'user') + '@dreco.app';
  // pd avatar (shadcn dropdown)
  const pdAv = document.getElementById('pd-avatar');
  if (pdAv) { pdAv.textContent = initials; pdAv.className = 'dv5-pd-av'; }
  const sucOrg = document.querySelector('.suc-org');
  if (sucOrg) sucOrg.textContent = (currentUser?.username||'user') + '@dreco.app';
  updateWorkspaceLabels();
}













// =========================================================
// DRECO OPERATIONS UI REFRESH
// Keeps Supabase/data/auth/save/edit functions from the original app.
// Replaces the internal rendering shell with Home, Pipeline, Candidates,
// Tasks, Finance, Documents, Reports, Clients, and Settings.
// =========================================================
// =============================================================
// DRECO v5 — Unified UI Layer (replaces all prior render IIFEs)
// =============================================================
// =============================================================
// DRECO v5 — Unified UI Layer
// Clean single IIFE. Replaces both ChatGPT IIFEs.
// Uses: proDB, lbDB, allDocs, allTimelines, currentUser,
//       proBalance, hasDocs, fmtDate, escHTML, exportCSV,
//       openProForm, openLBForm, editPro, editLB, openDocs,
//       switchTab (base), toggleSidebar, toggleProfileDropdown
// =============================================================
(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────
  const TABS    = ['dash','pipeline','candidates','finance','documents','reports','clients','settings'];
  const ALIASES = {
    pro:'candidates', lb:'candidates',
    kanban:'pipeline', travel:'pipeline', tasks:'pipeline',
    calendar:'pipeline',
    commissions:'finance', repayments:'finance', expenses:'finance',
    team:'settings', help:'settings'
  };
  const TITLES = {
    dash:'Home', pipeline:'Pipeline', candidates:'Candidates',
    tasks:'Tasks', finance:'Finance', documents:'Documents',
    reports:'Reports', clients:'Clients', settings:'Settings'
  };
  const ICONS = {
    dash:'ti-home', pipeline:'ti-route', candidates:'ti-users',
    tasks:'ti-checkbox', finance:'ti-coin', documents:'ti-file-description',
    reports:'ti-chart-bar', clients:'ti-building-skyscraper', settings:'ti-settings'
  };

  // ── Global job-type tab (Pro / General) ──────────────────
  let jobTypeTab = 'pro';
  let lbCountryFilter = '';
  function rerenderPage() {
    const renderers = {
      dash: window.renderDash, pipeline: window.renderPipelinePage,
      candidates: window.renderCandidatesPage, finance: window.renderFinancePage,
      documents: window.renderDocumentsPage, reports: window.renderReportsPage,
      clients: window.renderClientsPage,
    };
    for (const [id, fn] of Object.entries(renderers)) {
      const el = document.getElementById(id+'-section');
      if (el && el.style.display !== 'none' && typeof fn === 'function') { fn(); break; }
    }
  }
  window.setJobTypeTab = v => { jobTypeTab = v; candidateStageFilter = ''; lbCountryFilter = ''; rerenderPage(); };
  window.setLbCountry  = v => { lbCountryFilter = v; rerenderPage(); };

  // Shared shadcn-style Pro/General tabs widget
  function jobTypeTabs(suffix='') {
    return `<div class="dv5-job-type-tabs" style="display:flex;align-items:center;gap:0;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;background:#f4f4f5">
      <button class="dv5-jt-tab${jobTypeTab==='pro'?' active':''}" onclick="window.setJobTypeTab('pro')" style="padding:7px 18px;font-size:13px;font-weight:600;border:0;background:${jobTypeTab==='pro'?'#fff':'transparent'};color:${jobTypeTab==='pro'?'#18181b':'#71717a'};cursor:pointer;transition:all .15s;${jobTypeTab==='pro'?'box-shadow:0 1px 3px rgba(0,0,0,.08)':''}">
        <i class="ti ti-briefcase" style="margin-right:5px;font-size:12px"></i>Professional
      </button>
      <button class="dv5-jt-tab${jobTypeTab==='lb'?' active':''}" onclick="window.setJobTypeTab('lb')" style="padding:7px 18px;font-size:13px;font-weight:600;border:0;background:${jobTypeTab==='lb'?'#fff':'transparent'};color:${jobTypeTab==='lb'?'#18181b':'#71717a'};cursor:pointer;transition:all .15s;${jobTypeTab==='lb'?'box-shadow:0 1px 3px rgba(0,0,0,.08)':''}">
        <i class="ti ti-globe" style="margin-right:5px;font-size:12px"></i>General Jobs
      </button>
    </div>`;
  }

  // Country sub-filter for General Jobs
  function lbCountryBar(rows) {
    const countries = [...new Set(rows.map(r=>r.country).filter(Boolean))].sort();
    if (countries.length < 2) return '';
    return `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:10px">
      <span style="font-size:11px;font-weight:600;color:#71717a;letter-spacing:.04em">DESTINATION:</span>
      <button onclick="window.setLbCountry('')" style="font-size:11px;padding:3px 10px;border-radius:999px;border:1px solid ${!lbCountryFilter?'#5347CE':'#e4e4e7'};background:${!lbCountryFilter?'#5347CE':'transparent'};color:${!lbCountryFilter?'#fff':'#71717a'};cursor:pointer;font-weight:600">All</button>
      ${countries.map(c=>`<button onclick="window.setLbCountry('${js(c)}')" style="font-size:11px;padding:3px 10px;border-radius:999px;border:1px solid ${lbCountryFilter===c?'#5347CE':'#e4e4e7'};background:${lbCountryFilter===c?'#5347CE':'transparent'};color:${lbCountryFilter===c?'#fff':'#71717a'};cursor:pointer;font-weight:600">${h(c)}</button>`).join('')}
    </div>`;
  }

  // ── Micro-helpers ─────────────────────────────────────────
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));
  const h = (v='') => String(v ?? '').replace(/[&<>"']/g, m =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const js = (v='') => String(v ?? '').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,' ');
  const ini = (name='DR') => String(name||'DR').replace(/[^a-zA-Z ]/g,'').trim()
    .split(/\s+/).filter(Boolean).map(x=>x[0]).join('').slice(0,2).toUpperCase() || 'DR';
  const money = n => 'KES ' + (Number(n)||0).toLocaleString();
  const moneyUSD = n => '$' + (Number(n)||0).toLocaleString();
  const fmt = v => (typeof fmtDate === 'function' ? fmtDate(v) : (v || '—'));
  const co  = () => (typeof getCompanyName === 'function' ? getCompanyName() : DEFAULT_COMPANY.name);
  const fname = () => String(currentUser?.display || 'John').split(' ')[0] || 'John';
  const avatar = name => `<div class="dv5-avatar">${h(ini(name))}</div>`;
  const docKey  = r => `${r.type}_${r.id}`;
  const docLink = r => allDocs?.[docKey(r)] || '';
  const hasDoc  = r => {
    if (!!String(docLink(r)||'').trim()) return true;
    if (r.type === 'lb') {
      const id = r.id;
      return !!(allDocs?.[`lb_${id}_id`]||allDocs?.[`lb_${id}_birth`]||allDocs?.[`lb_${id}_photo`]||allDocs?.[`lb_${id}_passport`]||docTicks?.[`lb_${id}_National ID`]||docTicks?.[`lb_${id}_Photo`]);
    }
    return false;
  };
  const safeUrl = u => /^https?:\/\//i.test(String(u||'')) ? u : '';
  const balPro  = r => (typeof proBalance === 'function') ? proBalance(r) : Math.max((Number(r.commission)||0)-(Number(r.paid)||0),0);
  const LB_TRAVELLED_STAGES = new Set(['TRAVELLED','REFUND PENDING','REFUND COMPLETE']);
  const lbHasTravelled = r => LB_TRAVELLED_STAGES.has(String(r.stage||r.travelStatus||r.travel_status||'').toUpperCase());
  const balLB = r => {
    if (lbOwnPassport(r) || lbRefundReturned(r)) return 0; // no refund owed
    if (!lbHasTravelled(r)) return 0; // hasn't travelled yet — not a debt
    return lbRefundOutstanding(r);
  };

  function stageColor(stage) {
    const s = String(stage||'').toUpperCase();
    if (s==='TRAVELLED') return 'green';
    if (s==='REFUND COMPLETE') return 'green';
    if (s.includes('VISA')) return 'blue';
    if (s.includes('MOL')||s.includes('OFFER')) return 'amber';
    if (s.includes('TRAVEL')||s==='PASSPORT APPLIED') return 'purple';
    if (s==='SELECTED') return 'blue';
    if (s==='PROFILE SENT') return 'amber';
    if (s==='REFUND PENDING') return 'red';
    if (s==='DOCS SUBMITTED'||s==='SUBMITTED') return 'gray';
    if (s==='NOT YET') return 'red';
    return 'gray';
  }
  function badge(stage) {
    return `<span class="dv5-badge ${stageColor(stage)}">${h(String(stage||'Not set').replace('PENDING ',''))}</span>`;
  }

  // ── Greeting with time-of-day ─────────────────────────────
  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  // ── Unified candidate row normaliser ──────────────────────
  function allRows() {
    const pro = (Array.isArray(proDB) ? proDB : []).map(r => {
      const paid1=Number(r.paid1)||0;
      const paid2=Number(r.paid2)||0;
      const paid=proPaidAmount(r);
      return {
        type:'pro', id:r.id, name:r.name||'—', pp:r.pp||'', phone:r.phone||'',
        position:r.position||'—', company:r.company||'—', country:r.country||'—',
        stage:proStageValue(r), submitted:r.submitted, interview:r.interview,
        ol:r.ol, medical:r.medical||null, mol:r.mol, visa:r.visa, travel:r.travel,
        owner:r.owner||currentUser?.display||'Team',
        commission:Number(r.commission)||0,
        paid1, paid2, paid,
        balance:proBalance(r),
        currency:'KES', raw:r,
        followUp:r.followUp||null,
      };
    });
    const lb = (Array.isArray(lbDB) ? lbDB : []).map(r => {
      const r1Amt = Number(r.r1Amt||r.r1_amt)||0;
      const r2Amt = Number(r.r2Amt||r.r2_amt)||0;
      return {
        type:'lb', id:r.id, name:r.name||'—', pp:r.pp||r.passport||'', phone:r.phone||'',
        position: r.country || 'General Job',
        company:r.company||r.country||'—',
        country:r.country||(typeof getActiveGeneralCountry==='function'?getActiveGeneralCountry():'—')||'—',
        stage:lbStageValue(r),
        submitted:r.submitted_date||r.submitted||null,
        travelDate:r.travelDate||r.travel_date||null,
        interview:null, mol:null, visa:null,
        travel:r.travelDate||r.travel_date||null,
        own_passport:lbOwnPassport(r),
        owner:currentUser?.display||'Team',
        commission:lbRefundPrincipal(r),
        r1Amt, r2Amt,
        r1Date:r.r1Date||r.r1_date||null,
        r2Date:r.r2Date||r.r2_date||null,
        refundPayments:Array.isArray(r.refundPayments)?r.refundPayments:[],
        paid: lbRefundPaidAmount(r),
        balance:balLB(r), currency:'USD', raw:r,
        followUp:r.followUp||null,
      };
    });
    return [...pro, ...lb];
  }

  // ── Client aggregation from existing candidate data ───────
  function buildClients() {
    const map = new Map();
    allRows().forEach(r => {
      const name = r.company || 'Unassigned';
      const c = map.get(name) || {
        name, country: r.country||'—', active:0, total:0,
        due:0, paid:0, manager: currentUser?.display||'Team'
      };
      c.total++;
      if (r.stage !== 'TRAVELLED' && r.stage !== 'NOT YET') c.active++;
      c.due   += r.balance;
      c.paid  += r.paid;
      map.set(name, c);
    });
    return [...map.values()].sort((a,b) => b.total - a.total);
  }

  // ── Auto task builder from real data ──────────────────────
  let dismissedAutoTasks = new Set(JSON.parse(localStorage.getItem('dreco_dismissed_tasks')||'[]'));
  let manualTasks = JSON.parse(localStorage.getItem('dreco_manual_tasks')||'[]');
  function saveDismissedTasks() { localStorage.setItem('dreco_dismissed_tasks', JSON.stringify([...dismissedAutoTasks])); }
  function saveManualTasks() { localStorage.setItem('dreco_manual_tasks', JSON.stringify(manualTasks)); }
  window.dismissTask = key => { dismissedAutoTasks.add(key); saveDismissedTasks(); renderTasks(); };
  window.dismissManualTask = idx => { manualTasks.splice(idx,1); saveManualTasks(); renderTasks(); };
  window.addManualTask = () => {
    const title = (document.getElementById('new-task-title')?.value||'').trim();
    const due = document.getElementById('new-task-due')?.value||'';
    if (!title) { showToast('Task title required','error'); return; }
    manualTasks.push({title, due, created: new Date().toISOString()});
    saveManualTasks(); renderTasks();
  };

  function buildTasks() {
    const today = new Date(); today.setHours(0,0,0,0);
    const auto = [];
    allRows().forEach(r => {
      const edit = r.type==='pro' ? `editPro(${r.id})` : `editLB(${r.id})`;
      const docs = `openDocs('${r.type}',${JSON.stringify(r.id)},'${js(r.name)}')`;
      const balStr = r.currency==='USD' ? moneyUSD(r.balance) : money(r.balance);
      const meta = `${r.company||r.country||'—'}`;
      auto.push(...[
        !hasDoc(r)                    && {key:`doc_${r.type}_${r.id}`,    priority:'High',   label:'High', title:`Upload documents — ${r.name}`,     meta, action:docs, icon:'ti-folder-x'},
        r.balance>0                   && {key:`bal_${r.type}_${r.id}`,    priority:'High',   label:'High', title:r.type==='pro'?`Collect commission — ${r.name}`:`Process refund — ${r.name}`, meta:`Balance ${balStr}`, action:edit, icon:'ti-coin'},
        r.type==='pro'&&String(r.stage).toUpperCase()==='MOL'             && {key:`mol_${r.id}`,  priority:'Medium', label:'Med', title:`MOL submission — ${r.name}`, meta, action:edit, icon:'ti-file-check'},
        r.type==='pro'&&String(r.stage).toUpperCase()==='VISA'            && {key:`visa_${r.id}`, priority:'Medium', label:'Med', title:`Visa follow-up — ${r.name}`, meta, action:edit, icon:'ti-id-badge-2'},
        r.type==='pro'&&String(r.stage).toUpperCase()==='PENDING TRAVEL'  && {key:`tkt_${r.id}`,  priority:'High',   label:'High', title:`Book ticket — ${r.name}`, meta, action:edit, icon:'ti-plane-departure'},
        r.type==='lb'&&r.stage==='SELECTED'                               && {key:`pp_${r.id}`,   priority:'High',   label:'High', title:`Apply passport — ${r.name}`, meta, action:edit, icon:'ti-passport'},
        r.type==='lb'&&r.stage==='REFUND PENDING'                         && {key:`ref_${r.id}`,  priority:'Medium', label:'Med', title:`Refund pending — ${r.name}`, meta:`${balStr} to refund`, action:edit, icon:'ti-credit-card'},
      ].filter(Boolean));
      if (r.followUp) {
        const fu = new Date(r.followUp); fu.setHours(0,0,0,0);
        if (fu <= today) auto.push({key:`fu_${r.type}_${r.id}`, priority:'High', label:'Overdue', title:`Follow up — ${r.name}`, meta:`Due ${fmt(r.followUp)}`, action:edit, icon:'ti-calendar-event'});
        else if ((fu-today)/86400000 <= 3) auto.push({key:`fu_${r.type}_${r.id}`, priority:'Medium', label:'Soon', title:`Follow up — ${r.name}`, meta:`Due ${fmt(r.followUp)}`, action:edit, icon:'ti-calendar-event'});
      }
    });
    return auto.filter(t => !dismissedAutoTasks.has(t.key));
  }

  // ── Next-action label per candidate ───────────────────────
  function nextAction(r) {
    if (!hasDoc(r))                               return 'Upload documents';
    if (r.balance > 0)                             return 'Collect commission';
    const s = String(r.stage||'').toUpperCase();
    if (s.includes('OFFER'))  return 'Submit offer letter';
    if (s.includes('MOL'))    return 'MOL submission';
    if (s.includes('VISA'))   return 'Visa stamping';
    if (s.includes('TRAVEL')) return 'Book ticket';
    if (s === 'TRAVELLED')    return 'Post-arrival follow up';
    return '—';
  }

  // ── Checklist per candidate profile ───────────────────────
  function buildChecklist(r) {
    const s = String(r.stage||'').toUpperCase();
    if (r.type === 'lb') {
      const id = r.id;
      return [
        {label:'National ID',       done: !!(allDocs?.[`lb_${id}_id`]       || docTicks?.[`lb_${id}_National ID`]),  action:'tick'},
        {label:'Birth Certificate', done: !!(allDocs?.[`lb_${id}_birth`]     || docTicks?.[`lb_${id}_Birth Certificate`]), action:'tick'},
        {label:'Parent ID',         done: !!(allDocs?.[`lb_${id}_parent_id`] || docTicks?.[`lb_${id}_Parent ID`]),   action:'tick'},
        {label:'Photo',             done: !!(allDocs?.[`lb_${id}_photo`]     || docTicks?.[`lb_${id}_Photo`]),       action:'tick'},
        {label:'Passport Copy',     done: !!(allDocs?.[`lb_${id}_passport`]  || docTicks?.[`lb_${id}_Passport Copy`]), action:'tick'},
        {label:'Profile Sent',      done: ['PROFILE SENT','SELECTED','PASSPORT APPLIED','VISA PROCESSING','TRAVELLED','REFUND PENDING','REFUND COMPLETE'].includes(s), action:'stage'},
        {label:'Selected',          done: ['SELECTED','PASSPORT APPLIED','VISA PROCESSING','TRAVELLED','REFUND PENDING','REFUND COMPLETE'].includes(s), action:'stage'},
        {label:'Passport Applied',  done: ['PASSPORT APPLIED','VISA PROCESSING','TRAVELLED','REFUND PENDING','REFUND COMPLETE'].includes(s), action:'stage'},
        {label:'Visa Processing',   done: ['VISA PROCESSING','TRAVELLED','REFUND PENDING','REFUND COMPLETE'].includes(s), action:'stage'},
        {label:'Travelled',         done: ['TRAVELLED','REFUND PENDING','REFUND COMPLETE'].includes(s), action:'stage'},
        {label:'Refund processed',  done: s==='REFUND COMPLETE' || r.own_passport, action: r.own_passport ? null : 'edit'},
      ];
    }
    const proStageOrder = ['SUBMITTED','INTERVIEW','OFFER LETTER','MEDICAL & ATTESTATION','MOL','VISA','PENDING TRAVEL','TRAVELLED'];
    const idx = proStageOrder.indexOf(s);
    return [
      {label:'Documents uploaded',   done: hasDoc(r),                                                          action:'docs'},
      {label:'Interview done',       done: idx >= proStageOrder.indexOf('INTERVIEW'),                          action:'stage'},
      {label:'Offer letter received',done: !!r.raw?.ol || idx >= proStageOrder.indexOf('OFFER LETTER'),       action:'stage'},
      {label:'Medical cleared',      done: !!r.raw?.medical || idx >= proStageOrder.indexOf('MEDICAL & ATTESTATION'), action:'stage'},
      {label:'MOL submitted',        done: !!r.raw?.mol || idx >= proStageOrder.indexOf('MOL'),               action:'stage'},
      {label:'Visa stamped',         done: !!r.raw?.visa || idx >= proStageOrder.indexOf('VISA'),             action:'stage'},
      {label:'Ticket booked',        done: !!r.travel || s==='TRAVELLED',                                     action:'stage'},
      {label:'Commission collected', done: r.balance === 0 && r.commission > 0,                               action:'edit'},
    ];
  }
  function checklistPct(r) {
    const cl = buildChecklist(r);
    return Math.round(cl.filter(x=>x.done).length / cl.length * 100);
  }

  // ── Chart helpers ─────────────────────────────────────────
  function buildBarChart(rows) {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: d.toLocaleString('default',{month:'short'}), key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, count:0 });
    }
    rows.forEach(r => {
      if (String(r.stage).toUpperCase() !== 'TRAVELLED') return;
      const d = r.date ? new Date(r.date) : null; if (!d || isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const m = months.find(x => x.key === key); if (m) m.count++;
    });
    const max = Math.max(...months.map(m => m.count), 1);
    return `<div style="display:flex;align-items:flex-end;gap:6px;height:140px;padding:0 0 4px">
      ${months.map(b => {
        const pct = Math.max(Math.round((b.count/max)*100), b.count>0?6:2);
        return `<div class="dv5-bar-col" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end;position:relative">
          <div class="dv5-bar-tip" style="position:absolute;bottom:calc(${pct}% + 10px);left:50%;transform:translateX(-50%);background:#18191B;color:#fff;font-size:10px;font-weight:800;padding:3px 7px;border-radius:6px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .12s;z-index:10">${b.count} placed</div>
          <div style="width:100%;border-radius:5px 5px 3px 3px;background:linear-gradient(180deg,#5347CE 0%,#9B8CFF 100%);height:${pct}%;min-height:3px;transition:height .4s cubic-bezier(.4,0,.2,1),opacity .12s;cursor:default" onmouseenter="this.previousElementSibling.style.opacity=1;this.style.opacity=.7" onmouseleave="this.previousElementSibling.style.opacity=0;this.style.opacity=1"></div>
          <span style="font-size:10px;color:var(--text-3,#999);font-weight:700">${h(b.label)}</span>
        </div>`;
      }).join('')}
    </div>`;
  }

  function buildFunnelChart(flowSteps) {
    const max = Math.max(...flowSteps.map(([,v]) => v), 1);
    const colors = ['#5347CE','#6B5FDB','#8370E8','#9B82F4','#B39CFF','#CABFFF'];
    return `<div style="display:flex;flex-direction:column;gap:8px;padding:8px 0;justify-content:center;height:100%">
      ${flowSteps.map(([label,val],i) => {
        const pct = Math.max(Math.round((val/max)*100), val>0?4:1);
        return `<div style="display:flex;align-items:center;gap:10px;position:relative" class="dv5-funnel-row">
          <span style="font-size:10px;font-weight:700;color:var(--text-3,#999);width:56px;flex-shrink:0;text-align:right">${h(label)}</span>
          <div style="flex:1;height:18px;background:var(--bg,#F3F3F3);border-radius:4px;overflow:hidden;position:relative" onmouseenter="this.nextElementSibling.style.opacity=1" onmouseleave="this.nextElementSibling.style.opacity=0">
            <div style="width:${pct}%;height:100%;background:${colors[i]||colors[5]};border-radius:4px;transition:width .5s cubic-bezier(.4,0,.2,1)"></div>
          </div>
          <span style="font-size:11px;font-weight:800;color:var(--text,#18191B);width:22px;text-align:right;flex-shrink:0">${h(String(val))}</span>
          <div style="position:absolute;right:30px;top:-26px;background:#18191B;color:#fff;font-size:10px;font-weight:700;padding:3px 7px;border-radius:6px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .12s;z-index:10">${h(label)}: ${h(String(val))}</div>
        </div>`;
      }).join('')}
    </div>`;
  }

  // ── KPI card helper ───────────────────────────────────────
  function kpi(label, value, note, icon, action='', color='purple', trend='') {
    const click = action ? `onclick="${action}"` : '';
    const clickable = action ? 'style="cursor:pointer"' : '';
    let trendHtml = '';
    if (trend) {
      const up = trend.startsWith('+');
      const trendColor = up ? '#059669' : '#E11D48';
      const trendBg = up ? '#ECFDF5' : '#FFF1F2';
      const trendIcon = up ? 'ti-trending-up' : 'ti-trending-down';
      trendHtml = `<span class="dv5-kpi-trend" style="display:inline-flex;align-items:center;gap:3px;margin-top:6px;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:800;background:${trendBg};color:${trendColor}"><i class="ti ${trendIcon}" style="font-size:10px"></i>${h(trend)}</span>`;
    }
    return `<div class="dv5-kpi" ${click} ${clickable}>
      <div class="dv5-kpi-icon ${color||'purple'}"><i class="ti ${h(icon)}"></i></div>
      <div class="dv5-kpi-val">${h(String(value))}</div>
      <div class="dv5-kpi-label">${h(label)}</div>
      <div class="dv5-kpi-note">${h(note)}</div>
      ${trendHtml}
    </div>`;
  }

  // ── Colored stat card (shadcn hotel style) ───────────────
  // bgColor: CSS color string for card background
  // iconBg: CSS color string for icon square background
  function statCard(icon, value, label, sub, bgColor, iconBg, iconColor, action='') {
    const click = action ? `onclick="${action}"` : '';
    const cursor = action ? 'cursor:pointer' : 'cursor:default';
    return `<div class="dv5-stat-card" style="background:${bgColor};${cursor}" ${click}>
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="dv5-stat-icon" style="background:${iconBg};color:${iconColor}"><i class="ti ${h(icon)}"></i></div>
        <i class="ti ti-dots-vertical" style="font-size:15px;color:${iconColor};opacity:.5"></i>
      </div>
      <div class="dv5-stat-val">${h(String(value))}</div>
      <div class="dv5-stat-label">${h(label)}</div>
      <div class="dv5-stat-sub">${h(sub)}</div>
    </div>`;
  }

  // ── File manager card (shadcn file manager) ───────────────
  function fileCard(icon, iconColor, barColor, label, count, total, caption, action='') {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const click = action ? `onclick="${action}"` : '';
    return `<div class="dv5-file-card" ${click}>
      <div class="dv5-file-card-head">
        <span class="dv5-file-card-label">${h(label)}</span>
        <i class="ti ${h(icon)}" style="font-size:18px;color:${iconColor}"></i>
      </div>
      <div class="dv5-file-count">${h(String(count))}</div>
      <div class="dv5-file-bar-wrap">
        <div class="dv5-file-bar" style="width:${pct}%;background:${barColor}"></div>
      </div>
      <div class="dv5-file-foot">
        <span>${h(caption)}</span>
        <span>${pct}%</span>
      </div>
      <div class="dv5-file-link">View more <i class="ti ti-arrow-right" style="font-size:11px"></i></div>
    </div>`;
  }

  // ── Priority card helper ──────────────────────────────────
  function priority(icon, num, label, note, color, action='') {
    const click = action ? `onclick="${action}"` : '';
    return `<div class="dv5-priority" ${click}>
      <div class="dv5-priority-icon" style="background:${color}"><i class="ti ${h(icon)}"></i></div>
      <strong>${h(String(num))}</strong>
      <span>${h(label)}</span>
      <small>${h(note)}</small>
    </div>`;
  }

  // ── Task row helper ───────────────────────────────────────
  function taskRow(t, idx) {
    const isManual = t.manual;
    const iconClass = t.priority==='High'||t.label==='Overdue' ? 'high' : 'med';
    const pillClass = t.priority==='High'||t.label==='Overdue' ? 'red' : 'amber';
    const dismiss = isManual
      ? `<button class="dv5-action-btn" onclick="event.stopPropagation();dismissManualTask(${idx})" style="margin-left:6px" title="Dismiss"><i class="ti ti-x"></i></button>`
      : `<button class="dv5-action-btn" onclick="event.stopPropagation();dismissTask('${t.key}')" style="margin-left:6px" title="Dismiss"><i class="ti ti-x"></i></button>`;
    return `<div class="dv5-task-item" onclick="${isManual?'':t.action}" style="${isManual?'':'cursor:pointer'}">
      <div class="dv5-task-icon ${iconClass}"><i class="ti ${h(t.icon||'ti-checkbox')}"></i></div>
      <div class="dv5-task-body">
        <div class="dv5-task-title">${h(t.title)}</div>
        <div class="dv5-task-meta">${h(t.meta||'Manual task')}</div>
      </div>
      <span class="dv5-pill ${pillClass}">${h(t.label||'Todo')}</span>
      ${dismiss}
    </div>`;
  }

  // ── Trend bar chart (cash flow visual) ───────────────────
  function cashFlowBars() {
    // Use real paid data per month if available; otherwise use stored trend
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const now = new Date();
    const bars = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      const monthLabel = months[d.getMonth()];
      // Try to find any paid amounts from this month's timelines
      const monthStr = d.toISOString().slice(0,7);
      let paid = 0;
      (Array.isArray(proDB)?proDB:[]).forEach(r => {
        // Use timeline entries to approximate - fallback to 0
        (allTimelines?.[`pro_${r.id}`]||[]).forEach(e => {
          if (String(e.ts||'').startsWith(monthStr) && String(e.action||'').toLowerCase().includes('paid')) {
            paid += Number(r.paid)||0;
          }
        });
      });
      bars.push({label:monthLabel, height:paid>0 ? Math.min(Math.round(paid/1000),100) : 0});
    }
    return bars.map(b => `<div class="dv5-bar-wrap"><div class="dv5-bar" style="height:${b.height}%"></div><span>${h(b.label)}</span></div>`).join('');
  }

  // ── Recent activity from timelines ───────────────────────
  function recentActivity(limit=6) {
    const entries = Object.entries(allTimelines||{})
      .flatMap(([key,arr]) => (arr||[]).map(e => ({...e, key})))
      .filter(e => e.ts || e.at)
      .sort((a,b) => new Date(b.ts||b.at||0) - new Date(a.ts||a.at||0))
      .slice(0, limit);
    if (!entries.length)
      return `<div class="dv5-empty">Activity appears here as candidates are updated, paid, and moved through stages.</div>`;
    return entries.map(e => `
      <div class="dv5-activity-item">
        <div class="dv5-activity-icon"><i class="ti ti-history"></i></div>
        <div>
          <div class="dv5-activity-title">${h(e.action||e.text||'Candidate updated')}</div>
          <div class="dv5-activity-meta">by ${h(e.user||'Dreco')} · ${h(fmt(e.ts||e.at||''))}</div>
        </div>
      </div>`).join('');
  }

  // ── Ensure section divs exist in content area ─────────────
  function ensureSections() {
    const area = document.querySelector('.content-area');
    if (!area) return;
    TABS.forEach(t => {
      if (!document.getElementById(`${t}-section`)) {
        const div = document.createElement('div');
        div.id = `${t}-section`;
        div.style.display = 'none';
        div.className = 'dv5-section';
        area.appendChild(div);
      }
    });
  }

  // ── Sidebar rebuild ───────────────────────────────────────
  let sidebarBuilt = false;
  function buildSidebar() {
    if (sidebarBuilt) return;
    const side = document.querySelector('#app .sidebar');
    if (!side) return;
    const navItem = t => `<a class="nav-item" id="nav-${t}" onclick="switchTab('${t}')" title="${h(TITLES[t])}">
      <i class="ti ${h(ICONS[t])}" style="font-size:15px;width:16px;flex-shrink:0"></i>
      <span class="nav-item-label" style="font-size:12.5px;font-weight:500;letter-spacing:0">${h(TITLES[t])}</span>
    </a>`;
    const wsInitials = (getCompanyName()||'DR').split(/\s+/).filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase()||'DR';
    side.innerHTML = `
      <div class="sidebar-top">
        <a class="sidebar-logo" onclick="switchTab('dash')" aria-label="Dreco home">
          <div class="sidebar-logo-mark">
            <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 6C3 4.343 4.343 3 6 3h4c1.657 0 3 1.343 3 3v4c0 1.657-1.343 3-3 3H6c-1.657 0-3-1.343-3-3V6Z"/>
              <path d="M14 14c0-1.105.895-2 2-2h4c1.105 0 2 .895 2 2v6c0 1.105-.895 2-2 2h-4c-1.105 0-2-.895-2-2v-6Z" opacity=".55"/>
              <path d="M3 17c0-1.105.895-2 2-2h3c1.105 0 2 .895 2 2v2c0 1.105-.895 2-2 2H5c-1.105 0-2-.895-2-2v-2Z" opacity=".32"/>
            </svg>
          </div>
          <span class="sidebar-logo-text">DRECO</span>
        </a>
        <button class="sidebar-toggle" onclick="toggleSidebar()" type="button" aria-label="Toggle sidebar">
          <i class="ti ti-chevrons-left"></i>
        </button>
      </div>
      <div class="sidebar-divider"></div>
      <div class="sidebar-search-bar" role="button" tabindex="0" onclick="document.querySelector('#cmd-modal')&&openCmd()">
        <i class="ti ti-search"></i><span>Search...</span><kbd>⌘K</kbd>
      </div>
      <div class="nav-section-label" style="font-size:10px;letter-spacing:.08em;font-weight:700;text-transform:uppercase;opacity:.5;margin:12px 0 2px 10px;padding:0">Workspace</div>
      ${['dash','pipeline','candidates'].map(navItem).join('')}
      <div class="nav-section-label" style="font-size:10px;letter-spacing:.08em;font-weight:700;text-transform:uppercase;opacity:.5;margin:12px 0 2px 10px;padding:0">Operations</div>
      ${['finance','documents','reports','clients'].map(navItem).join('')}
      <div class="nav-section-label" style="font-size:10px;letter-spacing:.08em;font-weight:700;text-transform:uppercase;opacity:.5;margin:12px 0 2px 10px;padding:0">System</div>
      ${navItem('settings')}
      <div class="nav-spacer"></div>
      <div class="sidebar-workspace-badge" onclick="switchTab('settings')" role="button" tabindex="0" style="margin-bottom:6px">
        <div class="sidebar-ws-av" id="sidebar-ws-av">${wsInitials}</div>
        <div class="sidebar-ws-info">
          <div class="sidebar-ws-name" id="sidebar-ws-name">${h(getCompanyName()||'Workspace')}</div>
          <div class="sidebar-ws-sub">Settings</div>
        </div>
        <i class="ti ti-settings" style="font-size:15px;color:#9CA3AF;margin-left:auto;flex-shrink:0"></i>
      </div>
      <button class="sidebar-user-card sidebar-account-trigger dv5-suc" type="button">
        <div class="dv5-suc-av" id="suc-avatar">${h(ini(currentUser?.display))}</div>
        <div class="dv5-suc-body suc-info">
          <div class="dv5-suc-name suc-name" id="suc-name">${h(currentUser?.display||'User')}</div>
          <div class="dv5-suc-email suc-org" id="suc-email">${h(currentUser?.username ? currentUser.username+'@dreco.app' : co())}</div>
        </div>
        <i class="ti ti-dots-vertical suc-dots" style="color:#9CA3AF;font-size:16px;margin-left:auto;flex-shrink:0"></i>
      </button>`;
    sidebarBuilt = true;
    bindAccountMenuTriggers(side);
  }

  function markActive(t) {
    $$('#app .nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`nav-${t}`)?.classList.add('active');
    const title = document.getElementById('topbar-title');
    if (title) title.textContent = TITLES[t] || 'Dreco';
  }

  // switchTab is now handled by the base function declaration.
  // window.renderXPage aliases are set below so the base router can call them.

  // ══════════════════════════════════════════════════════════
  // SECTION RENDERERS
  // ══════════════════════════════════════════════════════════

  // ── 1. DASHBOARD ──────────────────────────────────────────
  function renderDash() {
    ensureSections(); buildSidebar();
    const el = document.getElementById('dash-section'); if (!el) return;
    const isPro = jobTypeTab === 'pro';
    const proRows = proDB || [];
    const lbFiltered = lbCountryFilter ? (lbDB||[]).filter(r=>(r.country||'')=== lbCountryFilter) : (lbDB||[]);
    const rows = isPro ? proRows : lbFiltered;

    // Use normalised allRows for accurate computed fields (balance, hasDoc)
    const allNorm = allRows();
    const proNorm = allNorm.filter(r=>r.type==='pro');
    const lbNorm  = lbCountryFilter ? allNorm.filter(r=>r.type==='lb'&&r.country===lbCountryFilter) : allNorm.filter(r=>r.type==='lb');
    const normRows = isPro ? proNorm : lbNorm;

    // Pro-specific dash metrics
    const awaitMol  = proNorm.filter(r=>proStageMatches(r, ['MOL','PENDING MOL'])).length;
    const visaReady = proNorm.filter(r=>proStageMatches(r, ['VISA','PENDING VISA'])).length;
    const tickets   = proNorm.filter(r=>r.stage==='PENDING TRAVEL').length;
    const unpaidPro = proNorm.filter(r=>r.balance>0).length;
    // LB-specific
    const lbRefundPending = lbNorm.filter(r=>r.stage==='REFUND PENDING').length;
    const lbSelected      = lbNorm.filter(r=>r.stage==='SELECTED').length;
    const unpaidLB        = lbNorm.filter(r=>r.balance>0&&!r.own_passport).length;

    const missDocs  = normRows.filter(r=>!hasDoc(r)).length;
    const travelled = normRows.filter(r=>String(r.stage).toUpperCase()==='TRAVELLED').length;
    const totalPaidPro = proNorm.reduce((s,r)=>s+r.paid,0);
    const totalPaidLB  = lbNorm.reduce((s,r)=>s+r.paid,0);

    const proFlowSteps = [
      ['Submitted',  proNorm.filter(r=>r.stage==='SUBMITTED').length],
      ['Interview',  proNorm.filter(r=>r.stage==='INTERVIEW').length],
      ['Offer',      proNorm.filter(r=>proStageMatches(r, ['OFFER LETTER','PENDING OFFER LETTER'])).length],
      ['Medical',    proNorm.filter(r=>r.stage==='MEDICAL & ATTESTATION').length],
      ['MOL',        proNorm.filter(r=>proStageMatches(r, ['MOL','PENDING MOL'])).length],
      ['Visa',       proNorm.filter(r=>proStageMatches(r, ['VISA','PENDING VISA'])).length],
      ['Travel',     proNorm.filter(r=>r.stage==='PENDING TRAVEL').length],
      ['Travelled',  proNorm.filter(r=>r.stage==='TRAVELLED').length],
    ];
    const lbFlowSteps = [
      ['Docs In',    lbNorm.filter(r=>r.stage==='DOCS SUBMITTED').length],
      ['Profile Sent',lbNorm.filter(r=>r.stage==='PROFILE SENT').length],
      ['Selected',   lbNorm.filter(r=>r.stage==='SELECTED').length],
      ['Passport',   lbNorm.filter(r=>r.stage==='PASSPORT APPLIED').length],
      ['Visa',       lbNorm.filter(r=>r.stage==='VISA PROCESSING').length],
      ['Travelled',  lbNorm.filter(r=>r.stage==='TRAVELLED').length],
      ['Refund',     lbNorm.filter(r=>r.stage==='REFUND PENDING').length],
      ['Done',       lbNorm.filter(r=>r.stage==='REFUND COMPLETE').length],
    ];
    const flowSteps = isPro ? proFlowSteps : lbFlowSteps;
    const tasks = buildTasks().slice(0,5);

    el.innerHTML = `
      <div class="dv5-page">
        <div class="dv5-page-head">
          <div>
            <h1>${greeting()}, ${h(fname())} 👋</h1>
            <p>Here's what needs your attention today.</p>
          </div>
          <div class="dv5-head-actions">
            ${jobTypeTabs()}
            <button class="dv5-btn primary" onclick="${isPro?'openProForm()':'openLBForm()'}"><i class="ti ti-plus"></i>Add ${isPro?'Professional':'General'}</button>
          </div>
        </div>
        ${!isPro ? lbCountryBar(lbDB||[]) : ''}

        <div class="dv5-priority-grid">
          ${isPro ? `
            ${priority('ti-file-description', awaitMol,  'Awaiting MOL',       'Submit to ministry',   '#FFF4DE', "switchTab('pipeline')")}
            ${priority('ti-id-badge-2',       visaReady, 'Visas Ready',        'Ready to travel',      '#E9F3FF', "switchTab('pipeline')")}
            ${priority('ti-coin',             unpaidPro, 'Unpaid Commissions', 'Requires follow up',   '#E8F8EE', "switchTab('finance')")}
            ${priority('ti-plane-departure',  tickets,   'Tickets Pending',    'Awaiting issue',       '#F1EFFF', "switchTab('pipeline')")}
            ${priority('ti-alert-circle',     missDocs,  'Missing Documents',  'Compliance gap',       '#FEECEF', "switchTab('documents')")}
          ` : `
            ${priority('ti-users',            lbSelected,      'Selected',           'Awaiting passport',    '#E9F3FF', "switchTab('pipeline')")}
            ${priority('ti-credit-card',      lbRefundPending, 'Refund Pending',     'Refunds to process',   '#FFF4DE', "switchTab('finance')")}
            ${priority('ti-coin',             unpaidLB,        'Outstanding USD',    'Refunds not started',  '#E8F8EE', "switchTab('finance')")}
            ${priority('ti-passport',         lbFiltered.filter(r=>r.stage==='PASSPORT APPLIED').length, 'Passport Applied', 'Awaiting passport', '#F1EFFF', "switchTab('pipeline')")}
            ${priority('ti-alert-circle',     missDocs,        'Missing Documents',  'Compliance gap',       '#FEECEF', "switchTab('documents')")}
          `}
        </div>

        <div class="dv5-card dv5-card-pipeline">
          <div class="dv5-card-head" style="margin-bottom:16px">
            <span class="dv5-card-title" style="color:#fff;font-size:14px">${isPro?'Professional':'General Jobs'} Pipeline</span>
            <button class="dv5-link" style="color:rgba(255,255,255,.6);font-size:11px" onclick="switchTab('pipeline')">View all →</button>
          </div>
          <div class="dv5-pipeline-flow" style="justify-content:space-between">
            ${flowSteps.map(([label,val], i) => {
              const maxVal = Math.max(...flowSteps.map(([,v])=>v), 1);
              const pct = Math.round((val/maxVal)*100);
              const isLast = i === flowSteps.length - 1;
              return `
              <div class="dv5-flow-step" style="flex:1;position:relative;padding:0 8px">
                <strong style="font-size:28px">${h(String(val))}</strong>
                <span style="font-size:10px;letter-spacing:.04em;text-transform:uppercase">${h(label)}</span>
                <div style="margin-top:8px;height:3px;border-radius:2px;background:rgba(255,255,255,.12);overflow:hidden">
                  <div style="height:100%;width:${pct}%;background:${isLast?'#EEFA94':'rgba(255,255,255,.45)'};border-radius:2px;transition:width .6s cubic-bezier(.4,0,.2,1)"></div>
                </div>
              </div>${!isLast ? '<div class="dv5-flow-arrow" style="flex-shrink:0;padding:0 2px;padding-bottom:18px"><i class="ti ti-chevron-right"></i></div>' : ''}`;
            }).join('')}
          </div>
        </div>

        <div class="dv5-two-col">
          <div class="dv5-card">
            <div class="dv5-card-head">
              <span class="dv5-card-title">Recent Activity</span>
              <span class="dv5-card-sub">Latest changes</span>
            </div>
            <div class="dv5-activity-list">${recentActivity(6)}</div>
          </div>
          <div class="dv5-card">
            <div class="dv5-card-head">
              <span class="dv5-card-title">Upcoming Reminders</span>
              <button class="dv5-link" onclick="switchTab('pipeline')">View all →</button>
            </div>
            <div class="dv5-task-list">
              ${tasks.length ? tasks.map(taskRow).join('') : '<div class="dv5-empty">No urgent tasks. Workspace is clear.</div>'}
            </div>
          </div>
        </div>

        <div class="dv5-two-col" style="margin-bottom:12px">
          <div class="dv5-card" style="margin-bottom:0">
            <div class="dv5-card-head">
              <div>
                <span class="dv5-card-title">Placements by Month</span>
                <div class="dv5-card-sub">${isPro?'Professional':'General'} — last 6 months</div>
              </div>
            </div>
            ${buildBarChart(rows)}
          </div>
          <div class="dv5-card" style="margin-bottom:0">
            <div class="dv5-card-head">
              <div>
                <span class="dv5-card-title">Pipeline Funnel</span>
                <div class="dv5-card-sub">Candidates per stage</div>
              </div>
            </div>
            ${buildFunnelChart(flowSteps)}
          </div>
        </div>

        <div class="dv5-stat-grid" style="margin-top:0">
          ${isPro ? `
            ${statCard('ti-users',      proNorm.length,                                         'Professional',    `Total candidates`,      '#E0F2FE','#0369A1','#fff', "switchTab('candidates')")}
            ${statCard('ti-plane',      travelled,                                              'Placements',      `Completed`,             '#DCFCE7','#16A34A','#fff', "switchTab('pipeline')")}
            ${statCard('ti-users-group',proNorm.filter(r=>r.stage!=='TRAVELLED').length,        'Active Pipeline', `In progress`,           '#FCE7F3','#9D174D','#fff', "switchTab('pipeline')")}
            ${statCard('ti-wallet',     money(totalPaidPro),                                   'Revenue (KES)',   `Commission collected`,   '#FEF9C3','#A16207','#fff', "switchTab('finance')")}
          ` : `
            ${statCard('ti-users',      lbNorm.length,                                          'General Jobs',    `Total candidates`,      '#E0F2FE','#0369A1','#fff', "switchTab('candidates')")}
            ${statCard('ti-plane',      travelled,                                              'Travelled',       `Successfully placed`,   '#DCFCE7','#16A34A','#fff', "switchTab('pipeline')")}
            ${statCard('ti-passport',   lbNorm.filter(r=>r.own_passport).length,               'Own Passport',    `No refund required`,    '#F0FDF4','#059669','#fff', "switchTab('candidates')")}
            ${statCard('ti-wallet',     moneyUSD(totalPaidLB),                                 'Refunds (USD)',   `Refunds collected`,      '#FEF9C3','#A16207','#fff', "switchTab('finance')")}
          `}
        </div>
      </div>`;
  }
  window.renderDash = renderDash;

  // ── 2. PIPELINE ───────────────────────────────────────────
  let pipelineSearch = '';
  window.setPipelineSearch = v => { pipelineSearch = v; renderPipeline(); };

  function renderPipeline() {
    const el = document.getElementById('pipeline-section'); if (!el) return;
    const isPro = jobTypeTab === 'pro';
    const pipelineRows = allRows();
    const q = pipelineSearch.toLowerCase();
    const matchSearch = r => !q || [r.name,r.position,r.company,r.pp,r.country,r.phone].join(' ').toLowerCase().includes(q);
    const proRows = pipelineRows.filter(r=>r.type==='pro'&&matchSearch(r)).map(r=>({...r, pipelineStage:proPipelineStageValue(r)}));
    const lbRows = pipelineRows.filter(r=>r.type==='lb'&&matchSearch(r)).map(r=>({...r, pipelineStage:lbPipelineStageValue(r)}));
    const proStageList = PRO_PIPELINE_STAGES;
    const lbStageList  = LB_PIPELINE_STAGES;
    const lbFiltered = lbCountryFilter ? lbRows.filter(r=>(r.country||'')=== lbCountryFilter) : lbRows;
    const stages = isPro ? proStageList : lbStageList;
    const totalShown = isPro ? proRows.length : lbFiltered.length;

    el.innerHTML = `
      <div class="dv5-page">
        <div class="dv5-page-head">
          <div><h1>Pipeline</h1><p>${isPro?'Professional candidates — KES commission pipeline.':'General Jobs — USD refund pipeline.'}</p></div>
          <div class="dv5-head-actions">
            <div style="position:relative">
              <i class="ti ti-search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-3);font-size:14px;pointer-events:none"></i>
              <input type="search" placeholder="Search candidates…" value="${h(pipelineSearch)}"
                oninput="setPipelineSearch(this.value)"
                style="height:36px;border:1.5px solid var(--border);border-radius:8px;padding:0 10px 0 32px;font-size:13px;background:#fff;width:200px;outline:none">
            </div>
            ${jobTypeTabs()}
            <button class="dv5-btn primary" onclick="${isPro?'openProForm()':'openLBForm()'}"><i class="ti ti-plus"></i>Add ${isPro?'Professional':'General'}</button>
          </div>
        </div>
        ${!isPro ? lbCountryBar(lbDB||[]) : ''}
        ${q ? `<div style="font-size:12px;color:var(--text-3);margin-top:8px"><i class="ti ti-filter"></i> Showing ${totalShown} result${totalShown!==1?'s':''} for "<strong>${h(q)}</strong>"</div>` : ''}
        <div class="dv5-kanban" style="margin-top:12px">
          ${stages.map(stage => {
            const items = isPro
              ? proRows.filter(r=>r.pipelineStage===stage)
              : lbFiltered.filter(r=>r.pipelineStage===stage);
            const label = stage.replace(/^DOCS /,'');
            return `<div class="dv5-col">
              <div class="dv5-col-head">
                <span>${h(label)}</span>
                <span class="dv5-col-count">${items.length}</span>
              </div>
              <div class="dv5-col-body">
                ${items.length ? items.map(r => `
                  <div class="dv5-pipe-card" onclick="${isPro?`editPro(${r.id})`:`editLB(${r.id})`}">
                    <div class="dv5-pipe-name">${h(r.name)}</div>
                    <div class="dv5-pipe-meta">${h(r.position||r.country||'—')} · ${h(r.company||'—')}</div>
                    <div class="dv5-pipe-foot">
                      <span><i class="ti ti-id"></i>${h(r.pp||'No PP')}</span>
                      ${isPro && r.commission ? `<span>${money(r.commission)}</span>` : ''}
                      ${!isPro && r.commission ? `<span>${moneyUSD(r.commission)}</span>` : ''}
                      ${!isPro && r.own_passport ? `<span style="color:#059669;font-size:9px">Own PP</span>` : ''}
                      ${r.followUp ? `<span style="color:#D97706;font-size:9px"><i class="ti ti-calendar-event"></i>${fmt(r.followUp)}</span>` : ''}
                    </div>
                  </div>`).join('') : `<div class="dv5-empty">${q?'No matches':'No candidates'}</div>`}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }
  window.renderPipelinePage = renderPipeline;

  // ── 3. CANDIDATES ─────────────────────────────────────────
  let candidateSearch = '';
  let candidateTypeFilter = '';
  let candidateStageFilter = '';
  let candidateViewFilter = 'all';
  let selectedCandidates = new Set(); // 'type_id' strings

  function setCandidateSearch(v) { candidateSearch = v; renderCandidates(); }
  window.setCandidateSearch = setCandidateSearch;
  window.setCandidateStageFilter = v => { candidateStageFilter = v; renderCandidates(); };
  window.setCandidateViewFilter  = v => { candidateViewFilter  = v; renderCandidates(); };
  window.clearSelectedCandidates = () => { selectedCandidates.clear(); renderCandidates(); };

  function filterCandidates() {
    // Always scoped to the active job type tab
    let rows = allRows().filter(r => r.type === jobTypeTab);
    const q = candidateSearch.toLowerCase();
    if (candidateStageFilter) rows = rows.filter(r=>r.stage===candidateStageFilter);
    if (candidateViewFilter==='follow') rows = rows.filter(r=>r.balance>0||!hasDoc(r));
    if (candidateViewFilter==='balance') rows = rows.filter(r=>r.balance>0);
    if (q) rows = rows.filter(r=>[r.name,r.pp,r.phone,r.position,r.company,r.country,r.stage].join(' ').toLowerCase().includes(q));
    return rows;
  }

  function toggleCandSelect(key, checked) {
    if (checked) selectedCandidates.add(key);
    else selectedCandidates.delete(key);
    const bar = document.getElementById('cand-bulk-bar');
    const countEl = document.getElementById('cand-bulk-count');
    if (bar) bar.style.display = selectedCandidates.size > 0 ? 'flex' : 'none';
    if (countEl) countEl.textContent = selectedCandidates.size + ' selected';
    const selectAll = document.getElementById('cand-select-all');
    if (selectAll) {
      const list = filterCandidates();
      selectAll.indeterminate = selectedCandidates.size > 0 && selectedCandidates.size < list.length;
      selectAll.checked = list.length > 0 && list.every(r => selectedCandidates.has(r.type+'_'+r.id));
    }
  }
  window.toggleCandSelect = toggleCandSelect;

  function toggleSelectAll(checked) {
    filterCandidates().forEach(r => {
      const key = r.type+'_'+r.id;
      if (checked) selectedCandidates.add(key); else selectedCandidates.delete(key);
    });
    renderCandidates();
  }
  window.toggleSelectAll = toggleSelectAll;

  async function bulkChangeStage(stage) {
    if (!stage || !selectedCandidates.size) return;
    const list = filterCandidates().filter(r => selectedCandidates.has(r.type+'_'+r.id));
    for (const r of list) {
      const table = r.type==='pro' ? 'pro_candidates' : 'lb_candidates';
      await dbUpdate(table, r.id, r.type==='pro' ? {stage} : {stage, travelStatus: stage});
      const db2 = r.type==='pro' ? proDB : lbDB;
      const idx = db2.findIndex(x => x.id===r.id);
      if (idx >= 0) { if (r.type==='pro') db2[idx].stage = stage; else db2[idx].travelStatus = stage; }
    }
    selectedCandidates.clear();
    renderCandidates();
    showToast('Stage updated for '+list.length+' candidate'+(list.length!==1?'s':''), 'success');
  }
  window.bulkChangeStage = bulkChangeStage;

  function bulkExportSelected() {
    const rows = filterCandidates().filter(r => selectedCandidates.has(r.type+'_'+r.id));
    if (!rows.length) return;
    const proRows = rows.filter(r=>r.type==='pro');
    const lbRows  = rows.filter(r=>r.type==='lb');
    if (proRows.length) { lastProFiltered = proRows; exportCSV('pro'); }
    if (lbRows.length)  { lastLBFiltered  = lbRows;  exportCSV('lb'); }
  }
  window.bulkExportSelected = bulkExportSelected;

  function renderCandidates() {
    const el = document.getElementById('candidates-section'); if (!el) return;
    const isPro = jobTypeTab === 'pro';
    const lbBaseRows = lbCountryFilter ? (lbDB||[]).filter(r=>(r.country||'')=== lbCountryFilter) : (lbDB||[]);
    let all = isPro
      ? (proDB||[]).map(r=>({...r,type:'pro',position:r.position||'',company:r.company||'',country:r.country||'',stage:r.stage||'SUBMITTED',commission:Number(r.commission)||0,paid:Number(r.paid||0),balance:Math.max((Number(r.commission)||0)-(Number(r.paid||0)),0)}))
      : lbBaseRows.map(r=>{const r1=Number(r.r1Amt||r.r1_amt)||0,r2=Number(r.r2Amt||r.r2_amt)||0,toRef=Number(r.toRefund||r.to_refund)||0;return{...r,type:'lb',position:r.country||'General Job',company:r.company||r.country||'—',country:r.country||'—',stage:r.travelStatus||r.travel_status||r.stage||'DOCS SUBMITTED',commission:toRef,paid:r1+r2,balance:balLB(r)};});
    const allCandidateRows = allRows();
    all = isPro
      ? allCandidateRows.filter(r=>r.type==='pro')
      : allCandidateRows.filter(r=>r.type==='lb' && (!lbCountryFilter || (r.country||'')===lbCountryFilter));
    const stageOptions = [...new Set(all.map(r=>r.stage).filter(Boolean))];
    const q = candidateSearch.toLowerCase();
    let list = all.filter(r => {
      if (candidateStageFilter && r.stage !== candidateStageFilter) return false;
      if (candidateViewFilter==='follow' && r.balance<=0 && hasDoc(r)) return false;
      if (candidateViewFilter==='balance' && r.balance<=0) return false;
      if (q && ![r.name,r.pp,r.phone,r.position,r.company,r.country,r.stage].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
    const allSel = list.length > 0 && list.every(r => selectedCandidates.has(r.type+'_'+r.id));
    const someSel = selectedCandidates.size > 0;
    const proStageList2 = proStages && proStages.length ? proStages : ['SUBMITTED','INTERVIEW','OFFER LETTER','MEDICAL & ATTESTATION','MOL','VISA','PENDING TRAVEL','TRAVELLED'];
    const lbStageList2  = lbStages  && lbStages.length  ? lbStages  : ['DOCS SUBMITTED','PROFILE SENT','SELECTED','PASSPORT APPLIED','VISA PROCESSING','TRAVELLED','REFUND PENDING','REFUND COMPLETE'];
    const allStages = isPro ? proStageList2 : lbStageList2;
    el.innerHTML = `
      <div class="dv5-page">
        <div class="dv5-page-head">
          <div><h1>Candidates</h1><p>${isPro?'Professional placements — commissions in KES.':'General Jobs — refunds in USD.'}</p></div>
          <div class="dv5-head-actions">
            ${jobTypeTabs()}
            <button class="dv5-btn primary" onclick="${isPro?'openProForm()':'openLBForm()'}"><i class="ti ti-plus"></i>Add ${isPro?'Professional':'General'}</button>
          </div>
        </div>
        ${!isPro ? lbCountryBar(lbDB||[]) : ''}
        <div class="dv5-bulk-bar" id="cand-bulk-bar" style="display:${someSel?'flex':'none'}">
          <span id="cand-bulk-count">${selectedCandidates.size} selected</span>
          <select class="dv5-select" onchange="bulkChangeStage(this.value);this.value=''">
            <option value="">Change stage…</option>
            ${allStages.map(s=>`<option value="${h(s)}">${h(s)}</option>`).join('')}
          </select>
          <button class="dv5-btn" onclick="bulkExportSelected()"><i class="ti ti-download"></i>Export selected</button>
          <button class="dv5-btn" onclick="window.clearSelectedCandidates()"><i class="ti ti-x"></i>Clear</button>
        </div>
        <div class="dv5-toolbar">
          <div class="dv5-toolbar-left">
            <input class="dv5-input" id="cand-search" placeholder="Search name, passport, company…"
              value="${h(candidateSearch)}" oninput="setCandidateSearch(this.value)">
            <select class="dv5-select" onchange="window.setCandidateStageFilter(this.value)">
              <option value="">All Stages</option>
              ${stageOptions.map(s=>`<option value="${h(s)}" ${candidateStageFilter===s?'selected':''}>${h(s)}</option>`).join('')}
            </select>
          </div>
          <div class="dv5-toolbar-right">
            <div class="dv5-view-tabs">
              ${[['all','All'],['follow','Needs Action'],['balance','Has Balance']].map(([v,l])=>
                `<button class="dv5-view-tab ${candidateViewFilter===v?'active':''}"
                  onclick="window.setCandidateViewFilter('${v}')">${l}</button>`
              ).join('')}
            </div>
            <span class="dv5-count">Showing ${list.length} of ${all.length}</span>
            <button class="dv5-btn" onclick="exportCSV('${isPro?'pro':'lb'}')"><i class="ti ti-download"></i>Export</button>
          </div>
        </div>
        <div class="dv5-table-card">
          <div class="dv5-table-wrap">
            <table class="dv5-table">
              <thead><tr>
                <th style="width:36px"><input type="checkbox" id="cand-select-all" ${allSel?'checked':''} onchange="toggleSelectAll(this.checked)"></th>
                <th>Name</th><th>${isPro?'Job Title':'Destination'}</th><th>${isPro?'Company':'Agency'}</th>
                <th>Stage</th><th>${isPro?'Submitted':'Doc Date'}</th><th></th>
              </tr></thead>
              <tbody>
                ${list.length ? list.map(r => {
                  const key = r.type+'_'+r.id;
                  const sel = selectedCandidates.has(key);
                  return `
                  <tr class="${sel?'dv5-row-selected':''}" onclick="openCandidateProfile('${r.type}',${r.id})">
                    <td onclick="event.stopPropagation()">
                      <input type="checkbox" ${sel?'checked':''} onchange="toggleCandSelect('${key}',this.checked)">
                    </td>
                    <td><div class="dv5-name-cell">
                      ${avatar(r.name)}
                      <div>
                        <div class="dv5-name">${h(r.name)}</div>
                        <div class="dv5-sub">${h(r.pp||'No passport')} · ${h(r.phone||'No phone')}</div>
                      </div>
                    </div></td>
                    <td>${h(r.position)}</td>
                    <td>${h(r.company)}</td>
                    <td>${badge(r.stage)}</td>
                    <td>${h(fmt(r.submitted))}</td>
                    <td onclick="event.stopPropagation()">
                      <button class="dv5-action-btn" onclick="${r.type==='pro'?`editPro(${r.id})`:`editLB(${r.id})`}" title="Edit">
                        <i class="ti ti-edit"></i>
                      </button>
                      <button class="dv5-action-btn" onclick="openDocs('${r.type}',${JSON.stringify(r.id)},'${js(r.name)}')" title="Documents">
                        <i class="ti ti-paperclip"></i>
                      </button>
                      <button class="dv5-action-btn primary" onclick="window.advanceStage('${r.type}',${r.id})" title="Advance to next stage" style="background:#5347CE;color:#fff;border-color:#5347CE">
                        <i class="ti ti-arrow-right"></i>
                      </button>
                    </td>
                  </tr>`;
                }).join('') : '<tr><td colspan="9"><div class="dv5-empty">No candidates found.</div></td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  }
  window.renderCandidatesPage = renderCandidates;
  window.renderCandidates = renderCandidates;

  window.advanceStage = async function(type, id) {
    const stages = type === 'pro'
      ? ((proStages && proStages.length ? proStages : ['SUBMITTED','INTERVIEW','OFFER LETTER','MEDICAL & ATTESTATION','MOL','VISA','PENDING TRAVEL','TRAVELLED']))
      : (lbStages && lbStages.length ? lbStages : ['DOCS SUBMITTED','PROFILE SENT','SELECTED','PASSPORT APPLIED','VISA PROCESSING','TRAVELLED','REFUND PENDING','REFUND COMPLETE']);
    const db = type === 'pro' ? proDB : lbDB;
    const rec = db.find(r => r.id == id);
    if (!rec) return;
    const cur = (type === 'pro' ? rec.stage : (rec.travelStatus || rec.travel_status) || stages[0]).toUpperCase();
    const idx = stages.findIndex(s => s.toUpperCase() === cur);
    if (idx === -1 || idx >= stages.length - 1) { showToast('Already at final stage','info'); return; }
    const nextStage = stages[idx + 1].toUpperCase();

    // Guard: require travel date before entering travel stages
    if (type === 'pro' && ['PENDING TRAVEL','TRAVELLED'].includes(nextStage) && !rec.travel) {
      showToast('Set a travel date before advancing to this stage.','error'); return;
    }
    if (type === 'lb' && ['TRAVELLED','REFUND PENDING','REFUND COMPLETE'].includes(nextStage) && !rec.travelDate) {
      showToast('Set a travel date before advancing to Travelled.','error'); return;
    }
    // Guard: require refund amount for LB before marking travelled
    if (type === 'lb' && nextStage === 'TRAVELLED' && !lbOwnPassport(rec) && !rec.toRefund) {
      showToast('Enter the refund amount before marking as Travelled.','error'); return;
    }

    const nextStageRaw = stages[idx + 1];
    if (type === 'pro') rec.stage = nextStageRaw; else { rec.travelStatus = nextStageRaw; rec.stage = nextStageRaw; }
    showToast(`Moved to ${nextStageRaw}`, 'success');
    renderCandidates();
    try {
      const table = type === 'pro' ? 'pro_candidates' : 'lb_candidates';
      const updateField = type === 'pro' ? { stage: nextStageRaw } : { stage: nextStageRaw, travelStatus: nextStageRaw };
      await dbUpdate(table, id, updateField);
    } catch(e) { console.warn('advanceStage save error', e); }
  };

  // ── 4. TASKS ──────────────────────────────────────────────
  function renderTasks() {
    const el = document.getElementById('tasks-section'); if (!el) return;
    const auto = buildTasks();
    const manual = manualTasks.map((t,i) => ({...t, manual:true, priority:'Medium', label:'Todo', icon:'ti-check', idx:i}));
    const tasks = [...auto, ...manual];
    const high = tasks.filter(t=>t.priority==='High'||t.label==='Overdue');
    const med  = tasks.filter(t=>t.priority==='Medium');
    el.innerHTML = `
      <div class="dv5-page">
        <div class="dv5-page-head">
          <div><h1>Tasks</h1><p>Auto-generated action items plus your own manual tasks. Dismiss any item to clear it.</p></div>
          <div class="dv5-head-actions">
            <button class="dv5-btn primary" onclick="switchTab('candidates')"><i class="ti ti-users"></i>Open Candidates</button>
          </div>
        </div>
        <div class="dv5-stat-grid">
          ${statCard('ti-checkbox',      tasks.length,  'Open Tasks',      `Need attention`,                              '#F5F3FF','#7C3AED','#fff')}
          ${statCard('ti-alert-triangle',high.length,   'High Priority',   `Urgent blockers`,                             '#FEF2F2','#DC2626','#fff')}
          ${statCard('ti-clock',         med.length,    'Medium',          `Stage follow ups`,                            '#FFFBEB','#D97706','#fff')}
          ${statCard('ti-folder-x',      allRows().filter(r=>!hasDoc(r)).length,'Missing Docs','Compliance gap',          '#F0FDFA','#0D9488','#fff')}
          ${statCard('ti-coin',          allRows().filter(r=>r.balance>0).length,'Unpaid',    `Finance follow up`,        '#F0FDF4','#16A34A','#fff')}
        </div>
        <div class="dv5-card" style="margin-bottom:12px">
          <div class="dv5-card-head"><span class="dv5-card-title">Add Manual Task</span></div>
          <div style="display:flex;gap:8px;padding:0 16px 14px;flex-wrap:wrap;align-items:flex-end">
            <div style="flex:1;min-width:180px"><label style="font-size:11px;font-weight:700;color:#6b7280;display:block;margin-bottom:4px">Title</label>
              <input id="new-task-title" type="text" placeholder="e.g. Call Mr. Smith" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #e5e7eb;border-radius:7px;font-size:13px"></div>
            <div><label style="font-size:11px;font-weight:700;color:#6b7280;display:block;margin-bottom:4px">Due date</label>
              <input id="new-task-due" type="date" style="padding:8px 10px;border:1px solid #e5e7eb;border-radius:7px;font-size:13px"></div>
            <button class="dv5-btn primary" onclick="addManualTask()" style="height:36px;align-self:flex-end"><i class="ti ti-plus"></i>Add Task</button>
          </div>
        </div>
        <div class="dv5-card">
          <div class="dv5-card-head">
            <span class="dv5-card-title">Task Queue</span>
            <span class="dv5-card-sub">${tasks.length} items</span>
          </div>
          <div class="dv5-task-list">
            ${tasks.length ? tasks.map((t,i)=>taskRow(t, t.manual?t.idx:i)).join('') : '<div class="dv5-empty">Everything is clear. Workspace is clean.</div>'}
          </div>
        </div>
      </div>`;
  }
  window.renderTasksPage = renderTasks;

  // ── 5. FINANCE ────────────────────────────────────────────
  let financePositionFilter = '';
  let financeTab = 'latest'; // 'latest' | 'upcoming'
  let financeDatePreset = 'all'; // 'all','this_month','last_month','this_quarter','this_year'
  let financeClientSearch = '';
  window.setFinancePosition   = v => { financePositionFilter = v; renderFinance(); };
  window.setFinanceTab        = v => { financeTab = v; renderFinance(); };
  window.setFinanceDatePreset = v => { financeDatePreset = v; renderFinance(); };
  window.setFinanceClientSearch = v => { financeClientSearch = v; renderFinance(); };

  function renderFinance() {
    const el = document.getElementById('finance-section'); if (!el) return;
    const isPro = jobTypeTab === 'pro';
    const allFinRows = allRows();
    const proRows = allFinRows.filter(r=>r.type==='pro');
    const lbAllRows = allFinRows.filter(r=>r.type==='lb');
    const lbRows  = lbCountryFilter ? lbAllRows.filter(r=>(r.country||'')=== lbCountryFilter) : lbAllRows;
    const activeRows = isPro ? proRows : lbRows;
    const positions = [...new Set(activeRows.map(r=>r.position).filter(Boolean))].sort();
    const rows = financePositionFilter
      ? activeRows.filter(r=>r.position===financePositionFilter)
      : activeRows;
    // Pro stats (KES)
    const proFin = financePositionFilter ? proRows.filter(r=>r.position===financePositionFilter) : proRows;
    const proTotal = proFin.reduce((s,r)=>s+r.commission,0);
    const proPaid  = proFin.reduce((s,r)=>s+r.paid,0);
    const proBal   = proFin.reduce((s,r)=>s+r.balance,0);
    const proRate  = proTotal ? Math.round(proPaid/proTotal*100) : 0;
    // LB stats (USD) — only post-travel candidates have real outstanding balances
    const lbFin = financePositionFilter ? lbRows.filter(r=>r.position===financePositionFilter) : lbRows;
    const lbTravelled = lbFin.filter(r => LB_TRAVELLED_STAGES.has(String(r.stage||'').toUpperCase()));
    const lbPreTravel = lbFin.filter(r => !LB_TRAVELLED_STAGES.has(String(r.stage||'').toUpperCase())&&!r.own_passport);
    const lbTotal   = lbTravelled.reduce((s,r)=>s+r.commission,0); // total refund commitment (post-travel only)
    const lbPaidAmt = lbFin.reduce((s,r)=>s+r.paid,0);            // all refunds received
    const lbBal     = lbTravelled.reduce((s,r)=>s+r.balance,0);   // outstanding only for travelled
    const lbExpected = lbPreTravel.reduce((s,r)=>s+r.commission,0); // pre-travel expected
    const lbOwnPP   = lbFin.filter(r=>r.own_passport).length;
    const lbPipeline = lbPreTravel.length; // pre-travel, expected future refunds
    const total = rows.reduce((s,r)=>s+r.commission,0);
    const paid  = rows.reduce((s,r)=>s+r.paid,0);
    const bal   = rows.reduce((s,r)=>s+r.balance,0);
    const rate  = proRate;

    // Monthly breakdown (last 6 months, by r.submitted or created_at)
    const now = new Date();
    const months = Array.from({length:6},(_,i)=>{
      const d = new Date(now.getFullYear(), now.getMonth()-5+i, 1);
      return { label: d.toLocaleString('default',{month:'short'})+' '+d.getFullYear().toString().slice(2), y: d.getFullYear(), m: d.getMonth() };
    });
    const monthly = months.map(({label,y,m}) => {
      const mrs = rows.filter(r=>{
        const d = new Date(r.submitted||r.created_at||'');
        return !isNaN(d) && d.getFullYear()===y && d.getMonth()===m;
      });
      return { label, invoiced: mrs.reduce((s,r)=>s+r.commission,0), paid: mrs.reduce((s,r)=>s+r.paid,0) };
    });

    // Outstanding by company
    const byPosition = {};
    rows.filter(r=>r.balance>0).forEach(r => {
      const pos = r.position || 'Unknown Position';
      if (!byPosition[pos]) byPosition[pos] = {name:pos,balance:0,count:0};
      byPosition[pos].balance += r.balance;
      byPosition[pos].count++;
    });
    const positionDebt = Object.values(byPosition).sort((a,b)=>b.balance-a.balance);

    // Date range preset filter
    const now2 = new Date();
    function inPreset(r) {
      const d = new Date(r.submitted || r.created_at || '');
      if (isNaN(d) || financeDatePreset === 'all') return true;
      const y = d.getFullYear(), mo = d.getMonth();
      if (financeDatePreset === 'this_month') return y === now2.getFullYear() && mo === now2.getMonth();
      if (financeDatePreset === 'last_month') { const lm = new Date(now2.getFullYear(), now2.getMonth()-1,1); return y === lm.getFullYear() && mo === lm.getMonth(); }
      if (financeDatePreset === 'this_quarter') { const q = Math.floor(now2.getMonth()/3); return y === now2.getFullYear() && Math.floor(mo/3) === q; }
      if (financeDatePreset === 'this_year') return y === now2.getFullYear();
      return true;
    }
    const dateRows = rows.filter(inPreset);
    // Expand to per-payment entries for "latest" tab
    const paymentEntries = [];
    dateRows.forEach(r => {
      if (r.type === 'pro') {
        if (r.paid1 > 0) paymentEntries.push({ r, label: `${r.name} — 1st Commission`, amt: r.paid1, date: r.interview || r.submitted || r.created_at, isUSD: false });
        if (r.paid2 > 0) paymentEntries.push({ r, label: `${r.name} — 2nd Commission`, amt: r.paid2, date: r.ol || r.submitted || r.created_at, isUSD: false });
        if (!r.paid1 && !r.paid2 && r.paid > 0) paymentEntries.push({ r, label: `${r.name} — Commission`, amt: r.paid, date: r.submitted || r.created_at, isUSD: false });
      } else {
        const r1 = Number(r.r1Amt)||0, r2 = Number(r.r2Amt)||0;
        if (r1 > 0) paymentEntries.push({ r, label: `${r.name} — 1st Refund`, amt: r1, date: r.r1Date || r.travelDate || r.submitted || r.created_at, isUSD: true });
        if (r2 > 0) paymentEntries.push({ r, label: `${r.name} — 2nd Refund`, amt: r2, date: r.r2Date || r.travelDate || r.submitted || r.created_at, isUSD: true });
        if (!r1 && !r2 && r.paid > 0) paymentEntries.push({ r, label: `${r.name} — Refund`, amt: r.paid, date: r.travelDate || r.submitted || r.created_at, isUSD: true });
      }
    });
    paymentEntries.sort((a,b) => new Date(b.date||0) - new Date(a.date||0));
    const upcomingRows = dateRows.filter(r => r.balance > 0).sort((a,b) => b.balance - a.balance);
    const searchQ = financeClientSearch.trim().toLowerCase();
    const filteredPayments = searchQ ? paymentEntries.filter(e => e.label.toLowerCase().includes(searchQ) || (e.r.company||'').toLowerCase().includes(searchQ)) : paymentEntries;
    const filteredUpcoming = searchQ ? upcomingRows.filter(r => (r.name||'').toLowerCase().includes(searchQ) || (r.company||'').toLowerCase().includes(searchQ)) : upcomingRows;
    const txRows = financeTab === 'latest' ? filteredPayments : filteredUpcoming;
    const presets = [
      ['all','All Time'],['this_month','This Month'],['last_month','Last Month'],
      ['this_quarter','This Quarter'],['this_year','This Year']
    ];

    el.innerHTML = `
      <div class="dv5-page">
        <div class="dv5-page-head">
          <div><h1>Finance</h1><p>${isPro?'Professional commissions — KES.':'General Jobs refunds — USD.'}</p></div>
          <div class="dv5-head-actions">
            ${jobTypeTabs()}
            <input class="dv5-input" placeholder="Search client…" value="${h(financeClientSearch)}" oninput="window.setFinanceClientSearch(this.value)" style="min-width:150px">
            <select class="dv5-select" onchange="setFinancePosition(this.value)" style="min-width:130px">
              <option value="">All Positions</option>
              ${positions.map(c=>`<option value="${h(c)}" ${financePositionFilter===c?'selected':''}>${h(c)}</option>`).join('')}
            </select>
            <button class="dv5-btn" onclick="exportCSV('${isPro?'pro':'lb'}')"><i class="ti ti-download"></i>Export</button>
          </div>
        </div>
        ${!isPro ? lbCountryBar(lbDB||[]) : ''}

        <div class="dv5-stat-grid" style="margin-bottom:20px;margin-top:12px">
          ${isPro ? `
            ${statCard('ti-receipt',      money(proTotal), 'Total Commission',  `${proFin.length} candidates`,     '#E0E7FF','#4338CA','#fff')}
            ${statCard('ti-wallet',       money(proPaid),  'Collected KES',     'Revenue received',                '#DCFCE7','#16A34A','#fff')}
            ${statCard('ti-alert-circle', money(proBal),   'Outstanding KES',   `${proFin.filter(r=>r.balance>0).length} open accounts`, '#FEE2E2','#DC2626','#fff')}
            ${statCard('ti-chart-pie',    proRate+'%',     'Collection Rate',   'Paid vs invoiced',                '#FEF9C3','#A16207','#fff')}
          ` : `
            ${statCard('ti-wallet',       moneyUSD(lbPaidAmt),   'Refunds Collected',  'Received so far',                                          '#DCFCE7','#16A34A','#fff')}
            ${statCard('ti-alert-circle', moneyUSD(lbBal),      'Outstanding USD',    `${lbTravelled.filter(r=>r.balance>0).length} post-travel unpaid`, '#FEE2E2','#DC2626','#fff')}
            ${statCard('ti-receipt',      moneyUSD(lbTotal),    'Collected + Owed',   `${lbTravelled.length} have travelled`,                            '#E0E7FF','#4338CA','#fff')}
            ${statCard('ti-clock',        moneyUSD(lbExpected), 'Expected (Pipeline)',`${lbPipeline} pre-travel candidates`,                             '#FEF9C3','#A16207','#fff')}
          `}
        </div>

        <div class="dv5-two-col" style="margin-bottom:16px">
          <div class="dv5-card">
            <div class="dv5-card-head"><span class="dv5-card-title">Monthly Breakdown</span><span class="dv5-card-sub">Last 6 months</span></div>
            <div class="dv5-table-wrap">
              <table class="dv5-table" style="min-width:0">
                <thead><tr><th>Month</th><th>Invoiced</th><th>Collected</th><th>Outstanding</th></tr></thead>
                <tbody>
                  ${monthly.map(m=>`<tr>
                    <td style="font-weight:700">${m.label}</td>
                    <td>${isPro?money(m.invoiced):moneyUSD(m.invoiced)}</td>
                    <td style="color:#16a34a;font-weight:700">${isPro?money(m.paid):moneyUSD(m.paid)}</td>
                    <td style="color:${m.invoiced-m.paid>0?'#b91c1c':'#6b7280'}">${isPro?money(m.invoiced-m.paid):moneyUSD(m.invoiced-m.paid)}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
          <div class="dv5-card">
            <div class="dv5-card-head">
              <span class="dv5-card-title">Outstanding by Position</span>
              <span class="dv5-card-sub">${isPro?money(bal):moneyUSD(bal)}</span>
            </div>
            <div class="dv5-task-list">
              ${positionDebt.slice(0,8).map(c=>`
                <div class="dv5-task-item" onclick="setFinancePosition('${js(c.name)}')">
                  <div class="dv5-task-icon high"><i class="ti ti-briefcase"></i></div>
                  <div class="dv5-task-body">
                    <div class="dv5-task-title">${h(c.name)}</div>
                    <div class="dv5-task-meta">${c.count} candidate${c.count!==1?'s':''}</div>
                  </div>
                  <span class="dv5-pill red">${isPro?money(c.balance):moneyUSD(c.balance)}</span>
                </div>`).join('') || '<div class="dv5-empty">No outstanding balances.</div>'}
            </div>
          </div>
        </div>

        <!-- Transactions section -->
        <div class="dv5-table-card">
          <div class="dv5-tx-header">
            <div>
              <div class="dv5-card-title">Transactions${financePositionFilter?' — '+h(financePositionFilter):''}</div>
              <div class="dv5-card-sub" style="margin-top:2px">${financeTab==='latest'?filteredPayments.length:filteredUpcoming.length} records${searchQ?' (filtered)':''}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <div class="dv5-date-presets">
                ${presets.map(([val,label])=>`<button class="dv5-preset-btn${financeDatePreset===val?' active':''}" onclick="window.setFinanceDatePreset('${val}')">${h(label)}</button>`).join('')}
              </div>
              <button class="dv5-btn" onclick="exportCSV('pro')"><i class="ti ti-download"></i></button>
            </div>
          </div>
          <div class="dv5-tx-tabs">
            <button class="dv5-tx-tab${financeTab==='latest'?' active':''}" onclick="window.setFinanceTab('latest')">Latest</button>
            <button class="dv5-tx-tab${financeTab==='upcoming'?' active':''}" onclick="window.setFinanceTab('upcoming')">Upcoming</button>
          </div>
          <div class="dv5-tx-list">
            ${financeTab === 'latest'
              ? (filteredPayments.length ? filteredPayments.map(({r, label, amt, date, isUSD}) => {
                  const d = new Date(date||'');
                  const dateStr = isNaN(d) ? '—' : d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
                  const amtStr = '+' + (isUSD ? moneyUSD(amt) : money(amt));
                  return `<div class="dv5-tx-row" onclick="${r.type==='pro'?`editPro(${r.id})`:`editLB(${r.id})`}">
                    <div class="dv5-tx-date">${dateStr}</div>
                    <div class="dv5-tx-info">
                      <div class="dv5-tx-name">${h(label)}</div>
                      <div class="dv5-tx-status" style="color:#6b7280">${h(r.company||'—')} · ${h(r.type==='pro'?'Professional':'General')}</div>
                    </div>
                    <div class="dv5-tx-amt" style="color:#16a34a">${amtStr}</div>
                    <button class="dv5-tx-arrow" onclick="event.stopPropagation();${r.type==='pro'?`editPro(${r.id})`:`editLB(${r.id})`}"><i class="ti ti-chevron-right"></i></button>
                  </div>`;
                }).join('') : '<div class="dv5-empty" style="padding:32px">No payments recorded.</div>')
              : (filteredUpcoming.length ? filteredUpcoming.map(r => {
                  const d = new Date(r.submitted||r.created_at||'');
                  const dateStr = isNaN(d) ? '—' : d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
                  const amtStr = '-' + (r.type==='lb' ? moneyUSD(r.balance) : money(r.balance));
                  return `<div class="dv5-tx-row" onclick="${r.type==='pro'?`editPro(${r.id})`:`editLB(${r.id})`}">
                    <div class="dv5-tx-date">${dateStr}</div>
                    <div class="dv5-tx-info">
                      <div class="dv5-tx-name">${h(r.name)} — Balance Due</div>
                      <div class="dv5-tx-status" style="color:#6b7280">${h(r.company||'—')} · ${h(r.stage||'—')}</div>
                    </div>
                    <div class="dv5-tx-amt" style="color:#dc2626">${amtStr}</div>
                    <button class="dv5-tx-arrow" onclick="event.stopPropagation();${r.type==='pro'?`editPro(${r.id})`:`editLB(${r.id})`}"><i class="ti ti-chevron-right"></i></button>
                  </div>`;
                }).join('') : '<div class="dv5-empty" style="padding:32px">No outstanding balances.</div>')
            }
          </div>
        </div>
      </div>`;
  }
  window.renderFinancePage = renderFinance;

  // ── 6. DOCUMENTS ──────────────────────────────────────────
  const DOC_CHECKLIST_PRO = ['Passport','Offer Letter','Medical Cert','MOL','Visa','Ticket'];
  const DOC_CHECKLIST_LB  = ['National ID','Birth Certificate','Parent ID','Photo','Passport Copy'];

  // Doc ticks stored in localStorage keyed as "type_id_docname"
  let docTicks = JSON.parse(safeLocalGet('dreco_doc_ticks') || '{}');
  function saveDocTicks() { try { localStorage.setItem('dreco_doc_ticks', JSON.stringify(docTicks)); } catch(e){} }
  window.toggleDocTick = function(type, id, docName) {
    const key = `${type}_${id}_${docName}`;
    docTicks[key] = !docTicks[key];
    saveDocTicks();
    renderDocuments();
  };

  function docChecklist(r) {
    const items = r.type==='pro' ? DOC_CHECKLIST_PRO : DOC_CHECKLIST_LB;
    const got = new Set();
    if (r.type==='pro') {
      if (r.pp)      got.add('Passport');
      if (r.ol)      got.add('Offer Letter');
      if (r.medical) got.add('Medical Cert');
      if (r.mol)     got.add('MOL');
      if (r.visa)    got.add('Visa');
      if (r.travel)  got.add('Ticket');
    } else {
      const rid = r.id;
      if (allDocs?.[`lb_${rid}_id`])         got.add('National ID');
      if (allDocs?.[`lb_${rid}_birth`])       got.add('Birth Certificate');
      if (allDocs?.[`lb_${rid}_parent_id`])   got.add('Parent ID');
      if (allDocs?.[`lb_${rid}_photo`])       got.add('Photo');
      if (allDocs?.[`lb_${rid}_passport`])    got.add('Passport Copy');
    }
    // merge manual ticks
    items.forEach(doc => { if (docTicks[`${r.type}_${r.id}_${doc}`]) got.add(doc); });
    const done = items.filter(i=>got.has(i)).length;
    return { items, got, done, total: items.length, pct: Math.round(done/items.length*100) };
  }

  let docsView = 'list'; // 'list' | 'gaps'
  window.setDocsView = v => { docsView = v; renderDocuments(); };

  function renderDocuments() {
    const el = document.getElementById('documents-section'); if (!el) return;
    const isPro = jobTypeTab === 'pro';
    const lbBase = lbCountryFilter ? (lbDB||[]).filter(r=>(r.country||'')=== lbCountryFilter) : (lbDB||[]);
    const rawRows = isPro ? (proDB||[]).map(r=>({...r,type:'pro'})) : lbBase.map(r=>({...r,type:'lb'}));
    const rows = rawRows;
    const complete = rows.filter(r=>{ const c=docChecklist(r); return c.done===c.total; }).length;
    const partial  = rows.filter(r=>{ const c=docChecklist(r); return c.done>0&&c.done<c.total; }).length;
    const missing  = rows.filter(r=>docChecklist(r).done===0).length;
    // Build gap data: for each doc type, which candidates are missing it
    const docTypes = isPro
      ? ['Passport','Offer Letter','Medical','MOL','Visa','Travel Ticket']
      : ['National ID','Birth Certificate','Parent ID','Photo','Passport Copy'];
    const gapData = docTypes.map(type => {
      const missing = rows.filter(r => {
        const cl = docChecklist(r);
        return !cl.got.has(type);
      });
      return {type, missing, total: rows.length};
    });

    const viewToggle = `<div style="display:flex;gap:6px">
      <button class="dv5-btn${docsView==='list'?' active':''}" onclick="setDocsView('list')"><i class="ti ti-list"></i>List</button>
      <button class="dv5-btn${docsView==='gaps'?' active':''}" onclick="setDocsView('gaps')"><i class="ti ti-alert-triangle"></i>Gaps</button>
    </div>`;

    const gapHTML = `<div class="dv5-card">
      <div class="dv5-card-head"><span class="dv5-card-title">Missing Documents by Type</span><span class="dv5-card-sub">${rows.length} candidates</span></div>
      ${gapData.map(g => {
        const pct = rows.length ? Math.round((g.missing.length/rows.length)*100) : 0;
        return `<div style="padding:10px 16px;border-bottom:1px solid var(--border,#f0f1f3)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:13px;font-weight:700">${h(g.type)}</span>
            <span class="dv5-pill ${g.missing.length?'red':'green'}">${g.missing.length} missing</span>
          </div>
          <div style="height:5px;background:#f3f4f6;border-radius:999px;overflow:hidden;margin-bottom:6px">
            <div style="width:${pct}%;height:100%;background:${pct>50?'#EF4444':pct>0?'#F59E0B':'#22c55e'};border-radius:999px"></div>
          </div>
          ${g.missing.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px">${g.missing.map(r=>`<button class="dv5-action-btn" onclick="openCandidateProfile('${r.type}',${r.id})" style="font-size:11px">${h(r.name)}</button>`).join('')}</div>` : `<div style="font-size:11px;color:#16a34a">All candidates have this document</div>`}
        </div>`;
      }).join('')}
    </div>`;

    el.innerHTML = `
      <div class="dv5-page">
        <div class="dv5-page-head">
          <div><h1>Documents</h1><p>${isPro?'Professional — passport, offer letter, MOL, visa, travel.':'General Jobs — ID, birth cert, photo, passport copy.'}</p></div>
          <div class="dv5-head-actions">
            ${jobTypeTabs()}
            ${viewToggle}
            <button class="dv5-btn primary" onclick="switchTab('candidates')"><i class="ti ti-paperclip"></i>Attach to Candidate</button>
          </div>
        </div>
        ${!isPro ? lbCountryBar(lbDB||[]) : ''}
        <div class="dv5-file-grid">
          ${fileCard('ti-file-description', '#2563EB', '#2563EB', 'Drive Links', Object.values(allDocs||{}).filter(Boolean).length, rows.length, `${Object.values(allDocs||{}).filter(Boolean).length} of ${rows.length} uploaded`, "switchTab('documents')")}
          ${fileCard('ti-folder-check',     '#059669', '#059669', 'Complete Docs', complete, rows.length, `All documents present`, "switchTab('documents')")}
          ${fileCard('ti-id',               '#D97706', '#F59E0B', 'Passports', rows.filter(r=>r.pp).length, rows.length, `Passport numbers recorded`, "switchTab('documents')")}
          ${fileCard('ti-folder-x',         '#DC2626', '#EF4444', 'Missing',  missing, rows.length, `No documents yet`, "switchTab('documents')")}
        </div>
        ${docsView==='gaps' ? gapHTML : `<div class="dv5-table-card">
          <div class="dv5-table-wrap">
            <table class="dv5-table">
              <thead><tr><th>Candidate</th><th>Type</th><th>Company</th><th>Passport</th><th>Checklist</th><th>Progress</th><th>Drive Link</th><th>Action</th></tr></thead>
              <tbody>
                ${rows.map(r => {
                  const cl = docChecklist(r);
                  const link = docLink(r);
                  const safeLink = safeUrl(link);
                  const bar = `<div style="display:flex;align-items:center;gap:6px">
                    <div style="flex:1;height:6px;background:#eef1f6;border-radius:999px;overflow:hidden">
                      <div style="width:${cl.pct}%;height:100%;background:${cl.pct===100?'#16a34a':cl.pct>0?'#5347CE':'#e5e7eb'};border-radius:999px"></div>
                    </div>
                    <span style="font-size:10px;font-weight:700;color:#6b7280;white-space:nowrap">${cl.done}/${cl.total}</span>
                  </div>`;
                  const chips = cl.items.map(item=>{
                    const have = cl.got.has(item);
                    return `<button onclick="event.stopPropagation();window.toggleDocTick('${r.type}',${JSON.stringify(r.id)},'${js(item)}')"
                      style="font-size:9px;padding:2px 6px;border-radius:4px;border:1px solid ${have?'#86efac':'#fca5a5'};background:${have?'#dcfce7':'#fee2e2'};color:${have?'#15803d':'#b91c1c'};cursor:pointer;display:inline-flex;align-items:center;gap:3px">
                      ${have?'<i class="ti ti-check" style="font-size:8px"></i>':'<i class="ti ti-square" style="font-size:8px"></i>'}${item}</button>`;
                  }).join('');
                  return `<tr onclick="openCandidateProfile('${r.type}',${r.id})">
                    <td><div class="dv5-name-cell">${avatar(r.name)}<div>
                      <div class="dv5-name">${h(r.name)}</div>
                      <div class="dv5-sub">${h(r.phone||'—')}</div>
                    </div></div></td>
                    <td>${r.type==='pro'?'Professional':'General'}</td>
                    <td>${h(r.company)}</td>
                    <td>${h(r.pp||'—')}</td>
                    <td><div style="display:flex;flex-wrap:wrap;gap:3px">${chips}</div></td>
                    <td style="min-width:120px">${bar}</td>
                    <td>${safeLink?`<button class="dv5-action-btn" onclick="event.stopPropagation();window.open('${h(safeLink)}','_blank')"><i class="ti ti-external-link"></i>Open</button>`:'—'}</td>
                    <td><button class="dv5-action-btn" onclick="event.stopPropagation();openDocs('${r.type}',${JSON.stringify(r.id)},'${js(r.name)}')">Manage</button></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>`}
      </div>`;
  }
  window.renderDocumentsPage = renderDocuments;

  // ── 7. REPORTS ────────────────────────────────────────────
  function renderReports() {
    const el = document.getElementById('reports-section'); if (!el) return;
    const isPro = jobTypeTab === 'pro';
    const allReportRows = allRows();
    const lbBase = lbCountryFilter ? allReportRows.filter(r=>r.type==='lb'&&(r.country||'')===lbCountryFilter) : allReportRows.filter(r=>r.type==='lb');
    const rows = isPro ? allReportRows.filter(r=>r.type==='pro') : lbBase;
    const fmt2 = v => isPro ? money(v) : moneyUSD(v);
    const total = rows.reduce((s,r)=>s+r.commission,0);
    const paid  = rows.reduce((s,r)=>s+r.paid,0);
    const stageCounts = {};
    rows.forEach(r => stageCounts[r.stage] = (stageCounts[r.stage]||0)+1);
    const travelled = rows.filter(r=>String(r.stage).toUpperCase()==='TRAVELLED');

    // Pro: top jobs by position
    const jobCounts = {};
    if (isPro) {
      rows.forEach(r => {
        if (r.position) { jobCounts[r.position] = jobCounts[r.position]||{count:0,travelled:0,commission:0}; jobCounts[r.position].count++; if(r.stage==='TRAVELLED') jobCounts[r.position].travelled++; jobCounts[r.position].commission+=Number(r.commission)||0; }
      });
    }
    const topJobs = Object.entries(jobCounts).sort((a,b)=>b[1].count-a[1].count).slice(0,5);

    // General: top countries
    const countryCounts = {};
    if (!isPro) {
      lbBase.forEach(r => {
        const c = r.country||'Unknown';
        countryCounts[c] = countryCounts[c]||{count:0,travelled:0,toRefund:0};
        countryCounts[c].count++; if(r.stage==='TRAVELLED') countryCounts[c].travelled++; countryCounts[c].toRefund+=Number(r.commission)||0;
      });
    }
    const topCountries = Object.entries(countryCounts).sort((a,b)=>b[1].count-a[1].count).slice(0,5);

    // Avg processing (Pro: intake→travel; LB: submit→travel)
    let avgProcessing = '—';
    if (isPro) {
      const withDates = (proDB||[]).filter(r => r.stage==='TRAVELLED' && r.travel && (r.intake||r.created||r.createdAt));
      if (withDates.length) { const avg = Math.round(withDates.reduce((s,r)=>s+Math.max(0,(new Date(r.travel)-new Date(r.intake||r.created||r.createdAt))/86400000),0)/withDates.length); avgProcessing = avg>0?avg+' days':'—'; }
    } else {
      const withDates = lbBase.filter(r=>r.stage==='TRAVELLED'&&r.travelDate&&r.created_at);
      if (withDates.length) { const avg = Math.round(withDates.reduce((s,r)=>s+Math.max(0,(new Date(r.travelDate)-new Date(r.created_at))/86400000),0)/withDates.length); avgProcessing = avg>0?avg+' days':'—'; }
    }

    // Clients for this type
    const cMap2 = new Map();
    rows.forEach(r => { const n=r.company||'Unassigned'; const c=cMap2.get(n)||{name:n,country:r.country||'—',total:0,due:0}; c.total++;c.due+=r.balance;cMap2.set(n,c); });
    const topClients2 = [...cMap2.values()].sort((a,b)=>b.total-a.total).slice(0,8);

    // Monthly placements chart (last 12 months)
    const last12 = Array.from({length:12},(_,i)=>{ const d=new Date(now.getFullYear(),now.getMonth()-11+i,1); return {label:d.toLocaleString('default',{month:'short'})+' '+d.getFullYear().toString().slice(2),y:d.getFullYear(),m:d.getMonth(),count:0}; });
    rows.forEach(r=>{
      if(String(r.stage||'').toUpperCase()!=='TRAVELLED') return;
      const travelField = isPro ? (r.raw?.travel||r.travel) : (r.travelDate||r.travel_date);
      const d=travelField?new Date(travelField):null; if(!d||isNaN(d)) return;
      const slot=last12.find(s=>s.y===d.getFullYear()&&s.m===d.getMonth()); if(slot) slot.count++;
    });
    const chartMax=Math.max(...last12.map(s=>s.count),1);
    const monthlyChart=`<div style="display:flex;align-items:flex-end;gap:4px;height:100px;padding-bottom:4px">
      ${last12.map(s=>{const pct=Math.max(Math.round(s.count/chartMax*100),s.count>0?5:2);return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;height:100%;justify-content:flex-end;position:relative">
        <span style="font-size:9px;font-weight:800;color:#5347CE;position:absolute;bottom:calc(${pct}% + 2px)">${s.count||''}</span>
        <div style="width:100%;border-radius:4px 4px 2px 2px;background:linear-gradient(180deg,#5347CE,#9B8CFF);height:${pct}%;min-height:2px" title="${s.count} placements"></div>
        <span style="font-size:9px;color:#999;font-weight:700;writing-mode:vertical-lr;transform:rotate(180deg);height:28px;white-space:nowrap">${s.label}</span>
      </div>`}).join('')}
    </div>`;

    // Avg days per stage (Pro only)
    let stageTimeHTML = '';
    if (isPro) {
      const stageFields = [
        ['SUBMITTED→INTERVIEW',    r=>r.interview&&r.submitted,      r=>(new Date(r.interview)-new Date(r.submitted))/86400000],
        ['INTERVIEW→OFFER',        r=>r.ol&&r.interview,             r=>(new Date(r.ol)-new Date(r.interview))/86400000],
        ['OFFER→MEDICAL',          r=>r.medical&&r.ol,               r=>(new Date(r.medical)-new Date(r.ol))/86400000],
        ['MEDICAL→MOL',            r=>r.mol&&r.medical,              r=>(new Date(r.mol)-new Date(r.medical))/86400000],
        ['MOL→VISA',               r=>r.visa&&r.mol,                 r=>(new Date(r.visa)-new Date(r.mol))/86400000],
        ['VISA→TRAVEL',            r=>r.travel&&r.visa,              r=>(new Date(r.travel)-new Date(r.visa))/86400000],
      ];
      const stageTimes = stageFields.map(([label,filter,calc])=>{
        const subset=(proDB||[]).filter(r=>{ try{return filter(r)&&!isNaN(new Date(r.travel||r.visa||r.ol||r.submitted))}catch{return false;}});
        const vals=subset.map(r=>{try{return calc(r);}catch{return 0;}}).filter(v=>v>0&&v<365);
        const avg=vals.length?Math.round(vals.reduce((s,v)=>s+v,0)/vals.length):null;
        return {label,avg,n:vals.length};
      });
      stageTimeHTML=`<div class="dv5-card" style="margin-top:16px">
        <div class="dv5-card-head"><span class="dv5-card-title">Average Days Per Stage</span><span class="dv5-card-sub">Professional placements</span></div>
        <div class="dv5-table-wrap"><table class="dv5-table">
          <thead><tr><th>Stage Transition</th><th>Avg Days</th><th>Sample Size</th></tr></thead>
          <tbody>${stageTimes.map(s=>`<tr><td>${h(s.label)}</td><td>${s.avg!=null?s.avg+' days':'—'}</td><td>${s.n} candidates</td></tr>`).join('')}</tbody>
        </table></div>
      </div>`;
    }

    el.innerHTML = `
      <div class="dv5-page">
        <div class="dv5-page-head">
          <div><h1>Reports</h1><p>${isPro?'Professional performance — KES commissions.':'General Jobs performance — USD refunds.'}</p></div>
          <div class="dv5-head-actions">
            ${jobTypeTabs()}
            <button class="dv5-btn" onclick="exportCSV('${isPro?'pro':'lb'}')"><i class="ti ti-download"></i>Export</button>
          </div>
        </div>
        ${!isPro ? lbCountryBar(lbDB||[]) : ''}
        <div class="dv5-stat-grid" style="margin-top:12px">
          ${statCard('ti-users',     rows.length,       isPro?'Professional':'General Jobs',`Total candidates`,                             '#EFF6FF','#2563EB','#fff')}
          ${statCard('ti-plane',     travelled.length,  'Travelled',        `Successful placements`,                                       '#F0FDF4','#16A34A','#fff')}
          ${statCard('ti-target',    rows.length?Math.round(travelled.length/rows.length*100)+'%':'0%','Success Rate','Travelled / total', '#F5F3FF','#7C3AED','#fff')}
          ${statCard('ti-chart-line',total?Math.round(paid/total*100)+'%':'0%',isPro?'Collection Rate':'Refund Rate',isPro?'Finance health':'Refunds collected','#FFFBEB','#D97706','#fff')}
          ${statCard('ti-clock',     avgProcessing,     'Avg Processing',   'Submission → travel',                                        '#F0FDFA','#0D9488','#fff')}
        </div>
        <div class="dv5-card" style="margin-top:16px">
          <div class="dv5-card-head"><span class="dv5-card-title">Monthly Placements (Last 12 Months)</span></div>
          <div style="padding:12px 16px 0">${monthlyChart}</div>
        </div>
        <div class="dv5-two-col" style="margin-top:16px">
          <div class="dv5-card">
            <div class="dv5-card-head"><span class="dv5-card-title">Candidates by Stage</span></div>
            <div class="dv5-task-list">
              ${Object.entries(stageCounts).map(([s,c]) => `
                <div class="dv5-task-item">
                  <div class="dv5-task-icon med"><i class="ti ti-chart-pie"></i></div>
                  <div class="dv5-task-body">
                    <div class="dv5-task-title">${h(s)}</div>
                    <div class="dv5-task-meta">${c} candidates</div>
                  </div>
                  <span class="dv5-pill">${Math.round(c/Math.max(rows.length,1)*100)}%</span>
                </div>`).join('')}
            </div>
          </div>
          <div class="dv5-card">
            <div class="dv5-card-head"><span class="dv5-card-title">Top ${isPro?'Companies':'Countries'}</span></div>
            <div class="dv5-task-list">
              ${isPro ? (topClients2.length ? topClients2.map(c=>`
                <div class="dv5-task-item" onclick="setCandidateSearch('${js(c.name)}');switchTab('candidates')" style="cursor:pointer">
                  <div class="dv5-task-icon med"><i class="ti ti-building"></i></div>
                  <div class="dv5-task-body">
                    <div class="dv5-task-title">${h(c.name)}</div>
                    <div class="dv5-task-meta">${c.total} candidates · ${fmt2(c.due)} due</div>
                  </div>
                  <span class="dv5-pill">${h(c.country)}</span>
                </div>`).join('') : '<div class="dv5-empty">No company data yet.</div>')
              : (topCountries.length ? topCountries.map(([country,d])=>`
                <div class="dv5-task-item" onclick="window.setLbCountry('${js(country)}')" style="cursor:pointer">
                  <div class="dv5-task-icon med"><i class="ti ti-globe"></i></div>
                  <div class="dv5-task-body">
                    <div class="dv5-task-title">${h(country)}</div>
                    <div class="dv5-task-meta">${d.count} candidates · ${d.travelled} travelled · ${moneyUSD(d.toRefund)} refund</div>
                  </div>
                  <span class="dv5-pill">${Math.round(d.travelled/Math.max(d.count,1)*100)}%</span>
                </div>`).join('') : '<div class="dv5-empty">No country data yet.</div>')}
            </div>
          </div>
        </div>
        ${isPro ? `<div class="dv5-card" style="margin-top:16px">
          <div class="dv5-card-head"><span class="dv5-card-title">Top Performing Jobs</span></div>
          <div class="dv5-table-wrap">
            <table class="dv5-table">
              <thead><tr><th>#</th><th>Position</th><th>Candidates</th><th>Travelled</th><th>Success Rate</th><th>Commission</th></tr></thead>
              <tbody>
                ${topJobs.length ? topJobs.map(([pos,d],i)=>`<tr>
                  <td>${i+1}</td><td>${h(pos)}</td><td>${d.count}</td><td>${d.travelled}</td>
                  <td>${d.count?Math.round(d.travelled/d.count*100)+'%':'—'}</td><td>${money(d.commission)}</td>
                </tr>`).join('') : '<tr><td colspan="6"><div class="dv5-empty">No job data yet.</div></td></tr>'}
              </tbody>
            </table>
          </div>
        </div>${stageTimeHTML}` : ''}
      </div>`;
  }
  window.renderReportsPage = renderReports;

  // ── 8. CLIENTS ────────────────────────────────────────────
  let expandedClient = null;

  function renderClients() {
    const el = document.getElementById('clients-section'); if (!el) return;
    const isPro = jobTypeTab === 'pro';
    const lbBase = lbCountryFilter ? (lbDB||[]).filter(r=>(r.country||'')=== lbCountryFilter) : (lbDB||[]);
    const sourceRows = isPro ? (proDB||[]).map(r=>({...r,type:'pro'})) : lbBase.map(r=>({...r,type:'lb'}));
    const fmt2 = v => isPro ? money(v) : moneyUSD(v);

    // Build clients from sourceRows only
    const cMap = new Map();
    sourceRows.forEach(r => {
      const name = isPro ? (r.company || 'Unassigned') : (r.country || r.company || 'Unassigned');
      const stage = String(r.stage||r.travelStatus||r.travel_status||'').toUpperCase();
      const paid = isPro ? (Number(r.paid)||0) : (Number(r.r1Amt||r.r1_amt)||0)+(Number(r.r2Amt||r.r2_amt)||0);
      const bal  = isPro ? (Number(r.balance)||0) : balLB(r);
      const isFinished = isPro ? stage==='TRAVELLED' : LB_TRAVELLED_STAGES.has(stage);
      const c = cMap.get(name) || { name, country: r.country||'—', active:0, total:0, due:0, paid:0, manager: currentUser?.display||'Team' };
      c.total++;
      if (!isFinished) c.active++;
      c.due  += bal;
      c.paid += paid;
      cMap.set(name, c);
    });
    const clients = [...cMap.values()].sort((a,b)=>b.total-a.total);

    function clientCandidates(name) {
      const cands = sourceRows.filter(r=>(isPro?(r.company||'Unassigned'):(r.country||r.company||'Unassigned'))===name);
      if (isPro) return cands;
      return cands.map(r=>({
        ...r,
        commission: Number(r.toRefund||r.to_refund)||0,
        paid: (Number(r.r1Amt||r.r1_amt)||0)+(Number(r.r2Amt||r.r2_amt)||0),
        balance: balLB(r),
      }));
    }

    el.innerHTML = `
      <div class="dv5-page">
        <div class="dv5-page-head">
          <div><h1>Clients</h1><p>${isPro?'Professional clients — commissions in KES.':'General Jobs clients — refunds in USD.'}</p></div>
          <div class="dv5-head-actions">
            ${jobTypeTabs()}
            <button class="dv5-btn primary" onclick="${isPro?'openProForm()':'openLBForm()'}"><i class="ti ti-plus"></i>Add Candidate</button>
          </div>
        </div>
        ${!isPro ? lbCountryBar(lbDB||[]) : ''}
        <div class="dv5-stat-grid" style="margin-top:12px">
          ${statCard('ti-building',  clients.length,                              'Total Clients', `Employer companies`,    '#EFF6FF','#2563EB','#fff')}
          ${statCard('ti-briefcase', clients.reduce((s,c)=>s+c.active,0),        'Active Jobs',   `In-progress`,           '#F5F3FF','#7C3AED','#fff')}
          ${statCard('ti-users',     clients.reduce((s,c)=>s+c.total,0),         'Total Hired',   `All-time candidates`,   '#F0FDF4','#16A34A','#fff')}
          ${statCard('ti-coin',      fmt2(clients.reduce((s,c)=>s+c.due,0)),     'Outstanding',   `Total due`,             '#FEF2F2','#DC2626','#fff')}
          ${statCard('ti-wallet',    fmt2(clients.reduce((s,c)=>s+c.paid,0)),    'Collected',     `Total paid`,            '#FEF9C3','#A16207','#fff')}
        </div>
        <div class="dv5-table-card">
          <div class="dv5-table-wrap">
            <table class="dv5-table">
              <thead><tr><th></th><th>Client Name</th><th>Country</th><th>Active</th><th>Total</th><th>Outstanding</th><th>Collected</th><th>Manager</th></tr></thead>
              <tbody>
                ${clients.length ? clients.map(c => {
                  const isOpen = expandedClient === c.name;
                  const cands  = isOpen ? clientCandidates(c.name) : [];
                  return `
                  <tr class="dv5-client-row${isOpen?' dv5-client-open':''}" onclick="window._toggleClient('${js(c.name)}')" style="cursor:pointer">
                    <td style="width:28px"><i class="ti ${isOpen?'ti-chevron-down':'ti-chevron-right'}" style="font-size:12px;color:#9ca3af"></i></td>
                    <td><div class="dv5-name-cell">
                      <div class="dv5-avatar" style="background:#EEF2FF;color:#4338CA"><i class="ti ti-building" style="font-size:13px"></i></div>
                      <div>
                        <div class="dv5-name">${h(c.name)}</div>
                        <div class="dv5-sub">${h(c.country||'—')}</div>
                      </div>
                    </div></td>
                    <td>${h(c.country||'—')}</td>
                    <td>${c.active}</td>
                    <td>${c.total}</td>
                    <td>${c.due>0?`<strong style="color:#b91c1c">${fmt2(c.due)}</strong>`:fmt2(0)}</td>
                    <td>${fmt2(c.paid)}</td>
                    <td>${h(c.manager||'—')}</td>
                  </tr>
                  ${isOpen ? `<tr class="dv5-expand-row"><td colspan="8" style="padding:0 0 8px 40px;background:#f8fafc">
                    <table class="dv5-table" style="min-width:0;border:0;box-shadow:none">
                      <thead><tr><th>Name</th><th>${isPro?'Job Title':'Country'}</th><th>Stage</th><th>Submitted</th><th>Invoice</th><th>Balance</th><th></th></tr></thead>
                      <tbody>
                        ${cands.map(r=>`<tr>
                          <td>${h(r.name)}</td>
                          <td>${h(isPro?r.position:r.country)}</td>
                          <td>${badge(r.stage||r.travelStatus||r.travel_status)}</td>
                          <td>${h(fmt(r.submitted_date||r.submitted||r.travelDate||r.travel_date))}</td>
                          <td>${fmt2(r.commission||0)}</td>
                          <td>${r.balance>0?`<strong style="color:#b91c1c">${fmt2(r.balance)}</strong>`:fmt2(0)}</td>
                          <td><button class="dv5-action-btn" onclick="event.stopPropagation();openCandidateProfile('${r.type}',${r.id})">View</button></td>
                        </tr>`).join('')}
                      </tbody>
                    </table>
                  </td></tr>` : ''}`;
                }).join('') : '<tr><td colspan="8"><div class="dv5-empty">Clients appear automatically when you add candidates with company names.</div></td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  }
  window._toggleClient = function(name) {
    expandedClient = expandedClient === name ? null : name;
    renderClients();
  };
  window.renderClientsPage = renderClients;

  // ── 9. SETTINGS (pass-through to existing) ────────────────
  function renderSettings() {
    if (typeof renderSettingsPage === 'function') renderSettingsPage();
  }

  // ── CANDIDATE PROFILE MODAL ───────────────────────────────
  function ensureProfileModal() {
    if (document.getElementById('dv5-profile-modal')) return;
    const div = document.createElement('div');
    div.id = 'dv5-profile-modal';
    div.className = 'dv5-modal-overlay';
    div.onclick = e => { if (e.target===div) closeProfile(); };
    document.body.appendChild(div);
  }

  window.openCandidateProfile = function(type, id) {
    ensureProfileModal();
    const modal = document.getElementById('dv5-profile-modal');
    const r = allRows().find(x => x.type===type && String(x.id)===String(id));
    if (!r) return;
    const cl = buildChecklist(r);
    const pct = checklistPct(r);
    const timeline = (allTimelines?.[`${type}_${id}`]||[]).slice(-5).reverse();
    const link = docLink(r);
    const safeLink = safeUrl(link);
    const proStageList = (proStages && proStages.length ? proStages : ['SUBMITTED','INTERVIEW','OFFER LETTER','MEDICAL & ATTESTATION','MOL','VISA','PENDING TRAVEL','TRAVELLED']);
    const lbStageList  = lbStages && lbStages.length ? lbStages : ['DOCS SUBMITTED','PROFILE SENT','SELECTED','PASSPORT APPLIED','VISA PROCESSING','TRAVELLED','REFUND PENDING','REFUND COMPLETE'];
    const stages = type==='pro'
      ? ['Submitted','Interview','Offer Letter','Medical','MOL','Visa','Travel','Travelled']
      : ['Docs In','Profile Sent','Selected','Passport','Visa','Travelled','Refund','Done'];
    const stageListRef = type==='pro' ? proStageList : lbStageList;
    const stageIdx = stageListRef.indexOf(r.stage);

    modal.innerHTML = `
      <div class="dv5-profile-panel">
        <div class="dv5-profile-head">
          <div class="dv5-profile-id">${r.type==='pro'?'Professional':'General'} Candidate</div>
          <div class="dv5-profile-actions">
            <button class="dv5-btn" onclick="${r.type==='pro'?`editPro(${r.id})`:`editLB(${r.id})`}"><i class="ti ti-edit"></i>Edit</button>
            <button class="dv5-btn primary" onclick="openDocs('${r.type}',${JSON.stringify(r.id)},'${js(r.name)}')"><i class="ti ti-paperclip"></i>Documents</button>
            <button class="dv5-btn-icon" onclick="closeProfile()" title="Close"><i class="ti ti-x"></i></button>
          </div>
        </div>
        <div class="dv5-profile-hero">
          <div class="dv5-profile-avatar">${h(ini(r.name))}</div>
          <div class="dv5-profile-info">
            <h2>${h(r.name)}</h2>
            <p>${h(r.position)} · ${h(r.company)}</p>
            <div class="dv5-profile-meta">
              <span><i class="ti ti-map-pin"></i>${h(r.country||'—')}</span>
              <span><i class="ti ti-id"></i>${h(r.pp||'No passport')}</span>
              <span><i class="ti ti-phone"></i>${h(r.phone||'No phone')}</span>
            </div>
          </div>
          <div class="dv5-profile-stage">
            ${badge(r.stage)}
            <small>Next: ${h(nextAction(r))}</small>
          </div>
        </div>
        <div class="dv5-progress-steps">
          ${stages.map((s,i) => `
            <div class="dv5-step ${i<stageIdx?'done':i===stageIdx?'active':''}">
              <span>${i+1}</span><small>${h(s)}</small>
            </div>`).join('')}
        </div>
        <div class="dv5-profile-grid">
          <div class="dv5-card">
            <div class="dv5-card-head">
              <span class="dv5-card-title">Stage Checklist</span>
              <span class="dv5-card-sub">${pct}%</span>
            </div>
            <div style="height:4px;background:#f0f0f0;border-radius:2px;margin:0 0 12px">
              <div style="height:100%;width:${pct}%;background:${pct===100?'#22A06B':'#5347CE'};border-radius:2px;transition:width .4s"></div>
            </div>
            ${cl.map(x => {
              if (x.done) return `
                <div class="dv5-check-row done" style="opacity:.7">
                  <i class="ti ti-circle-check-filled" style="color:#22A06B;font-size:18px;flex-shrink:0"></i>
                  <span style="text-decoration:line-through;flex:1">${h(x.label)}</span>
                  ${x.action && x.action!=='edit' ? `<button onclick="window.checklistUntick('${type}',${JSON.stringify(id)},'${js(x.label)}')" style="font-size:11px;padding:2px 7px;border-radius:4px;border:1px solid #e4e4e7;background:transparent;color:#9ca3af;cursor:pointer;flex-shrink:0">Undo</button>` : ''}
                </div>`;
              if (x.action === 'docs') return `
                <button class="dv5-check-row clickable" onclick="openDocs('${type}',${JSON.stringify(id)},'${js(r.name)}')" style="width:100%;text-align:left;background:none;border:none;cursor:pointer">
                  <i class="ti ti-circle" style="color:#d1d5db;font-size:18px;flex-shrink:0"></i>
                  <span>${h(x.label)}</span>
                  <span class="dv5-check-hint">Upload →</span>
                </button>`;
              if (x.action === 'edit') return `
                <button class="dv5-check-row clickable" onclick="${type==='pro'?`editPro(${id})`:`editLB(${id})`}" style="width:100%;text-align:left;background:none;border:none;cursor:pointer">
                  <i class="ti ti-circle" style="color:#d1d5db;font-size:18px;flex-shrink:0"></i>
                  <span>${h(x.label)}</span>
                  <span class="dv5-check-hint">Enter amount →</span>
                </button>`;
              return `
                <button class="dv5-check-row clickable" onclick="window.checklistTick('${type}',${JSON.stringify(id)},'${js(x.label)}')" style="width:100%;text-align:left;background:none;border:none;cursor:pointer">
                  <i class="ti ti-circle" style="color:#d1d5db;font-size:18px;flex-shrink:0"></i>
                  <span>${h(x.label)}</span>
                  <span class="dv5-check-hint">Mark done ✓</span>
                </button>`;
            }).join('')}
          </div>
          <div class="dv5-card">
            <div class="dv5-card-head"><span class="dv5-card-title">Details</span></div>
            <div class="dv5-detail-grid">
              <span>${type==='pro'?'Submitted':'Doc Date'}</span><strong>${h(fmt(r.submitted||r.travelDate))}</strong>
              <span>Stage</span><strong>${h(r.stage)}</strong>
              <span>${type==='pro'?'Company':'Country'}</span><strong>${h(r.company||r.country||'—')}</strong>
              ${type==='pro' && r.raw?.ol     ? `<span>Offer Letter</span><strong>${h(fmt(r.raw.ol))}</strong>` : ''}
              ${type==='pro' && r.raw?.medical? `<span>Medical</span><strong>${h(fmt(r.raw.medical))}</strong>` : ''}
              ${type==='pro' && r.raw?.mol    ? `<span>MOL Date</span><strong>${h(fmt(r.raw.mol))}</strong>` : ''}
              ${type==='pro' && r.raw?.visa   ? `<span>Visa Date</span><strong>${h(fmt(r.raw.visa))}</strong>` : ''}
              ${r.travel ? `<span>Travel Date</span><strong>${h(fmt(r.travel))}</strong>` : ''}
            </div>
          </div>
          <div class="dv5-card">
            <div class="dv5-card-head"><span class="dv5-card-title">Finance</span></div>
            <div class="dv5-detail-grid">
              <span>${type==='pro'?'Commission':'To Refund'}</span><strong>${type==='pro'?money(r.commission):moneyUSD(r.commission)}</strong>
              <span>Paid</span><strong>${type==='pro'?money(r.paid):moneyUSD(r.paid)}</strong>
              <span>Balance</span><strong style="color:${r.balance>0?'#B83232':'#22A06B'}">${type==='pro'?money(r.balance):moneyUSD(r.balance)}</strong>
              <span>Documents</span><strong>${link?'Uploaded':'Missing'}</strong>
            </div>
            ${safeLink?`<div style="margin-top:12px">
              <button class="dv5-btn" onclick="window.open('${h(safeLink)}','_blank')">
                <i class="ti ti-external-link"></i>Open Document
              </button>
            </div>`:''}
          </div>
        </div>
        <div class="dv5-card" style="margin-top:0">
          <div class="dv5-card-head"><span class="dv5-card-title">Recent Activity</span></div>
          <div class="dv5-activity-list">
            ${timeline.length ? timeline.map(t=>`
              <div class="dv5-activity-item">
                <div class="dv5-activity-icon"><i class="ti ti-clock"></i></div>
                <div>
                  <div class="dv5-activity-title">${h(t.action||t.text||'Updated')}</div>
                  <div class="dv5-activity-meta">${h(t.user||'Dreco')} · ${h(fmt(t.ts||t.at||''))}</div>
                </div>
              </div>`).join('') : '<div class="dv5-empty">No activity recorded yet.</div>'}
          </div>
        </div>
      </div>`;
    modal.style.display = 'flex';
  };

  window.closeProfile = function() {
    const m = document.getElementById('dv5-profile-modal');
    if (m) m.style.display = 'none';
  };

  // Map checklist label → {field to set today, stage to advance to}
  const PRO_CHECKLIST_MAP = {
    'Interview done':       { field:'interview', stage:'INTERVIEW' },
    'Offer letter received':{ field:'ol',        stage:'OFFER LETTER' },
    'Medical cleared':      { field:'medical',   stage:'MEDICAL & ATTESTATION' },
    'MOL submitted':        { field:'mol',       stage:'MOL' },
    'Visa stamped':         { field:'visa',      stage:'VISA' },
    'Ticket booked':        { field:'travel',    stage:'PENDING TRAVEL' },
  };
  const LB_CHECKLIST_STAGE_MAP = {
    'Profile Sent':    'PROFILE SENT',
    'Selected':        'SELECTED',
    'Passport Applied':'PASSPORT APPLIED',
    'Visa Processing': 'VISA PROCESSING',
    'Travelled':       'TRAVELLED',
  };

  window.checklistTick = async function(type, id, label) {
    const today = new Date().toISOString().slice(0,10);
    const db = type === 'pro' ? proDB : lbDB;
    const rec = db.find(r => String(r.id) === String(id));
    if (!rec) return;

    let updates = {};

    if (type === 'pro') {
      const map = PRO_CHECKLIST_MAP[label];
      if (!map) return;
      updates[map.field] = today;
      updates.stage = map.stage;
      rec[map.field] = today;
      rec.stage = map.stage;
    } else {
      const newStage = LB_CHECKLIST_STAGE_MAP[label];
      if (newStage) {
        updates.stage = newStage;
        rec.stage = newStage;
        if (newStage === 'TRAVELLED') { updates.travelDate = today; rec.travelDate = today; }
      } else {
        // doc tick
        docTicks[`lb_${id}_${label}`] = true;
        saveDocTicks();
        openCandidateProfile(type, id);
        return;
      }
    }

    // Optimistic UI update
    openCandidateProfile(type, id);
    showToast(`✓ ${label}`, 'success');

    // Save to Supabase
    try {
      const table = type === 'pro' ? 'pro_candidates' : 'lb_candidates';
      await dbUpdate(table, id, updates);
      addTimeline(type, id, `Checked: ${label}`);
    } catch(e) {
      console.warn('checklistTick save error', e);
    }

    // Refresh any open page
    rerenderPage();
  };

  window.checklistUntick = async function(type, id, label) {
    const db = type === 'pro' ? proDB : lbDB;
    const rec = db.find(r => String(r.id) === String(id));
    if (!rec) return;

    // LB doc ticks (localStorage only)
    const tickKey = `lb_${id}_${label}`;
    if (type === 'lb' && docTicks[tickKey]) {
      delete docTicks[tickKey];
      saveDocTicks();
      showToast(`Reverted: ${label}`, 'info');
      openCandidateProfile(type, id);
      return;
    }

    if (type === 'pro') {
      const map = PRO_CHECKLIST_MAP[label];
      if (!map) return;
      const proStageList = (proStages && proStages.length ? proStages : ['SUBMITTED','INTERVIEW','OFFER LETTER','MEDICAL & ATTESTATION','MOL','VISA','PENDING TRAVEL','TRAVELLED']);
      const idx = proStageList.indexOf(map.stage);
      const prevStage = idx > 0 ? proStageList[idx - 1] : proStageList[0];
      rec[map.field] = null;
      rec.stage = prevStage;
      showToast(`Reverted: ${label}`, 'info');
      openCandidateProfile(type, id);
      try {
        await dbUpdate('pro_candidates', id, { [map.field]: null, stage: prevStage });
        addTimeline(type, id, `Reverted: ${label}`);
      } catch(e) { console.warn('checklistUntick error', e); }
    } else {
      const targetStage = LB_CHECKLIST_STAGE_MAP[label];
      if (!targetStage) return;
      const lbStageList = (lbStages && lbStages.length ? lbStages : ['DOCS SUBMITTED','PROFILE SENT','SELECTED','PASSPORT APPLIED','VISA PROCESSING','TRAVELLED','REFUND PENDING','REFUND COMPLETE']);
      const idx = lbStageList.indexOf(targetStage);
      const prevStage = idx > 0 ? lbStageList[idx - 1] : lbStageList[0];
      rec.stage = prevStage;
      showToast(`Reverted: ${label}`, 'info');
      openCandidateProfile(type, id);
      try {
        await dbUpdate('lb_candidates', id, { stage: prevStage });
        addTimeline(type, id, `Reverted: ${label}`);
      } catch(e) { console.warn('checklistUntick error', e); }
    }
    rerenderPage();
  };

  // ── URL validator for document links (SEC-7 fix) ─────────
  window.safeOpenUrl = function(url) {
    const u = String(url||'').trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) { showToast('Only https:// links can be opened for security.','error'); return; }
    window.open(u, '_blank', 'noopener,noreferrer');
  };

  // ── Init on DOMContentLoaded ──────────────────────────────
  function init() {
    ensureSections();
    buildSidebar();
    // Inject CSS for dv5 components
    if (!document.getElementById('dv5-styles')) {
      const style = document.createElement('style');
      style.id = 'dv5-styles';
      style.textContent = DV5_CSS;
      document.head.appendChild(style);
    }
  }

  // Run init immediately if DOM is already ready (post-login scenario)
  // AND hook DOMContentLoaded for page-load scenario
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => setTimeout(init, 50));
  } else {
    // DOM already loaded (IIFE runs after DOMContentLoaded) — init now
    setTimeout(init, 0);
  }
  // Exposed so loadAllData can call it after data arrives
  window.dv5Init = init;

  // ══════════════════════════════════════════════════════════
  // DV5 CSS — injected once at runtime
  // ══════════════════════════════════════════════════════════
  const DV5_CSS = `
/* === DV5 Component System === */
.dv5-section { display: none; }
/* Override all legacy sidebar-user-card styles for the new card */
.dv5-suc.sidebar-user-card { background:#fff!important; border:1px solid #E4E4E7!important; border-radius:8px!important; padding:10px 12px!important; margin:0 0 8px!important; min-height:unset!important; }
.dv5-suc.sidebar-user-card::after { content:none!important; }

/* Shadcn-style sidebar user card */
.dv5-suc { display:flex!important; align-items:center!important; gap:10px!important; padding:10px 12px!important; border-radius:8px!important; background:#fff!important; border:1px solid #E4E4E7!important; width:100%!important; text-align:left!important; cursor:pointer!important; transition:background .12s!important; margin-bottom:8px!important; box-sizing:border-box!important; }
.dv5-suc:hover { background:#F4F4F5!important; }
.dv5-suc-av { width:32px!important; height:32px!important; border-radius:6px!important; background:#18181B!important; color:#fff!important; display:flex!important; align-items:center!important; justify-content:center!important; font-size:11px!important; font-weight:800!important; flex-shrink:0!important; letter-spacing:.02em!important; }
.dv5-suc-body { min-width:0!important; flex:1!important; }
.dv5-suc-name { font-size:13px!important; font-weight:600!important; color:#09090B!important; white-space:nowrap!important; overflow:hidden!important; text-overflow:ellipsis!important; line-height:1.35!important; }
.dv5-suc-email { font-size:11px!important; color:#71717A!important; white-space:nowrap!important; overflow:hidden!important; text-overflow:ellipsis!important; margin-top:1px!important; }

/* Shadcn-style profile dropdown — slide up from user card */
.dv5-pd { position:fixed!important; left:16px!important; bottom:70px!important; top:auto!important; right:auto!important; width:268px!important; background:#fff!important; border:1px solid #E4E4E7!important; border-radius:10px!important; box-shadow:0 4px 24px rgba(0,0,0,.10),0 1px 4px rgba(0,0,0,.06)!important; z-index:9000!important; overflow:hidden!important; visibility:hidden!important; opacity:0!important; transform:translateY(8px)!important; transition:opacity .15s ease,transform .15s ease,visibility 0s .15s!important; pointer-events:none!important; }
.dv5-pd.open { visibility:visible!important; opacity:1!important; transform:translateY(0)!important; transition:opacity .15s ease,transform .15s ease,visibility 0s 0s!important; pointer-events:auto!important; }
.dv5-pd-head { display:flex; align-items:center; gap:10px; padding:12px 14px; border-bottom:1px solid #F4F4F5; }
.dv5-pd-av { width:36px; height:36px; border-radius:7px; background:#18181B; color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:800; flex-shrink:0; letter-spacing:.02em; }
.dv5-pd-name { font-size:13px; font-weight:600; color:#09090B; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.35; }
.dv5-pd-email { font-size:11px; color:#71717A; margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dv5-pd-items { padding:4px; }
.dv5-pd-item { display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:6px; font-size:13px; font-weight:500; color:#09090B; background:none; border:none; width:100%; text-align:left; cursor:pointer; font-family:inherit; transition:background .1s; }
.dv5-pd-item:hover { background:#F4F4F5; }
.dv5-pd-item i { font-size:15px; color:#71717A; flex-shrink:0; width:18px; }
.dv5-pd-sep { height:1px; background:#F4F4F5; margin:3px 6px; }
.dv5-pd-item.danger { color:#DC2626; }
.dv5-pd-item.danger i { color:#DC2626; }
.dv5-pd-item.danger:hover { background:#FEF2F2; }

.dv5-page { padding: 0 0 40px; max-width: none; }
.dv5-page-head { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; gap:16px; flex-wrap:wrap; }
.dv5-page-head h1 { font-size:24px; font-weight:900; color:var(--text,#18191B); margin:0 0 4px; letter-spacing:-.5px; }
.dv5-page-head p { font-size:13px; color:var(--text-3,#999); margin:0; line-height:1.4; }
.dv5-head-actions { display:flex; gap:8px; flex-wrap:wrap; }

/* Buttons */
.dv5-btn { display:inline-flex; align-items:center; gap:6px; padding:0 14px; height:34px; border-radius:8px; border:1px solid var(--border,#E8E8E8); background:#fff; font-size:12px; font-weight:700; color:var(--text,#18191B); cursor:pointer; white-space:nowrap; transition:background .15s; }
.dv5-btn:hover { background:var(--bg,#F3F3F3); }
.dv5-btn.primary { background:#5347CE; color:#fff; border-color:#5347CE; }
.dv5-btn.primary:hover { background:#4338B8; }
.dv5-btn-icon { display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px; border-radius:8px; border:1px solid var(--border,#E8E8E8); background:#fff; cursor:pointer; color:var(--text-2,#555); }
.dv5-btn-icon:hover { background:var(--bg,#F3F3F3); }
.dv5-link { background:none; border:none; color:#5347CE; font-size:12px; font-weight:700; cursor:pointer; padding:0; }
.dv5-action-btn { display:inline-flex; align-items:center; gap:4px; padding:0 10px; height:28px; border-radius:6px; border:1px solid var(--border,#E8E8E8); background:#fff; font-size:11px; font-weight:700; color:var(--text,#18191B); cursor:pointer; }
.dv5-action-btn:hover { background:var(--bg,#F3F3F3); }

/* Stat card grid (shadcn hotel-style colored cards) */
.dv5-stat-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px; margin-bottom:16px; }
.dv5-stat-card { border-radius:14px; padding:20px; box-shadow:0 1px 4px rgba(0,0,0,.07); transition:transform .15s,box-shadow .15s; }
.dv5-stat-card:hover { transform:translateY(-1px); box-shadow:0 4px 16px rgba(0,0,0,.10); }
.dv5-stat-icon { width:40px; height:40px; border-radius:11px; display:flex; align-items:center; justify-content:center; font-size:18px; }
.dv5-stat-val { font-size:28px; font-weight:900; color:#18191B; line-height:1; margin:14px 0 4px; }
.dv5-stat-label { font-size:13px; font-weight:700; color:#18191B; }
.dv5-stat-sub { font-size:11px; color:rgba(0,0,0,.5); margin-top:3px; }

/* File manager cards */
.dv5-file-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px; margin-bottom:16px; }
.dv5-file-card { background:#fff; border:1px solid var(--border,#E8E8E8); border-radius:14px; padding:20px; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,.06); transition:border-color .15s,box-shadow .15s; }
.dv5-file-card:hover { border-color:#5347CE30; box-shadow:0 4px 12px rgba(83,71,206,.08); }
.dv5-file-card-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
.dv5-file-card-label { font-size:13px; font-weight:700; color:var(--text,#18191B); }
.dv5-file-count { font-size:34px; font-weight:900; color:var(--text,#18191B); line-height:1; margin-bottom:14px; }
.dv5-file-bar-wrap { height:6px; background:#F1F1F1; border-radius:999px; overflow:hidden; margin-bottom:8px; }
.dv5-file-bar { height:100%; border-radius:999px; transition:width .5s cubic-bezier(.4,0,.2,1); }
.dv5-file-foot { display:flex; justify-content:space-between; font-size:11px; color:var(--text-3,#999); font-weight:700; margin-bottom:14px; }
.dv5-file-link { font-size:12px; font-weight:700; color:var(--text-3,#999); display:flex; align-items:center; gap:4px; padding-top:10px; border-top:1px solid var(--border,#E8E8E8); }
.dv5-file-card:hover .dv5-file-link { color:#5347CE; }

/* Transactions */
.dv5-tx-header { display:flex; justify-content:space-between; align-items:flex-start; padding:16px 20px 0; flex-wrap:wrap; gap:12px; }
.dv5-tx-tabs { display:flex; gap:2px; padding:12px 20px 0; border-bottom:1px solid var(--border,#E8E8E8); }
.dv5-tx-tab { background:none; border:none; padding:8px 14px; font-size:13px; font-weight:700; color:var(--text-3,#999); border-radius:8px 8px 0 0; cursor:pointer; transition:color .15s; }
.dv5-tx-tab.active { color:var(--text,#18191B); border-bottom:2px solid #18191B; }
.dv5-tx-tab:hover { color:var(--text,#18191B); }
.dv5-tx-list { }
.dv5-tx-row { display:grid; grid-template-columns:130px 1fr auto 36px; align-items:center; gap:12px; padding:14px 20px; border-bottom:1px solid var(--border,#F1F1F1); cursor:pointer; transition:background .1s; }
.dv5-tx-row:hover { background:#F9F9F9; }
.dv5-tx-row:last-child { border-bottom:0; }
.dv5-tx-date { font-size:12px; font-weight:700; color:var(--text-3,#999); white-space:nowrap; }
.dv5-tx-name { font-size:13px; font-weight:700; color:var(--text,#18191B); }
.dv5-tx-status { font-size:11px; color:var(--text-3,#999); margin-top:2px; }
.dv5-tx-amt { font-size:13px; font-weight:800; white-space:nowrap; text-align:right; }
.dv5-tx-arrow { width:32px; height:32px; border:1px solid var(--border,#E8E8E8); border-radius:8px; background:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:14px; color:var(--text-3,#999); transition:background .1s; }
.dv5-tx-arrow:hover { background:var(--bg,#F5F5F5); }

/* Date presets */
.dv5-date-presets { display:flex; gap:4px; flex-wrap:wrap; }
.dv5-preset-btn { background:#fff; border:1px solid var(--border,#E8E8E8); border-radius:8px; padding:5px 12px; font-size:12px; font-weight:700; color:var(--text-3,#999); cursor:pointer; transition:all .15s; white-space:nowrap; }
.dv5-preset-btn:hover { background:var(--bg,#F5F5F5); color:var(--text,#18191B); }
.dv5-preset-btn.active { background:#18191B; color:#fff; border-color:#18191B; }

/* KPI grid */
.dv5-kpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:16px; }
.dv5-kpi { background:#fff; border:1px solid var(--border,#E8E8E8); border-radius:12px; padding:20px; cursor:default; transition:border-color .15s; box-shadow:0 1px 3px rgba(0,0,0,.06); }
.dv5-kpi[onclick] { cursor:pointer; }
.dv5-kpi:hover[onclick] { border-color:#5347CE30; }
.dv5-kpi-icon { width:36px; height:36px; border-radius:10px; background:#F3F3F3; display:flex; align-items:center; justify-content:center; font-size:16px; color:#5347CE; margin-bottom:10px; }
.dv5-kpi-icon.purple { background:#EEF2FF; color:#5347CE; }
.dv5-kpi-icon.green  { background:#ECFDF5; color:#059669; }
.dv5-kpi-icon.amber  { background:#FFFBEB; color:#D97706; }
.dv5-kpi-icon.blue   { background:#EFF6FF; color:#2563EB; }
.dv5-kpi-icon.rose   { background:#FFF1F2; color:#E11D48; }
.dv5-kpi-icon.teal   { background:#F0FDFA; color:#0D9488; }
.dv5-kpi-icon.ink    { background:#1E1B4B; color:#EEFA94; }
.dv5-kpi-val { font-size:22px; font-weight:900; color:var(--text,#18191B); line-height:1; margin-bottom:4px; }
.dv5-kpi-label { font-size:12px; font-weight:700; color:var(--text,#18191B); }
.dv5-kpi-note { font-size:11px; color:var(--text-3,#999); margin-top:2px; }

/* Priority grid */
.dv5-priority-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin-bottom:16px; }
.dv5-priority { background:#fff; border:1px solid var(--border,#E8E8E8); border-radius:12px; padding:20px; cursor:pointer; transition:border-color .15s,box-shadow .15s; text-align:left; box-shadow:0 1px 3px rgba(0,0,0,.06); }
.dv5-priority:hover { border-color:#5347CE50; box-shadow:0 2px 8px rgba(83,71,206,.1); }
.dv5-priority-icon { width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:18px; color:#5347CE; margin-bottom:10px; }
.dv5-priority strong { display:block; font-size:28px; font-weight:900; color:var(--text,#18191B); line-height:1; margin-bottom:4px; }
.dv5-priority span { display:block; font-size:12px; font-weight:700; color:var(--text,#18191B); }
.dv5-priority small { display:block; font-size:11px; color:var(--text-3,#999); margin-top:2px; }

/* Cards */
.dv5-card { background:#fff; border:1px solid var(--border,#E8E8E8); border-radius:12px; padding:20px; margin-bottom:12px; box-shadow:0 1px 3px rgba(0,0,0,.06); }
.dv5-card-pipeline { background:linear-gradient(135deg,#1E1B4B 0%,#312E81 60%,#3730A3 100%); border-color:#4338CA; padding:16px 20px; }
.dv5-card-pipeline .dv5-flow-step strong { color:#fff; }
.dv5-card-pipeline .dv5-flow-step span { color:rgba(255,255,255,.55); }
.dv5-card-pipeline .dv5-flow-arrow { color:rgba(255,255,255,.3); }
.dv5-card-pipeline .dv5-pipeline-flow { padding:4px 0; }
.dv5-card-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
.dv5-card-title { font-size:13px; font-weight:800; color:var(--text,#18191B); }
.dv5-card-sub { font-size:11px; color:var(--text-3,#999); }
.dv5-two-col { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; }
.dv5-table-card { background:#fff; border:1px solid var(--border,#E8E8E8); border-radius:12px; overflow:hidden; margin-bottom:12px; }

/* Tables */
.dv5-table-wrap { overflow-x:auto; }
.dv5-table { width:100%; border-collapse:collapse; font-size:12px; }
.dv5-table thead th { padding:10px 12px; text-align:left; font-size:11px; font-weight:800; color:var(--text-3,#999); text-transform:uppercase; letter-spacing:.04em; background:#FAFAFA; border-bottom:1px solid var(--border,#E8E8E8); white-space:nowrap; }
.dv5-table tbody tr { border-bottom:1px solid var(--border,#E8E8E8); transition:background .12s; cursor:pointer; }
.dv5-table tbody tr:last-child { border-bottom:0; }
.dv5-table tbody tr:hover { background:#FAFAFA; }
.dv5-table tbody td { padding:0 12px; height:44px; color:var(--text,#18191B); vertical-align:middle; }

/* Name cells */
.dv5-name-cell { display:flex; align-items:center; gap:10px; }
.dv5-name { font-size:12px; font-weight:700; color:var(--text,#18191B); }
.dv5-sub { font-size:11px; color:var(--text-3,#999); margin-top:1px; }
.dv5-next-action { font-size:11px; font-weight:700; color:#5347CE; }

/* Avatars */
.dv5-avatar { width:32px; height:32px; min-width:32px; border-radius:10px; background:#111827; color:#fff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:900; }

/* Badges */
.dv5-badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:999px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; white-space:nowrap; }
.dv5-badge.green { background:#E3F5EE; color:#197A52; }
.dv5-badge.blue  { background:#E3EEF9; color:#1A6BB5; }
.dv5-badge.amber { background:#FDF3DC; color:#B07B10; }
.dv5-badge.purple{ background:#EEEDFE; color:#5347CE; }
.dv5-badge.red   { background:#FDEAEA; color:#B83232; }
.dv5-badge.gray  { background:#F3F3F3; color:#888; }

/* Pills */
.dv5-pill { display:inline-flex; align-items:center; padding:3px 8px; border-radius:999px; font-size:10px; font-weight:800; white-space:nowrap; background:#F3F3F3; color:#888; }
.dv5-pill.red    { background:#FDEAEA; color:#B83232; }
.dv5-pill.amber  { background:#FDF3DC; color:#B07B10; }
.dv5-pill.danger { background:#FDEAEA; color:#B83232; }

/* Toolbar */
.dv5-toolbar { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:12px; flex-wrap:wrap; }
.dv5-toolbar-left,.dv5-toolbar-right { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.dv5-input { height:34px; padding:0 12px; border:1px solid var(--border,#E8E8E8); border-radius:8px; font-size:12px; outline:none; background:#fff; width:220px; }
.dv5-input:focus { border-color:#5347CE; }
.dv5-select { height:34px; padding:0 10px; border:1px solid var(--border,#E8E8E8); border-radius:8px; font-size:12px; background:#fff; outline:none; cursor:pointer; }
.dv5-count { font-size:11px; color:var(--text-3,#999); white-space:nowrap; }
.dv5-view-tabs { display:flex; border:1px solid var(--border,#E8E8E8); border-radius:8px; overflow:hidden; }
.dv5-view-tab { padding:0 12px; height:32px; font-size:11px; font-weight:700; border:none; background:#fff; cursor:pointer; color:var(--text-3,#999); }
.dv5-view-tab.active { background:#5347CE; color:#fff; }

/* Bulk action bar */
.dv5-bulk-bar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:8px 12px; background:#EEF2FF; border:1px solid #C7D2FE; border-radius:10px; margin-bottom:10px; font-size:12px; font-weight:700; color:#3730A3; }
.dv5-bulk-bar .dv5-select { height:30px; font-size:11px; }
.dv5-bulk-bar .dv5-btn { height:30px; font-size:11px; }
.dv5-row-selected td { background:#F5F3FF !important; }
.dv5-client-row.dv5-client-open td { background:#F8F6FF; }
.dv5-expand-row td { padding:0 !important; }

/* Pipeline Kanban */
.dv5-kanban { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; min-height:60vh; }
.dv5-col { background:#FAFAFA; border:1px solid var(--border,#E8E8E8); border-radius:12px; overflow:hidden; }
.dv5-col-head { display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:#fff; border-bottom:1px solid var(--border,#E8E8E8); }
.dv5-col-head span:first-child { font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:var(--text,#18191B); }
.dv5-col-count { background:#5347CE; color:#fff; border-radius:999px; padding:2px 7px; font-size:10px; font-weight:800; }
.dv5-col-body { padding:10px; display:flex; flex-direction:column; gap:8px; min-height:100px; }
.dv5-pipe-card { background:#fff; border:1px solid var(--border,#E8E8E8); border-radius:10px; padding:12px; cursor:pointer; transition:border-color .15s,box-shadow .15s; }
.dv5-pipe-card:hover { border-color:#5347CE40; box-shadow:0 4px 12px rgba(83,71,206,.08); }
.dv5-pipe-name { font-size:12px; font-weight:700; color:var(--text,#18191B); margin-bottom:4px; }
.dv5-pipe-meta { font-size:11px; color:var(--text-3,#999); line-height:1.4; margin-bottom:8px; }
.dv5-pipe-foot { display:flex; justify-content:space-between; font-size:10px; color:var(--text-3,#999); font-weight:700; }

/* Pipeline flow steps */
.dv5-pipeline-flow { display:flex; align-items:center; gap:0; padding:0; width:100%; }
.dv5-flow-step { text-align:center; padding:0 8px; }
.dv5-flow-step strong { display:block; font-size:28px; font-weight:900; color:var(--text,#18191B); line-height:1; margin-bottom:4px; }
.dv5-flow-step span { font-size:10px; color:var(--text-3,#999); font-weight:700; letter-spacing:.04em; text-transform:uppercase; }
.dv5-flow-arrow { color:var(--text-3,#999); font-size:14px; flex-shrink:0; }

/* Tasks */
.dv5-task-list { display:flex; flex-direction:column; gap:4px; }
.dv5-task-item { display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:8px; cursor:pointer; transition:background .12s; }
.dv5-task-item:hover { background:#FAFAFA; }
.dv5-task-icon { width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0; }
.dv5-task-icon.high { background:#FDEAEA; color:#B83232; }
.dv5-task-icon.med  { background:#FDF3DC; color:#B07B10; }
.dv5-task-body { flex:1; min-width:0; }
.dv5-task-title { font-size:12px; font-weight:700; color:var(--text,#18191B); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dv5-task-meta { font-size:11px; color:var(--text-3,#999); }

/* Activity */
.dv5-activity-list { display:flex; flex-direction:column; gap:8px; }
.dv5-activity-item { display:flex; align-items:flex-start; gap:10px; }
.dv5-activity-icon { width:28px; height:28px; border-radius:8px; background:#F3F3F3; display:flex; align-items:center; justify-content:center; font-size:12px; color:#888; flex-shrink:0; }
.dv5-activity-title { font-size:12px; font-weight:700; color:var(--text,#18191B); }
.dv5-activity-meta { font-size:11px; color:var(--text-3,#999); }

/* Bar chart */
.dv5-bar-chart { display:flex; align-items:flex-end; gap:10px; height:160px; padding:0 4px 4px; }
.dv5-bar-wrap { flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; height:100%; justify-content:flex-end; }
.dv5-bar { width:100%; border-radius:6px 6px 3px 3px; background:linear-gradient(180deg,#5347CE,#9B8CFF); min-height:12px; transition:height .3s; }
.dv5-bar-wrap span { font-size:10px; color:var(--text-3,#999); font-weight:700; }

/* Empty */
.dv5-empty { padding:24px 12px; text-align:center; font-size:12px; color:var(--text-3,#999); }

/* Candidate Profile Modal */
.dv5-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,.48); z-index:9999; display:none; align-items:flex-start; justify-content:center; padding:28px 16px; overflow-y:auto; }
.dv5-profile-panel { width:min(1100px,98vw); background:#F8FAFC; border-radius:20px; border:1px solid rgba(255,255,255,.6); box-shadow:0 30px 90px rgba(15,23,42,.25); padding:20px; margin:auto; }
.dv5-profile-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
.dv5-profile-id { font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:#7B8496; }
.dv5-profile-actions { display:flex; gap:8px; }
.dv5-profile-hero { display:grid; grid-template-columns:auto 1fr auto; gap:16px; align-items:center; background:#fff; border:1px solid var(--border,#E8E8E8); border-radius:16px; padding:18px; margin-bottom:12px; }
.dv5-profile-avatar { width:60px; height:60px; border-radius:18px; background:#111827; color:#fff; display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:900; flex-shrink:0; }
.dv5-profile-info h2 { font-size:20px; font-weight:800; margin:0 0 4px; }
.dv5-profile-info p { font-size:13px; color:#6B7280; margin:0 0 8px; font-weight:650; }
.dv5-profile-meta { display:flex; gap:14px; flex-wrap:wrap; }
.dv5-profile-meta span { display:inline-flex; gap:5px; align-items:center; font-size:12px; color:#6B7280; font-weight:650; }
.dv5-profile-stage { text-align:right; display:flex; flex-direction:column; gap:6px; align-items:flex-end; }
.dv5-profile-stage small { font-size:11px; color:#7B8496; font-weight:700; }
.dv5-progress-steps { display:grid; grid-template-columns:repeat(6,1fr); gap:8px; margin-bottom:12px; }
.dv5-step { display:flex; flex-direction:column; align-items:center; gap:4px; color:#9CA3AF; font-size:10px; font-weight:800; }
.dv5-step span { width:26px; height:26px; border-radius:999px; border:2px solid #DBE1EB; background:#fff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800; }
.dv5-step.done span { background:#22A06B; color:#fff; border-color:#22A06B; }
.dv5-step.active span { background:#5347CE; color:#fff; border-color:#5347CE; }
.dv5-profile-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:12px; }
.dv5-check-row { display:flex; align-items:center; gap:10px; padding:10px 8px; border-bottom:1px solid var(--border,#E8E8E8); font-size:13px; font-weight:600; color:#374151; border-radius:6px; margin:1px 0; }
.dv5-check-row:last-child { border:none; }
.dv5-check-row.clickable:hover { background:#f5f3ff; color:#5347CE; }
.dv5-check-row.clickable:hover i { color:#5347CE !important; }
.dv5-check-hint { margin-left:auto; font-size:11px; font-weight:500; color:#9ca3af; white-space:nowrap; opacity:0; transition:opacity .15s; }
.dv5-check-row.clickable:hover .dv5-check-hint { opacity:1; color:#5347CE; }
.dv5-detail-grid { display:grid; grid-template-columns:1fr auto; gap:8px; }
.dv5-detail-grid span { font-size:12px; color:#7B8496; }
.dv5-detail-grid strong { font-size:12px; color:var(--text,#18191B); text-align:right; }

/* Responsive */
@media (max-width:1100px) {
  .dv5-kanban { grid-template-columns:repeat(3,1fr); }
  .dv5-profile-grid,.dv5-two-col { grid-template-columns:1fr; }
  .dv5-progress-steps { grid-template-columns:repeat(3,1fr); }
}
@media (max-width:760px) {
  .dv5-page { padding:12px 12px 80px; }
  .dv5-page-head { margin-bottom:14px; gap:10px; }
  .dv5-page-head h1 { font-size:20px; }
  .dv5-kanban { grid-template-columns:1fr 1fr; }
  .dv5-priority-grid,.dv5-kpi-grid,.dv5-stat-grid,.dv5-file-grid { grid-template-columns:repeat(2,1fr); gap:10px; }
  .dv5-tx-row { grid-template-columns:90px 1fr auto 32px; gap:8px; padding:12px 14px; }
  .dv5-date-presets { gap:3px; }
  /* Last odd card spans full width */
  .dv5-priority-grid > *:last-child:nth-child(odd),
  .dv5-kpi-grid > *:last-child:nth-child(odd) { grid-column: 1 / -1; flex-direction:row; align-items:center; gap:14px; }
  .dv5-priority-grid > *:last-child:nth-child(odd) .dv5-priority-icon,
  .dv5-kpi-grid > *:last-child:nth-child(odd) .dv5-kpi-icon { margin-bottom:0; }
  .dv5-priority-grid > *:last-child:nth-child(odd) strong { margin-bottom:0; }
  .dv5-profile-hero { grid-template-columns:1fr; }
  .dv5-profile-stage { align-items:flex-start; text-align:left; }
  .dv5-toolbar { flex-direction:column; align-items:stretch; }
  .dv5-toolbar-left,.dv5-toolbar-right { flex-wrap:wrap; }
  .dv5-input,.dv5-select { width:100%; }
  .dv5-two-col { grid-template-columns:1fr; }
  .dv5-head-actions { flex-wrap:wrap; width:100%; }
  .dv5-head-actions .dv5-btn { flex:1; justify-content:center; min-width:120px; }
  /* Cards: tighter on mobile */
  .dv5-card { padding:14px; }
  .dv5-kpi { padding:14px; }
  .dv5-priority { padding:14px; }
  /* Table: horizontal scroll */
  .dv5-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
  .dv5-table { min-width:480px; }
  /* Pipeline flow: horizontal scroll on mobile */
  .dv5-pipeline-flow { overflow-x:auto; -webkit-overflow-scrolling:touch; padding-bottom:4px; }
  .dv5-flow-step { min-width:64px; flex-shrink:0; }
  /* Kanban: single column on small */
  .dv5-kanban { grid-template-columns:1fr; }
}
@media (max-width:480px) {
  .dv5-page { padding:10px 10px 80px; }
  .dv5-priority-grid,.dv5-kpi-grid { gap:8px; }
  .dv5-card-pipeline { padding:14px 12px; }
}
  `;

  // Expose allRows for the command palette (different IIFE scope)
  window._drecoAllRows = allRows;

})();

// =============================================================
// DRECO Document Upload System
// =============================================================
(function(){
  const BUCKET = 'candidate-documents';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const js = v => String(v ?? '').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,' ');
  const nowISO = () => new Date().toISOString();
  const currentDisplay = () => (window.currentUser?.display || window.currentUser?.username || 'User');
  const companyIdSafe = () => {
    try { return (typeof getCompanyId === 'function' ? getCompanyId() : (window.currentUser?.companyId || 'default-company')); }
    catch { return 'default-company'; }
  };
  const recordByType = (type,id) => (type === 'pro' ? (window.proDB || proDB || []) : (window.lbDB || lbDB || [])).find(r => String(r.id) === String(id)) || {};
  const docKey = (type,id) => `${type}_${id}`;
  const fmtBytes = bytes => {
    const n = Number(bytes || 0);
    if(!n) return '';
    if(n < 1024) return `${n} B`;
    if(n < 1024*1024) return `${(n/1024).toFixed(1)} KB`;
    return `${(n/1024/1024).toFixed(1)} MB`;
  };
  const safeFileName = name => String(name || 'document').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').slice(0,90);
  const DOC_DEFS = {
    pro: [
      ['passport','Passport'],
      ['good_conduct','Good Conduct'],
      ['cv','CV'],
      ['photo','Photo'],
      ['offer_letter','Offer Letter'],
      ['mol','MOL'],
      ['medical','Medical / GAMCA'],
      ['visa','Visa'],
      ['ticket','Ticket'],
      ['contract','Contract']
    ],
    lb: [
      ['passport','Passport'],
      ['good_conduct','Good Conduct'],
      ['cv','CV'],
      ['photo','Photo'],
      ['payment_receipt','Payment Receipt'],
      ['ticket','Ticket'],
      ['contract','Contract'],
      ['other','Other Supporting Document']
    ]
  };
  function getDefs(type){ return DOC_DEFS[type] || DOC_DEFS.pro; }
  function normalizeDocStore(value){
    if(value && typeof value === 'object' && !Array.isArray(value)){
      if(value.items && typeof value.items === 'object') return value;
      return { version: 2, items: value, updatedAt: value.updatedAt || nowISO() };
    }
    if(typeof value === 'string' && value.trim()){
      return { version: 2, legacyFolderLink: value.trim(), items: { legacy_folder: { label:'Legacy Drive Folder', fileName:'Google Drive folder', url:value.trim(), uploadedAt:'', uploadedBy:'Legacy', legacy:true } } };
    }
    return { version: 2, items: {} };
  }
  function getDocStore(type,id){
    window.allDocs = window.allDocs || (typeof allDocs !== 'undefined' ? allDocs : {});
    return normalizeDocStore(window.allDocs[docKey(type,id)]);
  }
  function setDocStore(type,id,store){
    window.allDocs = window.allDocs || (typeof allDocs !== 'undefined' ? allDocs : {});
    store.version = 2;
    store.updatedAt = nowISO();
    window.allDocs[docKey(type,id)] = store;
    try { if(typeof allDocs !== 'undefined') allDocs = window.allDocs; } catch {}
  }
  function docItems(type,id){ return getDocStore(type,id).items || {}; }
  function uploadedCount(type,id){ return Object.values(docItems(type,id)).filter(Boolean).length; }
  function completion(type,id){ const total = getDefs(type).length; return { done: uploadedCount(type,id), total, pct: Math.round(uploadedCount(type,id) / Math.max(1,total) * 100) }; }

  function hasAnyDoc(type,id){ return uploadedCount(type,id) > 0; }
  window.hasDocs = function(a,b){
    if(typeof a === 'object' && a){ return hasAnyDoc(a.type, a.id); }
    return hasAnyDoc(a,b);
  };
  window.drecoDocCompletion = function(type,id){ return completion(type,id); };
  window.drecoCandidateDocs = function(type,id){ return docItems(type,id); };

  async function persistDocs(type,id,store){
    setDocStore(type,id,store);
    const key = docKey(type,id);
    if(typeof saveDocsToDB === 'function') await saveDocsToDB(key, store);
    else if(typeof saveLocalStore === 'function') saveLocalStore();
    refreshDocsUI(type,id);
  }
  function refreshDocsUI(type,id){
    try { renderDocChecklist(type,id); } catch {}
    const active = sessionStorage.getItem('dreco_active_tab') || '';
    try { if(typeof renderDocumentsV4 === 'function') renderDocumentsV4(); } catch {}
  }
  function closeOverlays(exceptId){
    $$('.modal-bg.open,.modal.open,.v4-modal.open').forEach(el => { if(el.id !== exceptId) el.classList.remove('open'); });
  }

  window.openDocs = function(type,id,name){
    closeOverlays('docs-modal');
    window.docsTarget = { type, id, name };
    try { docsTarget = window.docsTarget; } catch {}
    const modal = $('#docs-modal');
    if(!modal) return;
    // Always appear above any open profile/DV5 overlay (z-index:9999)
    modal.style.setProperty('z-index','19999','important');
    const title = $('#docs-modal-title');
    if(title) title.textContent = `Documents - ${name || 'Candidate'}`;
    const panel = modal.querySelector('.modal');
    if(panel) panel.style.maxWidth = '920px';
    const body = modal.querySelector('.modal-body');
    if(body){
      body.innerHTML = `
        <div class="dreco-upload-intro">
          <div>
            <strong>Candidate document checklist</strong>
            <span>Upload files directly into Dreco. Uploaded items show status, date, uploader, view, replace, and delete actions.</span>
          </div>
          <div id="dreco-doc-progress" class="dreco-doc-progress"></div>
        </div>
        <div id="docs-checklist" class="doc-checklist dreco-upload-list"></div>
      `;
    }
    const footer = modal.querySelector('.modal-footer');
    if(footer){
      footer.style.justifyContent = 'space-between';
      footer.innerHTML = `
        <button class="btn" onclick="drecoDownloadDocIndex()"><i class="ti ti-list-details"></i> Document Index</button>
        <div style="display:flex;gap:8px">
          <button class="btn" onclick="closeModal('docs-modal')">Close</button>
        </div>
      `;
    }
    renderDocChecklist(type,id);
    modal.classList.add('open');
  };

  window.renderDocChecklist = function(type,id){
    const el = $('#docs-checklist'); if(!el) return;
    const store = getDocStore(type,id);
    const items = store.items || {};
    const defs = getDefs(type);
    const c = completion(type,id);
    const progress = $('#dreco-doc-progress');
    if(progress) progress.innerHTML = `<strong>${c.done}/${c.total}</strong><span>${c.pct}% complete</span><i><b style="width:${Math.min(100,c.pct)}%"></b></i>`;
    el.innerHTML = defs.map(([key,label]) => {
      const d = items[key];
      const uploaded = !!d;
      return `
        <div class="dreco-doc-item ${uploaded ? 'uploaded' : 'missing'}">
          <div class="dreco-doc-main">
            <div class="dreco-doc-status"><i class="ti ${uploaded ? 'ti-circle-check-filled' : 'ti-cloud-upload'}"></i></div>
            <div class="dreco-doc-copy">
              <strong>${esc(label)}</strong>
              ${uploaded ? `<span>${esc(d.fileName || 'Uploaded file')} ${d.size ? '• '+fmtBytes(d.size) : ''}</span><small>Uploaded ${esc(formatDocDate(d.uploadedAt))} by ${esc(d.uploadedBy || 'User')}</small>` : `<span>Missing</span><small>Accepted: PDF, image, Word, Excel, text files</small>`}
            </div>
          </div>
          <div class="dreco-doc-actions">
            ${uploaded ? `<button class="btn tiny" onclick="drecoViewDoc('${js(type)}','${js(id)}','${js(key)}')"><i class="ti ti-eye"></i> View</button>` : ''}
            <label class="btn tiny primary">
              <i class="ti ${uploaded ? 'ti-refresh' : 'ti-upload'}"></i> ${uploaded ? 'Replace' : 'Upload'}
              <input type="file" hidden onchange="drecoUploadDoc('${js(type)}','${js(id)}','${js(key)}',this)">
            </label>
            ${uploaded ? `<button class="btn tiny danger" onclick="drecoDeleteDoc('${js(type)}','${js(id)}','${js(key)}')"><i class="ti ti-trash"></i></button>` : ''}
          </div>
        </div>`;
    }).join('');
  };
  function formatDocDate(v){
    if(!v) return 'previously';
    const d = new Date(v);
    return isNaN(d) ? String(v) : d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
  }
  async function fileToDataUrl(file){
    return new Promise((resolve,reject)=>{ const r = new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file); });
  }
  async function uploadToSupabase(path,file){
    if(!window.db && typeof db === 'undefined') return null;
    const client = window.db || db;
    if(!client?.storage) return null;
    const { error } = await client.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
    if(error) throw error;
    const { data } = client.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || '';
  }
  window.drecoUploadDoc = async function(type,id,docType,input){
    const file = input?.files?.[0];
    if(!file) return;
    const defs = Object.fromEntries(getDefs(type));
    const label = defs[docType] || docType;
    const store = getDocStore(type,id);
    store.items = store.items || {};
    const path = `${companyIdSafe()}/${type}/${id}/${docType}/${Date.now()}-${safeFileName(file.name)}`;
    try{
      if(typeof showToast === 'function') showToast('Uploading document...', 'info');
      let url = '';
      let storage = 'supabase';
      try { url = await uploadToSupabase(path,file); }
      catch(storageErr){
        console.warn('Supabase Storage upload failed. Falling back to local file preview:', storageErr);
        url = await fileToDataUrl(file);
        storage = 'local-preview';
      }
      store.items[docType] = { label, fileName:file.name, mimeType:file.type, size:file.size, path, url, uploadedAt:nowISO(), uploadedBy:currentDisplay(), storage };
      await persistDocs(type,id,store);
      try { addTimeline(type,id,`${label} uploaded`); } catch {}
      try { auditAction('Documents',`${label} uploaded`, recordByType(type,id).name || 'Candidate'); } catch {}
      if(typeof showToast === 'function') showToast(`${label} uploaded ✓`, 'success');
    }catch(err){
      console.error(err);
      if(typeof showToast === 'function') showToast(err.message || 'Upload failed', 'error');
      else alert(err.message || 'Upload failed');
    }finally{ if(input) input.value=''; }
  };
  window.drecoViewDoc = function(type,id,docType){
    const d = docItems(type,id)[docType];
    if(!d?.url){ alert('File not available.'); return; }
    window.open(d.url, '_blank', 'noopener,noreferrer');
  };
  window.drecoDeleteDoc = async function(type,id,docType){
    const store = getDocStore(type,id); const d = store.items?.[docType];
    if(!d) return;
    if(!confirm(`Delete ${d.label || docType}?`)) return;
    try{
      const client = window.db || (typeof db !== 'undefined' ? db : null);
      if(client?.storage && d.storage === 'supabase' && d.path){
        await client.storage.from(BUCKET).remove([d.path]).catch(()=>{});
      }
      delete store.items[docType];
      await persistDocs(type,id,store);
      try { addTimeline(type,id,`${d.label || docType} deleted`); } catch {}
      try { auditAction('Documents',`${d.label || docType} deleted`, recordByType(type,id).name || 'Candidate'); } catch {}
      if(typeof showToast === 'function') showToast('Document deleted', 'success');
    }catch(err){
      console.error(err);
      if(typeof showToast === 'function') showToast(err.message || 'Delete failed', 'error');
    }
  };
  window.drecoDownloadDocIndex = function(){
    const t = window.docsTarget || (typeof docsTarget !== 'undefined' ? docsTarget : null);
    if(!t) return;
    const items = docItems(t.type,t.id);
    const rows = [['Document','File name','Uploaded at','Uploaded by','URL']];
    Object.values(items).forEach(d => rows.push([d.label||'', d.fileName||'', d.uploadedAt||'', d.uploadedBy||'', d.url||'']));
    const csv = rows.map(r => r.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${(t.name||'candidate').replace(/[^a-z0-9]+/gi,'-')}-documents.csv`; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };
  // Legacy handlers now no-op/compatibility wrappers.
  window.onDocsLinkInput = function(){};
  window.openCurrentDocLink = function(){
    const t = window.docsTarget || (typeof docsTarget !== 'undefined' ? docsTarget : null); if(!t) return;
    const first = Object.values(docItems(t.type,t.id))[0]; if(first?.url) window.open(first.url,'_blank');
  };
  window.saveDocs = async function(){
    const t = window.docsTarget || (typeof docsTarget !== 'undefined' ? docsTarget : null); if(!t) return;
    await persistDocs(t.type,t.id,getDocStore(t.type,t.id));
    if(typeof showToast === 'function') showToast('Documents saved ✓','success');
    closeModal('docs-modal');
  };

  // Upgrade document page to checklist-aware status.
  window.renderDocumentsV4 = function(){
    const el = $('#documents-section'); if(!el) return;
    const all = (typeof rows === 'function' ? rows() : [ ...(window.proDB||[]).map(r=>({...r,type:'pro'})), ...(window.lbDB||[]).map(r=>({...r,type:'lb'})) ]);
    const rowsHTML = all.map(x=>{
      const c = completion(x.type,x.id);
      const req = getDefs(x.type).map(d=>d[1]).slice(0,6).join(', ') + (getDefs(x.type).length>6?'...':'');
      return `<tr onclick="openDocs('${js(x.type)}','${js(x.id)}','${js(x.name)}')"><td><div class="v4-name"><div class="v4-avatar">${esc((x.name||'?').split(/\s+/).map(p=>p[0]).join('').slice(0,2))}</div><div><strong>${esc(x.name)}</strong><span>${esc(x.pp || 'No passport')}</span></div></div></td><td>${esc(x.type==='pro'?'Professional':'General')}</td><td>${esc(req)}</td><td><div class="doc-table-progress"><b>${c.done}/${c.total}</b><i><span style="width:${c.pct}%"></span></i></div></td><td>${c.done ? '<span class="v4-doc-ok">Uploaded</span>' : '<span class="v4-doc-miss">Missing</span>'}</td><td><button class="dreco-btn" onclick="event.stopPropagation();openDocs('${js(x.type)}','${js(x.id)}','${js(x.name)}')">Manage</button></td></tr>`;
    }).join('');
    const complete = all.filter(x=>completion(x.type,x.id).pct >= 100).length;
    const partial = all.filter(x=>{ const c=completion(x.type,x.id); return c.done>0 && c.pct<100; }).length;
    const missing = all.filter(x=>completion(x.type,x.id).done===0).length;
    el.innerHTML = `<div class="v4-page"><div class="v4-head"><div><h1>Documents</h1><p>Direct per-candidate uploads with checklist status, view, replace and delete actions.</p></div><div class="v4-actions"><button class="dreco-btn primary" onclick="switchTab('candidates')">Open Candidates</button></div></div><div class="v4-kpi-grid"><div class="v4-kpi"><span>Complete</span><strong>${complete}</strong><small>All required files</small></div><div class="v4-kpi"><span>Partial</span><strong>${partial}</strong><small>Some files uploaded</small></div><div class="v4-kpi"><span>Missing</span><strong>${missing}</strong><small>No documents yet</small></div><div class="v4-kpi"><span>Total files</span><strong>${all.reduce((s,x)=>s+uploadedCount(x.type,x.id),0)}</strong><small>Uploaded records</small></div></div><div class="v4-card"><table class="v4-table"><thead><tr><th>Candidate</th><th>Type</th><th>Required Checklist</th><th>Progress</th><th>Status</th><th>Action</th></tr></thead><tbody>${rowsHTML}</tbody></table></div></div>`;
  };
  // switchTab wrapper removed — DV5 handles tab routing.
  // renderDocumentsV4 is available globally for direct calls if needed.
})();

// =============================================================
// DRECO Mobile Patch
// =============================================================
(function(){
  const MOBILE_MAX = 860;
  function isMobile(){ return window.matchMedia && window.matchMedia('(max-width: '+MOBILE_MAX+'px)').matches; }

  function labelMobileTables(root=document){
    root.querySelectorAll('table').forEach(table=>{
      const heads=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim()).filter(Boolean);
      table.querySelectorAll('tbody tr').forEach(row=>{
        [...row.children].forEach((td,i)=>{
          if(!td.getAttribute('data-label')) td.setAttribute('data-label', heads[i] || 'Details');
        });
      });
    });
  }

  function keepBottomNavUsable(){
    const nav=document.getElementById('bottom-nav');
    if(!nav) return;
    if(document.getElementById('app')?.style.display !== 'none') nav.classList.add('visible');
    const active=nav.querySelector('.bottom-nav-item.active');
    if(active && isMobile()) active.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'});
  }

  function closeStackedModals(){
    const open=[...document.querySelectorAll('.modal-bg.open,.modal-bg.show,.modal-backdrop.open,.modal-backdrop.show')].filter(el=>getComputedStyle(el).display!=='none');
    if(open.length <= 1) return;
    open.slice(0,-1).forEach(el=>{ el.classList.remove('open','show'); el.style.display='none'; });
    const last=open[open.length-1]; last.style.display='flex'; last.classList.add('open');
  }

  function tuneMobile(){
    document.body.classList.toggle('dreco-mobile', isMobile());
    labelMobileTables();
    keepBottomNavUsable();
    closeStackedModals();
  }

  const originalSwitch = window.switchTab;
  if(typeof originalSwitch === 'function' && !originalSwitch.__mobileWrapped){
    window.switchTab = function(){
      const out = originalSwitch.apply(this, arguments);
      setTimeout(tuneMobile, 60);
      setTimeout(tuneMobile, 250);
      return out;
    };
    window.switchTab.__mobileWrapped = true;
  }

  ['renderDash','renderCandidates','renderPipeline','renderFinance','renderReports','renderDocuments','renderClients'].forEach(name=>{
    const fn=window[name];
    if(typeof fn === 'function' && !fn.__mobileWrapped){
      window[name]=function(){ const out=fn.apply(this,arguments); setTimeout(tuneMobile,40); return out; };
      window[name].__mobileWrapped=true;
    }
  });

  const mo=new MutationObserver(()=>{
    if(window.__drecoMobileTuneTimer) clearTimeout(window.__drecoMobileTuneTimer);
    window.__drecoMobileTuneTimer=setTimeout(tuneMobile,80);
  });
  document.addEventListener('DOMContentLoaded',()=>{
    tuneMobile();
    const app=document.getElementById('app') || document.body;
    mo.observe(app,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
  });
  window.addEventListener('resize',()=>setTimeout(tuneMobile,100),{passive:true});
  window.drecoTuneMobile=tuneMobile;
})();

// =============================================================
// DRECO Stabilization Pass
// =============================================================
/* Adds safe auth/nav state, modal discipline, local backups, render guards,
   mobile table labels, storage readiness diagnostics and a small health check.
   This patch is intentionally additive: it does not replace the login screen,
   logo, Supabase config, existing renderers, or candidate data model. */
(function drecoStabilizationPass(){
  if (window.__drecoStabilizationPass) return;
  window.__drecoStabilizationPass = true;

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const BACKUP_INDEX_KEY = 'dreco_backup_index_v1';
  const MAX_BACKUPS = 8;

  function appIsVisible(){
    const app = $('#app');
    if (!app) return false;
    return app.style.display !== 'none' && getComputedStyle(app).display !== 'none';
  }

  function syncAuthShellState(){
    const logged = !!currentUser && appIsVisible();
    document.body.classList.toggle('logged-in', logged);
    const nav = $('#bottom-nav');
    if (nav) {
      nav.classList.toggle('visible', logged);
      nav.setAttribute('aria-hidden', logged ? 'false' : 'true');
      if (!logged) nav.querySelectorAll('.bottom-nav-item.active').forEach(btn => btn.classList.remove('active'));
    }
  }

  function showHealthMessage(title, body){
    let el = $('#dreco-health-badge');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dreco-health-badge';
      el.className = 'dreco-health-badge';
      document.body.appendChild(el);
    }
    el.innerHTML = `<strong>${title}</strong>${body}`;
    el.classList.add('show');
    clearTimeout(window.__drecoHealthTimer);
    window.__drecoHealthTimer = setTimeout(()=>el.classList.remove('show'), 7000);
  }

  function getStoreKey(){
    try { return `${LOCAL_STORE_KEY}_${getCompanyId()}`; } catch { return `${LOCAL_STORE_KEY}_unknown`; }
  }

  function currentSnapshot(){
    return {
      pro: Array.isArray(proDB) ? proDB : [],
      lb: Array.isArray(lbDB) ? lbDB : [],
      docs: allDocs && typeof allDocs === 'object' ? allDocs : {},
      timelines: allTimelines && typeof allTimelines === 'object' ? allTimelines : {},
      proStages: Array.isArray(proStages) ? proStages : [],
      lbStages: Array.isArray(lbStages) ? lbStages : [],
      at: new Date().toISOString(),
      companyId: (typeof getCompanyId === 'function' ? getCompanyId() : 'unknown')
    };
  }

  function hasUsefulData(snapshot){
    return (snapshot.pro?.length || 0) + (snapshot.lb?.length || 0) + Object.keys(snapshot.docs || {}).length > 0;
  }

  function readStoredSnapshot(){
    try {
      const raw = safeLocalGet(getStoreKey());
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function createBackup(reason='manual'){
    try {
      const stored = readStoredSnapshot() || currentSnapshot();
      if (!hasUsefulData(stored)) return null;
      const id = `dreco_backup_${(typeof getCompanyId === 'function' ? getCompanyId() : 'company')}_${Date.now()}`;
      const payload = { ...stored, backupReason: reason, backupAt: new Date().toISOString() };
      safeLocalSet(id, JSON.stringify(payload));
      const index = JSON.parse(safeLocalGet(BACKUP_INDEX_KEY) || '[]').filter(Boolean);
      index.unshift({ id, reason, companyId: payload.companyId || (typeof getCompanyId === 'function' ? getCompanyId() : ''), at: payload.backupAt, pro: payload.pro?.length || 0, lb: payload.lb?.length || 0 });
      const trimmed = index.slice(0, MAX_BACKUPS);
      index.slice(MAX_BACKUPS).forEach(item => { try { localStorage.removeItem(item.id); } catch {} });
      safeLocalSet(BACKUP_INDEX_KEY, JSON.stringify(trimmed));
      return id;
    } catch (err) {
      console.warn('Dreco backup could not be created:', err);
      return null;
    }
  }

  function latestBackup(){
    try {
      const index = JSON.parse(safeLocalGet(BACKUP_INDEX_KEY) || '[]');
      const companyId = typeof getCompanyId === 'function' ? getCompanyId() : '';
      return index.find(x => !companyId || x.companyId === companyId) || index[0] || null;
    } catch { return null; }
  }

  function restoreLatestBackup(){
    const item = latestBackup();
    if (!item) return false;
    try {
      const backup = JSON.parse(safeLocalGet(item.id) || '{}');
      if (!hasUsefulData(backup)) return false;
      proDB = (backup.pro || []).map(typeof normalizeProRecord === 'function' ? normalizeProRecord : x => x);
      lbDB = (backup.lb || []).map(typeof normalizeLBRecord === 'function' ? normalizeLBRecord : x => x);
      allDocs = backup.docs || {};
      allTimelines = backup.timelines || {};
      if (backup.proStages?.length) proStages = backup.proStages;
      if (backup.lbStages?.length) lbStages = backup.lbStages;
      if (typeof saveLocalStore === 'function') saveLocalStore();
      if (typeof switchTab === 'function') switchTab(sessionStorage.getItem('dreco_active_tab') || 'dash');
      if (typeof showToast === 'function') showToast('Restored latest local backup.', 'success');
      return true;
    } catch (err) {
      console.warn('Dreco backup restore failed:', err);
      return false;
    }
  }

  function installStorageGuard(){
    if (typeof saveLocalStore !== 'function' || saveLocalStore.__drecoGuarded) return;
    const original = saveLocalStore;
    saveLocalStore = function guardedSaveLocalStore(){
      const before = readStoredSnapshot();
      const next = currentSnapshot();
      const beforeCount = (before?.pro?.length || 0) + (before?.lb?.length || 0);
      const nextCount = (next.pro?.length || 0) + (next.lb?.length || 0);
      if (beforeCount > 0 && nextCount === 0) {
        console.error('Blocked unsafe empty data save. Existing candidate data was preserved.');
        showHealthMessage('Unsafe save blocked', 'Dreco prevented an empty candidate state from overwriting saved data.');
        return;
      }
      if (beforeCount > 0) createBackup('before-save');
      return original.apply(this, arguments);
    };
    saveLocalStore.__drecoGuarded = true;
  }

  function closeAllModalsExcept(active){
    const activeId = typeof active === 'string' ? active : active?.id;
    const openModals = $$('.modal-bg.open,.modal-backdrop.open,#candidate-profile-modal.open,#candidate-profile-modal-v4.open,#v4-command.open,#command-modal.open,#quick-country-modal.open');
    openModals.forEach(el => {
      if (el.id && el.id === activeId) return;
      el.classList.remove('open','show','dreco-modal-active');
      if (el.classList.contains('modal-backdrop')) el.style.display = 'none';
    });
    const activeEl = activeId ? document.getElementById(activeId) : null;
    if (activeEl) activeEl.classList.add('dreco-modal-active');
    document.body.classList.toggle('dreco-modal-open', !!activeEl || openModals.length > 0);
  }

  function installModalManager(){
    if (window.__drecoModalManagerInstalled) return;
    window.__drecoModalManagerInstalled = true;

    const observe = new MutationObserver(records => {
      const opened = records
        .map(r => r.target)
        .filter(el => el instanceof HTMLElement && (el.classList.contains('open') || el.classList.contains('show')))
        .filter(el => el.matches('.modal-bg,.modal-backdrop,#candidate-profile-modal,#candidate-profile-modal-v4,#v4-command,#command-modal,#quick-country-modal'));
      if (!opened.length) {
        document.body.classList.toggle('dreco-modal-open', $$('.modal-bg.open,.modal-backdrop.open,#candidate-profile-modal.open,#candidate-profile-modal-v4.open,#v4-command.open,#command-modal.open,#quick-country-modal.open').length > 0);
        return;
      }
      const last = opened[opened.length - 1];
      setTimeout(() => closeAllModalsExcept(last), 0);
    });
    document.addEventListener('DOMContentLoaded', () => observe.observe(document.body, { subtree:true, attributes:true, attributeFilter:['class'] }));

    const originalClose = typeof closeModal === 'function' ? closeModal : null;
    if (originalClose && !originalClose.__drecoManaged) {
      closeModal = function managedCloseModal(id){
        const out = originalClose.apply(this, arguments);
        setTimeout(()=>{
          document.body.classList.toggle('dreco-modal-open', $$('.modal-bg.open,.modal-backdrop.open,#candidate-profile-modal.open,#candidate-profile-modal-v4.open,#v4-command.open,#command-modal.open,#quick-country-modal.open').length > 0);
        }, 0);
        return out;
      };
      closeModal.__drecoManaged = true;
    }

    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      const open = $$('.modal-bg.open,.modal-backdrop.open,#candidate-profile-modal.open,#candidate-profile-modal-v4.open,#v4-command.open,#command-modal.open,#quick-country-modal.open').pop();
      if (!open) return;
      open.classList.remove('open','show','dreco-modal-active');
      open.style.display = '';
      document.body.classList.toggle('dreco-modal-open', $$('.modal-bg.open,.modal-backdrop.open,#candidate-profile-modal.open,#candidate-profile-modal-v4.open,#v4-command.open,#command-modal.open,#quick-country-modal.open').length > 0);
    });
  }

  function labelMobileTables(root=document){
    $$('table', root).forEach(table => {
      const heads = $$('thead th', table).map(th => th.textContent.trim()).filter(Boolean);
      if (!heads.length) return;
      table.classList.add('dreco-mobile-table');
      $$('tbody tr', table).forEach(row => {
        Array.from(row.children).forEach((td, i) => {
          if (!td.getAttribute('data-label')) td.setAttribute('data-label', heads[i] || 'Details');
        });
      });
    });
  }

  function ensureEmptyStates(root=document){
    $$('.panel,.v4-card,.dreco-card', root).forEach(card => {
      const tbody = $('tbody', card);
      if (tbody && !tbody.children.length && !$('.dreco-empty-state', card)) {
        const row = document.createElement('tr');
        const colCount = Math.max(1, $$('thead th', card).length || 1);
        row.innerHTML = `<td colspan="${colCount}"><div class="dreco-empty-state">No records found yet.</div></td>`;
        tbody.appendChild(row);
      }
    });
  }

  function installRenderGuards(){
    const names = ['renderDash','renderCandidates','renderPipeline','renderFinance','renderReports','renderDocuments','renderClients','renderPro','renderLB','renderCommissions','renderRepayments','renderExpenses','renderTravel'];
    names.forEach(name => {
      const fn = window[name];
      if (typeof fn !== 'function' || fn.__drecoGuarded) return;
      window[name] = function guardedRender(){
        try {
          const out = fn.apply(this, arguments);
          setTimeout(()=>{ labelMobileTables(); ensureEmptyStates(); syncAuthShellState(); }, 20);
          return out;
        } catch (err) {
          console.error(`${name} failed:`, err);
          showHealthMessage('View render failed', `${name} hit an error. Existing data was not changed.`);
          return null;
        }
      };
      window[name].__drecoGuarded = true;
    });
  }

  function installAuthStateWrappers(){
    ['doLogin','doSignup','doLogout','loadAllData','switchTab'].forEach(name => {
      const fn = window[name];
      if (typeof fn !== 'function' || fn.__drecoAuthWrapped) return;
      window[name] = function drecoAuthWrapped(){
        const result = fn.apply(this, arguments);
        Promise.resolve(result).finally(()=>{
          setTimeout(syncAuthShellState, 0);
          setTimeout(syncAuthShellState, 160);
          setTimeout(()=>{ labelMobileTables(); ensureEmptyStates(); }, 180);
        });
        return result;
      };
      window[name].__drecoAuthWrapped = true;
    });
  }

  async function checkStorageReadiness(){
    const status = {
      mode: typeof getStorageLabel === 'function' ? getStorageLabel() : 'Unknown',
      supabaseClient: !!db,
      storageBucket: 'candidate-documents',
      bucketReachable: false,
      error: ''
    };
    if (!db?.storage) return status;
    try {
      const { data, error } = await db.storage.from('candidate-documents').list('', { limit:1 });
      if (error) throw error;
      status.bucketReachable = Array.isArray(data);
    } catch (err) {
      status.error = err.message || 'Candidate document bucket is not reachable.';
    }
    return status;
  }

  async function runHealthCheck(){
    const storage = await checkStorageReadiness();
    const result = {
      loggedIn: !!currentUser,
      appVisible: appIsVisible(),
      candidates: { professional: Array.isArray(proDB) ? proDB.length : 0, general: Array.isArray(lbDB) ? lbDB.length : 0 },
      documents: allDocs ? Object.keys(allDocs).length : 0,
      timelines: allTimelines ? Object.keys(allTimelines).length : 0,
      storage,
      latestBackup: latestBackup(),
      openModals: $$('.modal-bg.open,.modal-backdrop.open,#candidate-profile-modal.open,#candidate-profile-modal-v4.open,#v4-command.open,#command-modal.open,#quick-country-modal.open').map(x => x.id || x.className)
    };
    return result;
  }

  function installMutationStabilizer(){
    const mo = new MutationObserver(() => {
      clearTimeout(window.__drecoStabilityTick);
      window.__drecoStabilityTick = setTimeout(()=>{
        syncAuthShellState();
        labelMobileTables();
        ensureEmptyStates();
      }, 100);
    });
    document.addEventListener('DOMContentLoaded', () => {
      mo.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['class','style'] });
    });
  }

  window.drecoRunHealthCheck = runHealthCheck;
  window.drecoCreateBackup = createBackup;
  window.drecoRestoreLatestBackup = restoreLatestBackup;
  window.drecoCloseAllModalsExcept = closeAllModalsExcept;
  window.drecoSyncAuthShellState = syncAuthShellState;

  installStorageGuard();
  installModalManager();
  installRenderGuards();
  installAuthStateWrappers();
  installMutationStabilizer();

  document.addEventListener('DOMContentLoaded', () => {
    syncAuthShellState();
    labelMobileTables();
    ensureEmptyStates();
    setTimeout(syncAuthShellState, 250);
    setTimeout(()=>runHealthCheck().then(res => {
      if (res.storage.supabaseClient && !res.storage.bucketReachable) {
        console.warn('Candidate document storage bucket check:', res.storage.error || 'Bucket not reachable');
      }
    }), 1200);
  });

  window.addEventListener('error', event => {
    console.error('Dreco runtime error:', event.error || event.message);
    showHealthMessage('Runtime issue caught', 'A script error was caught. Your saved candidate data was not overwritten.');
  });
  window.addEventListener('unhandledrejection', event => {
    console.error('Dreco async error:', event.reason);
    showHealthMessage('Sync/action issue caught', 'An action failed safely. Check the console for details.');
  });

  // ══════════════════════════════════════════════════════════
  // ⌘K COMMAND PALETTE
  // ══════════════════════════════════════════════════════════
  const CMD_TABS = [
    { label:'Dashboard',   icon:'ti-home',           tab:'dash' },
    { label:'Candidates',  icon:'ti-users',          tab:'candidates' },
    { label:'Pipeline',    icon:'ti-git-branch',     tab:'pipeline' },
    { label:'Finance',     icon:'ti-coin',           tab:'finance' },
    { label:'Documents',   icon:'ti-folder',         tab:'documents' },
    { label:'Clients',     icon:'ti-building',       tab:'clients' },
    { label:'Reports',     icon:'ti-chart-bar',      tab:'reports' },
  ];
  let cmdSelectedIdx = 0;

  window.openCmd = function() {
    const overlay = document.getElementById('cmd-overlay');
    if (!overlay) return;
    overlay.classList.add('open');
    const inp = document.getElementById('cmd-input');
    if (inp) { inp.value = ''; inp.focus(); }
    cmdSearch();
  };

  window.closeCmd = function() {
    const overlay = document.getElementById('cmd-overlay');
    if (overlay) overlay.classList.remove('open');
  };

  function cmdEsc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  window.cmdSearch = function() {
    const q = (document.getElementById('cmd-input')?.value || '').toLowerCase().trim();
    const results = document.getElementById('cmd-results');
    if (!results) return;
    cmdSelectedIdx = 0;

    const tabs = CMD_TABS.filter(t => !q || t.label.toLowerCase().includes(q));
    const candidates = q.length >= 2
      ? (typeof window._drecoAllRows === 'function' ? window._drecoAllRows() : []).filter(r =>
          (r.name||'').toLowerCase().includes(q) ||
          (r.pp||'').toLowerCase().includes(q) ||
          (r.company||'').toLowerCase().includes(q)
        ).slice(0, 8)
      : [];

    let html = '';
    if (tabs.length) {
      html += `<div class="cmd-section-label">Navigation</div>`;
      html += tabs.map((t,i) => `
        <div class="cmd-item${i===0&&!candidates.length?'':''}" data-cmd-idx="${i}" onclick="closeCmd();switchTab('${t.tab}')">
          <div class="cmd-item-icon"><i class="ti ${t.icon}"></i></div>
          <div class="cmd-item-main"><div class="cmd-item-name">${t.label}</div></div>
          <span class="cmd-item-badge">Tab</span>
        </div>`).join('');
    }
    if (candidates.length) {
      html += `<div class="cmd-section-label">Candidates</div>`;
      html += candidates.map((r,i) => `
        <div class="cmd-item" data-cmd-idx="${tabs.length+i}" onclick="closeCmd();editPro(${r.id})">
          <div class="cmd-item-icon"><i class="ti ti-user"></i></div>
          <div class="cmd-item-main">
            <div class="cmd-item-name">${cmdEsc(r.name)}</div>
            <div class="cmd-item-sub">${cmdEsc(r.stage||'')} · ${cmdEsc(r.company||'')}</div>
          </div>
        </div>`).join('');
    }
    if (!html) html = `<div id="cmd-empty">No results for "<strong>${q}</strong>"</div>`;
    results.innerHTML = html;
    highlightCmd();
  };

  window.cmdKey = function(e) {
    const items = document.querySelectorAll('.cmd-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); cmdSelectedIdx = Math.min(cmdSelectedIdx+1, items.length-1); highlightCmd(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cmdSelectedIdx = Math.max(cmdSelectedIdx-1, 0); highlightCmd(); }
    else if (e.key === 'Enter') { e.preventDefault(); items[cmdSelectedIdx]?.click(); }
    else if (e.key === 'Escape') { closeCmd(); }
  };

  function highlightCmd() {
    document.querySelectorAll('.cmd-item').forEach((el,i) => {
      el.classList.toggle('selected', i === cmdSelectedIdx);
    });
  }

  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const overlay = document.getElementById('cmd-overlay');
      if (overlay?.classList.contains('open')) closeCmd();
      else openCmd();
    }
    if (e.key === 'Escape') closeCmd();
  });
})();
