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

async function supabaseAdminFetch(path, options = {}) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable.');
  }
  const response = await fetch(`${url.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.msg || data?.message || data?.error_description || data?.error || 'Supabase request failed.');
  }
  return data;
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
    const data = await supabaseAdminFetch('/rest/v1/app_settings?key=eq.dreco_accounts_v2&select=value', {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    const row = Array.isArray(data) ? data[0] : null;
    const account = row?.value?.[username];
    return account && typeof account === 'object' ? account : null;
  } catch {
    return null;
  }
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

    if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error('Username must be 3-32 letters, numbers, dots, underscores, or hyphens.');
    if ((action === 'create_workspace' || action === 'create_user') && !display) throw new Error('Display name is required.');
    if (password.length < 8) throw new Error('Password must be at least 8 characters.');

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

    if (action === 'reset_password') {
      const recoveryCode = process.env.DRECO_RECOVERY_CODE;
      if (!recoveryCode) throw new Error('Recovery is not configured.');
      if (String(body.code || '').trim() !== recoveryCode) throw new Error('Incorrect recovery code.');
      const account = await resetAuthPassword({ username, password, display });
      return res.status(200).json({ account, message: 'Password reset. You can sign in now.' });
    }

    throw new Error('Unknown auth action.');
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Auth request failed.' });
  }
};
