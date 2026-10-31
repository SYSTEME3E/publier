// YouTube : envoi d'une vidéo avec l'API officielle (YouTube Data API v3, videos.insert).
// La vidéo est envoyée en PRIVÉ : tant que le projet Google n'a pas passé l'audit YouTube, c'est obligatoire.
const { guard } = require('./_fb');
const {
  YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN,
  SUPABASE_URL = 'https://vxefmhkoojbjxtczjujo.supabase.co',
  SUPABASE_KEY = 'sb_publishable_T_aNobx9dQA29cdoF4pWtA_rM2lNiA2',
} = process.env;

// Journal dans la table « publications » (même historique que Facebook)
async function log(row) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/publications`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
  } catch {}
}
const MEDIA = 'https://vxefmhkoojbjxtczjujo.supabase.co/storage/v1/object/public/media/';

async function accessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ client_id: YT_CLIENT_ID, client_secret: YT_CLIENT_SECRET, refresh_token: YT_REFRESH_TOKEN, grant_type: 'refresh_token' }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Connexion Google refusée : ' + (d.error_description || d.error || r.status));
  return d.access_token;
}

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) {
    return res.status(500).json({ error: 'YT_CLIENT_ID, YT_CLIENT_SECRET ou YT_REFRESH_TOKEN manque dans les variables Vercel.' });
  }
  const b = req.body || {};
  if (!String(b.mediaUrl || '').startsWith(MEDIA)) return res.status(400).json({ error: 'Fichier non valide.' });
  const title = String(b.title || '').split('\n')[0].trim().slice(0, 100) || 'Vidéo';
  const description = String(b.description || '').slice(0, 4900);

  try {
    const token = await accessToken();
    const file = await fetch(b.mediaUrl);
    if (!file.ok) throw new Error('Fichier introuvable dans Supabase.');
    const buf = Buffer.from(await file.arrayBuffer());
    const type = file.headers.get('content-type') || 'video/mp4';

    // 1) Ouvre une session d'envoi
    const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(buf.length),
        'X-Upload-Content-Type': type,
      },
      body: JSON.stringify({
        snippet: { title, description, categoryId: '22' },
        status: { privacyStatus: 'private', selfDeclaredMadeForKids: false },
      }),
    });
    if (!init.ok) {
      const e = await init.json().catch(() => ({}));
      throw new Error(e.error?.message || 'YouTube a refusé la demande.');
    }

    // 2) Envoie la vidéo
    const up = await fetch(init.headers.get('location'), { method: 'PUT', headers: { 'Content-Type': type }, body: buf });
    const d = await up.json().catch(() => ({}));
    if (!up.ok) throw new Error(d.error?.message || 'Échec de l’envoi à YouTube.');
    await log({ message: title, media_url: b.mediaUrl, media_type: 'video', youtube_id: d.id, status: 'ok' });
    res.status(200).json({ ok: true, id: d.id });
  } catch (e) {
    await log({ message: title, media_url: b.mediaUrl, media_type: 'video', status: 'error', error: 'YouTube : ' + e.message });
    res.status(500).json({ error: e.message });
  }
};
