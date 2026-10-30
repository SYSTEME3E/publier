// Fonction Vercel : publie sur la Page Facebook et journalise dans Supabase.
const VERSION = 'v26.0';
const {
  PAGE_ID, PAGE_TOKEN, APP_PASSWORD,
  SUPABASE_URL = 'https://vxefmhkoojbjxtczjujo.supabase.co',
  SUPABASE_KEY = 'sb_publishable_T_aNobx9dQA29cdoF4pWtA_rM2lNiA2',
} = process.env;

async function log(row) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/publications`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
  } catch {}
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  const { password, message = '', mediaUrl, mediaType = 'text' } = req.body || {};

  if (!PAGE_ID || !PAGE_TOKEN || !APP_PASSWORD) {
    return res.status(500).json({ error: 'PAGE_ID, PAGE_TOKEN ou APP_PASSWORD manque dans les variables Vercel.' });
  }
  if (password !== APP_PASSWORD) return res.status(401).json({ error: 'Mot de passe incorrect.' });
  if (mediaUrl && !mediaUrl.startsWith(`${SUPABASE_URL}/storage/v1/object/public/media/`)) {
    return res.status(400).json({ error: 'Fichier non autorisé.' });
  }
  if (!mediaUrl && !message.trim()) return res.status(400).json({ error: 'Écris un texte ou ajoute un fichier.' });

  const form = new URLSearchParams({ access_token: PAGE_TOKEN });
  let url;
  if (mediaUrl && mediaType === 'image') {
    url = `https://graph.facebook.com/${VERSION}/${PAGE_ID}/photos`;
    form.set('url', mediaUrl); form.set('caption', message);
  } else if (mediaUrl && mediaType === 'video') {
    url = `https://graph-video.facebook.com/${VERSION}/${PAGE_ID}/videos`;
    form.set('file_url', mediaUrl); form.set('description', message);
  } else {
    url = `https://graph.facebook.com/${VERSION}/${PAGE_ID}/feed`;
    form.set('message', message);
  }

  try {
    const r = await fetch(url, { method: 'POST', body: form });
    const data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error?.message || 'Erreur Facebook.');
    const id = data.post_id || data.id;
    await log({ message, media_url: mediaUrl || null, media_type: mediaUrl ? mediaType : 'text', facebook_id: id, status: 'ok' });
    return res.status(200).json({ ok: true, id });
  } catch (e) {
    await log({ message, media_url: mediaUrl || null, media_type: mediaUrl ? mediaType : 'text', status: 'error', error: e.message });
    return res.status(500).json({ error: e.message });
  }
};
