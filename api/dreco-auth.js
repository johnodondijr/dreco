const AUTH_EMAIL_DOMAIN = 'dreco.local';

function getDefaultCompany() {
  return {
    id: process.env.DRECO_DEFAULT_COMPANY_ID || 'dreco-workspace',
    name: process.env.DRECO_DEFAULT_COMPANY_NAME || 'Dreco Workspace',
    generalJobsCountries: String(process.env.DRECO_GENERAL_JOBS_COUNTRIES || 'General')
      .split(',')
      .map(country => country.trim())
      .filter(Boolean),
  };
}

function slugify(value) {
  return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

function authEmail(username) {
  return `${String(username || '').trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}

function cleanUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashCode(code) {
  const crypto = require('crypto');
  const pepper = process.env.DRECO_RECOVERY_CODE || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dreco';
  return crypto.createHash('sha256').update(`${pepper}:${String(code || '').trim()}`).digest('hex');
}

function nowPlus(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function supabaseAdminFetch(path, options = {}) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable.');
  }
  const headers = {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    'content-type': 'application/json',
    ...(options.headers || {}),
  };
  Object.keys(headers).forEach(key => {
    if (headers[key] === undefined || headers[key] === null) delete headers[key];
  });
  const response = await fetch(`${url.replace(/\/$/, '')}${path}`, {
    ...options,
    headers,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.msg || data?.message || data?.error_description || data?.error || 'Supabase request failed.');
  }
  return data;
}

async function loadAppSetting(key) {
  const data = await supabaseAdminFetch(`/rest/v1/app_settings?key=eq.${encodeURIComponent(key)}&select=value`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  const row = Array.isArray(data) ? data[0] : null;
  return row?.value || null;
}

async function saveAppSetting(key, value) {
  await supabaseAdminFetch('/rest/v1/app_settings?on_conflict=key', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key, value }),
  });
}

async function getCallerUser(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;
  return response.json();
}

function accountFromUser(user) {
  const meta = user.app_metadata || {};
  const defaults = getDefaultCompany();
  return {
    authUserId: user.id,
    role: meta.role === 'admin' ? 'admin' : 'staff',
    display: meta.display || meta.username || user.email,
    companyId: meta.company_id,
    companyName: meta.company_name,
    email: meta.account_email || '',
    emailVerified: meta.account_email_verified === true,
    generalJobsCountries: Array.isArray(meta.general_jobs_countries) && meta.general_jobs_countries.length
      ? meta.general_jobs_countries
      : defaults.generalJobsCountries,
  };
}

async function findAuthUserByUsername(username) {
  const email = authEmail(username);
  let page = 1;
  const perPage = 200;
  while (page <= 10) {
    const data = await supabaseAdminFetch(`/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      method: 'GET',
      headers: { 'content-type': undefined },
    });
    const users = Array.isArray(data?.users) ? data.users : [];
    const match = users.find(user => String(user.email || '').toLowerCase() === email);
    if (match) return match;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

async function loadCloudAccount(username) {
  try {
    const accounts = await loadAppSetting('dreco_accounts_v2');
    const account = accounts?.[username];
    return account && typeof account === 'object' ? account : null;
  } catch {
    return null;
  }
}

async function loadCloudAccounts() {
  const accounts = await loadAppSetting('dreco_accounts_v2');
  return accounts && typeof accounts === 'object' ? accounts : {};
}

async function updateCloudAccount(username, patch) {
  const accounts = await loadCloudAccounts();
  accounts[username] = { ...(accounts[username] || {}), ...patch };
  await saveAppSetting('dreco_accounts_v2', accounts);
  return accounts[username];
}

async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Email delivery is not configured. Set RESEND_API_KEY in Vercel.');
  const from = process.env.DRECO_EMAIL_FROM || 'Dreco <onboarding@resend.dev>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || data?.error || 'Email could not be sent.');
  return data;
}

async function syncAuthAccountMetadata(username, patch) {
  const existing = await findAuthUserByUsername(username);
  if (!existing?.id) return null;
  const meta = existing.app_metadata || {};
  const userMeta = existing.user_metadata || {};
  const nextMeta = { ...meta, ...patch };
  const user = await supabaseAdminFetch(`/auth/v1/admin/users/${existing.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      user_metadata: {
        ...userMeta,
        display: nextMeta.display || userMeta.display || username,
        username,
      },
      app_metadata: nextMeta,
    }),
  });
  return accountFromUser(user);
}

async function createAuthUser({ username, password, display, role, companyId, companyName, generalJobsCountries }) {
  const user = await supabaseAdminFetch('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: authEmail(username),
      password,
      email_confirm: true,
      user_metadata: {
        username,
        display,
      },
      app_metadata: {
        username,
        display,
        role,
        company_id: companyId,
        company_name: companyName,
        account_email: '',
        account_email_verified: false,
        general_jobs_countries: generalJobsCountries,
      },
    }),
  });
  return accountFromUser(user);
}

async function resetAuthPassword({ username, password, display }) {
  const cloudAccount = await loadCloudAccount(username);
  const defaults = getDefaultCompany();
  const profile = {
    username,
    display: display || cloudAccount?.display || username,
    role: cloudAccount?.role === 'admin' ? 'admin' : 'staff',
    companyId: cloudAccount?.companyId || cloudAccount?.company_id || defaults.id,
    companyName: cloudAccount?.companyName || cloudAccount?.company_name || defaults.name,
    generalJobsCountries: Array.isArray(cloudAccount?.generalJobsCountries) && cloudAccount.generalJobsCountries.length
      ? cloudAccount.generalJobsCountries
      : defaults.generalJobsCountries,
  };

  const existing = await findAuthUserByUsername(username);
  if (existing?.id) {
    const user = await supabaseAdminFetch(`/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        password,
        email_confirm: true,
        user_metadata: {
          username,
          display: profile.display,
        },
        app_metadata: {
          username,
          display: profile.display,
          role: profile.role,
          company_id: profile.companyId,
          company_name: profile.companyName,
          account_email: cloudAccount?.email || cloudAccount?.account_email || '',
          account_email_verified: cloudAccount?.emailVerified === true || cloudAccount?.account_email_verified === true,
          general_jobs_countries: profile.generalJobsCountries,
        },
      }),
    });
    return accountFromUser(user);
  }

  return createAuthUser({
    username,
    password,
    display: profile.display,
    role: profile.role,
    companyId: profile.companyId,
    companyName: profile.companyName,
    generalJobsCountries: profile.generalJobsCountries,
  });
}

// ── Rate limiter ──────────────────────────────────────────────────────────────
// Per-IP: max 10 auth requests per minute to slow credential stuffing.
// Module-level state (per serverless instance); good enough for low-volume API.
const _authHits = new Map();
function isAuthRateLimited(ip) {
  const now = Date.now();
  const window = 60_000;
  const limit = 10;
  const entry = _authHits.get(ip) || { count: 0, start: now };
  if (now - entry.start > window) { entry.count = 0; entry.start = now; }
  entry.count += 1;
  _authHits.set(ip, entry);
  return entry.count > limit;
}

function getAllowedOrigin(req) {
  const configured = process.env.DRECO_ALLOWED_ORIGIN;
  if (configured) return configured;
  const origin = req.headers.origin || '';
  if (/^https:\/\/([a-z0-9-]+\.)?vercel\.app$/.test(origin)) return origin;
  return 'null';
}

module.exports = async function handler(req, res) {
  const origin = getAllowedOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (isAuthRateLimited(ip)) return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = body.action;

    if (action === 'recovery_request') {
      const recoveryCode = process.env.DRECO_RECOVERY_CODE;
      if (!recoveryCode) throw new Error('Recovery is not configured.');
      if (String(body.code || '').trim() !== recoveryCode) throw new Error('Incorrect recovery code.');
      return res.status(200).json({
        ok: true,
        message: 'For security, staff passwords are not displayed in the browser. Ask an administrator to reset the account from the profile/settings workflow.',
      });
    }

    const username = cleanUsername(body.username);
    const password = String(body.password || '');
    const display = String(body.display || '').trim();

    if (username && !/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error('Username must be 3-32 letters, numbers, dots, underscores, or hyphens.');
    if ((action === 'create_workspace' || action === 'create_user') && !display) throw new Error('Display name is required.');
    if (['create_workspace', 'create_user', 'reset_password'].includes(action) && password.length < 8) throw new Error('Password must be at least 8 characters.');

    if (action === 'create_workspace') {
      // Fail closed: workspace signup must be explicitly enabled with a secret.
      const signupSecret = process.env.DRECO_SIGNUP_SECRET;
      if (!signupSecret) throw new Error('Workspace signup is disabled. Contact the administrator.');
      if (String(body.signupSecret || '').trim() !== signupSecret) {
        throw new Error('Invalid signup token. Contact the administrator.');
      }
      const companyName = String(body.companyName || '').trim();
      if (!companyName) throw new Error('Company name is required.');
      // The tenant id is server-generated and unguessable. It is NEVER derived
      // from user input, so a new workspace can never collide with — or silently
      // join — an existing tenant (RLS authorizes rows by company_id).
      const companyId = require('crypto').randomUUID();
      const account = await createAuthUser({
        username,
        password,
        display,
        role: 'admin',
        companyId,
        companyName,
        generalJobsCountries: getDefaultCompany().generalJobsCountries,
      });
      return res.status(200).json({ account });
    }

    if (action === 'create_user') {
      const caller = await getCallerUser(req);
      const meta = caller?.app_metadata || {};
      if (!caller || meta.role !== 'admin' || !meta.company_id) throw new Error('Only authenticated company admins can add users.');
      const role = body.role === 'admin' ? 'admin' : 'staff';
      const account = await createAuthUser({
        username,
        password,
        display,
        role,
        companyId: meta.company_id,
        companyName: meta.company_name,
        generalJobsCountries: Array.isArray(meta.general_jobs_countries) ? meta.general_jobs_countries : getDefaultCompany().generalJobsCountries,
      });
      return res.status(200).json({ account });
    }

    if (action === 'request_email_verification') {
      const caller = await getCallerUser(req);
      const meta = caller?.app_metadata || {};
      if (!caller || !meta.username) throw new Error('Sign in before verifying an email.');
      const email = cleanEmail(body.email);
      if (!isEmail(email)) throw new Error('Enter a valid email address.');
      const code = randomCode();
      const accountUsername = cleanUsername(meta.username);
      await saveAppSetting(`dreco_email_verify_${accountUsername}`, {
        email,
        hash: hashCode(code),
        expiresAt: nowPlus(15),
      });
      await updateCloudAccount(accountUsername, { email, emailVerified: false });
      await syncAuthAccountMetadata(accountUsername, {
        account_email: email,
        account_email_verified: false,
      });
      await sendEmail({
        to: email,
        subject: 'Verify your Dreco email',
        text: `Your Dreco verification code is ${code}. It expires in 15 minutes.`,
        html: `<p>Your Dreco verification code is:</p><h2 style="letter-spacing:4px">${code}</h2><p>This code expires in 15 minutes.</p>`,
      });
      return res.status(200).json({ ok: true, email });
    }

    if (action === 'verify_email') {
      const caller = await getCallerUser(req);
      const meta = caller?.app_metadata || {};
      if (!caller || !meta.username) throw new Error('Sign in before verifying an email.');
      const accountUsername = cleanUsername(meta.username);
      const saved = await loadAppSetting(`dreco_email_verify_${accountUsername}`);
      if (!saved?.hash || !saved?.email) throw new Error('Request a verification code first.');
      if (Date.now() > Date.parse(saved.expiresAt || 0)) throw new Error('Verification code expired. Request a new one.');
      if (hashCode(body.code) !== saved.hash) throw new Error('Incorrect verification code.');
      await updateCloudAccount(accountUsername, { email: saved.email, emailVerified: true });
      const account = await syncAuthAccountMetadata(accountUsername, {
        account_email: saved.email,
        account_email_verified: true,
      });
      await saveAppSetting(`dreco_email_verify_${accountUsername}`, { usedAt: new Date().toISOString() });
      return res.status(200).json({ ok: true, account });
    }

    if (action === 'send_recovery_email') {
      if (!username) throw new Error('Username is required.');
      const cloudAccount = await loadCloudAccount(username);
      const existing = await findAuthUserByUsername(username);
      const meta = existing?.app_metadata || {};
      const email = cleanEmail(cloudAccount?.email || meta.account_email || '');
      const verified = cloudAccount?.emailVerified === true || meta.account_email_verified === true;
      if (email && verified) {
        const code = randomCode();
        await saveAppSetting(`dreco_reset_${username}`, {
          hash: hashCode(code),
          expiresAt: nowPlus(15),
        });
        await sendEmail({
          to: email,
          subject: 'Your Dreco password reset code',
          text: `Your Dreco password reset code is ${code}. It expires in 15 minutes.`,
          html: `<p>Your Dreco password reset code is:</p><h2 style="letter-spacing:4px">${code}</h2><p>This code expires in 15 minutes. If you did not request it, ignore this email.</p>`,
        });
      }
      return res.status(200).json({ ok: true, message: 'If a verified email exists for this account, a recovery code has been sent.' });
    }

    if (action === 'reset_password') {
      const recoveryCode = process.env.DRECO_RECOVERY_CODE;
      const suppliedCode = String(body.code || '').trim();
      let codeOk = recoveryCode && suppliedCode === recoveryCode;
      if (!codeOk) {
        const saved = await loadAppSetting(`dreco_reset_${username}`);
        if (saved?.hash && Date.now() <= Date.parse(saved.expiresAt || 0) && hashCode(suppliedCode) === saved.hash) {
          codeOk = true;
          await saveAppSetting(`dreco_reset_${username}`, { usedAt: new Date().toISOString() });
        }
      }
      if (!codeOk) throw new Error('Incorrect or expired recovery code.');
      const account = await resetAuthPassword({ username, password, display });
      return res.status(200).json({ account, message: 'Password reset. You can sign in now.' });
    }

    throw new Error('Unknown auth action.');
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Auth request failed.' });
  }
};
