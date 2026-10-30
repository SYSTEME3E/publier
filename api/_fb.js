// Utilitaires partagés (le préfixe _ empêche Vercel d'en faire une route).
const V = 'v26.0';
const { PAGE_ID, PAGE_TOKEN, APP_PASSWORD } = process.env;

async function g(path, params = {}) {
  const q = new URLSearchParams({ access_token: PAGE_TOKEN, ...params });
  const r = await fetch(`https://graph.facebook.com/${V}/${path}?${q}`);
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error?.message || 'Erreur Facebook.');
  return d;
}
async function send(path, params = {}, method = 'POST') {
  const q = new URLSearchParams({ access_token: PAGE_TOKEN, ...params });
  const r = await fetch(`https://graph.facebook.com/${V}/${path}`, { method, body: method === 'DELETE' ? undefined : q, ...(method === 'DELETE' ? {} : {}) });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error?.message || 'Erreur Facebook.');
  return d;
}
function guard(req, res) {
  if (!PAGE_ID || !PAGE_TOKEN || !APP_PASSWORD) { res.status(500).json({ error: 'Variables Vercel manquantes.' }); return false; }
  if (req.headers['x-password'] !== APP_PASSWORD) { res.status(401).json({ error: 'Mot de passe incorrect.' }); return false; }
  return true;
}
// Détection simple de commentaires négatifs (français + mots courants)
const NEG = /arnaque|escroc|voleur|vol[ée]s?\b|nul+\b|null[e]?s?\b|honte|scandale|d[ée][çc]u|decevant|mauvais|horrible|catastroph|pire\b|fuyez|jamais re|remboursement|menteur|mensonge|inadmissible|incomp[ée]tent|pas s[ée]rieux|merde|d[ée]gueu|spam|faux\b|fake|bad|scam|worst|terrible/i;
const isNeg = (t = '') => NEG.test(t);

module.exports = { PAGE_ID, g, send, guard, isNeg };
