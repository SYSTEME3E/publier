// Utilitaires YouTube partagés (le préfixe _ empêche Vercel d'en faire une route).
// Plusieurs chaînes : YT_REFRESH_TOKEN (chaîne 1), YT_REFRESH_TOKEN_2 … YT_REFRESH_TOKEN_5.
// Même YT_CLIENT_ID et YT_CLIENT_SECRET pour toutes les chaînes.
const { isNeg } = require('./_fb');
const { APP_PASSWORD, YT_CLIENT_ID, YT_CLIENT_SECRET } = process.env;

function channels() {
  const keys = ['YT_REFRESH_TOKEN', 'YT_REFRESH_TOKEN_2', 'YT_REFRESH_TOKEN_3', 'YT_REFRESH_TOKEN_4', 'YT_REFRESH_TOKEN_5'];
  return keys.map((k, i) => ({ n: i + 1, token: process.env[k] })).filter((c) => c.token);
}

function guard(req, res) {
  if (!APP_PASSWORD || !YT_CLIENT_ID || !YT_CLIENT_SECRET || !channels().length) {
    res.status(500).json({ error: 'YT_CLIENT_ID, YT_CLIENT_SECRET ou YT_REFRESH_TOKEN manque dans les variables Vercel.' });
    return false;
  }
  if (req.headers['x-password'] !== APP_PASSWORD) { res.status(401).json({ error: 'Mot de passe incorrect.' }); return false; }
  return true;
}

// Numéro de chaîne demandé (?c=2 ou champ "channel"), 1 par défaut.
function pick(req) {
  const n = Number(req.query?.c || req.body?.channel || 1) || 1;
  const ch = channels().find((c) => c.n === n);
  if (!ch) throw new Error(`Chaîne ${n} non configurée dans Vercel.`);
  return ch;
}

const cache = new Map();
async function accessToken(ch) {
  const hit = cache.get(ch.n);
  if (hit && hit.exp > Date.now() + 60000) return hit.token;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ client_id: YT_CLIENT_ID, client_secret: YT_CLIENT_SECRET, refresh_token: ch.token, grant_type: 'refresh_token' }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Connexion Google refusée : ' + (d.error_description || d.error || r.status));
  cache.set(ch.n, { token: d.access_token, exp: Date.now() + (d.expires_in || 3000) * 1000 });
  return d.access_token;
}

// Appel à l'API YouTube Data v3
async function yt(ch, path, { method = 'GET', params = {}, body } = {}) {
  const token = await accessToken(ch);
  const q = new URLSearchParams(params);
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${q}`, {
    method,
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return {};
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = d.error || {};
    const reason = e.errors?.[0]?.reason || '';
    if (reason === 'insufficientPermissions' || /insufficient/i.test(e.message || '')) {
      throw new Error('Autorisation insuffisante : refais le jeton de cette chaîne avec le scope youtube.force-ssl.');
    }
    if (reason === 'quotaExceeded') throw new Error('Quota YouTube du jour épuisé. Réessaie demain.');
    throw new Error(e.message || 'Erreur YouTube.');
  }
  return d;
}

module.exports = { channels, guard, pick, accessToken, yt, isNeg };
