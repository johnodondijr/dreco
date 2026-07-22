function splitCountries(value) {
  return String(value || '')
    .split(',')
    .map(country => country.trim())
    .filter(Boolean);
}

// Simple in-memory rate limiter (per serverless instance).
// Limits config endpoint to 30 requests per IP per minute to prevent enumeration.
const _configHits = new Map();
function isConfigRateLimited(ip) {
  const now = Date.now();
  const window = 60_000;
  const limit = 30;
  const entry = _configHits.get(ip) || { count: 0, start: now };
  if (now - entry.start > window) { entry.count = 0; entry.start = now; }
  entry.count += 1;
  _configHits.set(ip, entry);
  return entry.count > limit;
}

function getAllowedOrigin(req) {
  const configured = process.env.DRECO_ALLOWED_ORIGIN;
  if (configured) return configured;
  // Fall back to the request origin if it looks like our own domain
  const origin = req.headers.origin || '';
  if (/^https:\/\/([a-z0-9-]+\.)?vercel\.app$/.test(origin)) return origin;
  return 'null'; // deny unknown origins
}

module.exports = async function handler(req, res) {
  const origin = getAllowedOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (isConfigRateLimited(ip)) return res.status(429).json({ error: 'Too many requests' });

  const countries = splitCountries(process.env.DRECO_GENERAL_JOBS_COUNTRIES);
  const retiredUsernames = splitCountries(process.env.DRECO_RETIRED_USERNAMES).map(name => name.toLowerCase());
  const blockedAdminAliases = splitCountries(process.env.DRECO_BLOCKED_ADMIN_ALIASES).map(name => name.toLowerCase());
  return res.status(200).json({
    supabase: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
    },
    defaultCompany: {
      id: process.env.DRECO_DEFAULT_COMPANY_ID || 'dreco-workspace',
      name: process.env.DRECO_DEFAULT_COMPANY_NAME || 'Recruitflow Workspace',
      generalJobsCountries: countries.length ? countries : ['General'],
    },
    defaultAdminUsername: process.env.DRECO_DEFAULT_ADMIN_USERNAME || 'admin',
    retiredUsernames,
    blockedAdminAliases,
  });
};

