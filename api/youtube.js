// YouTube : GET = liste des chaînes configurées ; POST = envoi d'une vidéo (videos.insert).
// Tant que le projet Google n'a pas passé l'audit YouTube, YouTube force les vidéos en privé.
const { channels, guard, pick, accessToken, yt } = require('./_yt');
const {
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
const PRIVACY = ['private', 'unlisted', 'public'];

module.exports = async (req, res) => {
  if (!guard(req, res)) return;

  if (req.method === 'GET') {
    const list = await Promise.all(channels().map(async (c) => {
      try {
        const d = await yt(c, 'channels', { params: { part: 'snippet', mine: 'true' } });
        return { n: c.n, title: d.items?.[0]?.snippet?.title || `Chaîne ${c.n}` };
      } catch (e) { return { n: c.n, title: `Chaîne ${c.n}`, limited: true }; }
    }));
    return res.status(200).json({ channels: list });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const b = req.body || {};
  if (!String(b.mediaUrl || '').startsWith(MEDIA)) return res.status(400).json({ error: 'Fichier non valide.' });
  const clean = (t) => String(t || '').replace(/[<>]/g, '');
  const title = clean(b.title).split('\n')[0].trim().slice(0, 100) || 'Vidéo';
  const description = clean(b.description).slice(0, 4900);
  const category = ['22', '25', '27', '28', '24', '23', '26', '10', '20', '17', '19', '15'].includes(String(b.category)) ? String(b.category) : '22';
  const lang = ['fr', 'en', 'es', 'pt', 'ar'].includes(b.lang) ? b.lang : '';
  let used = 0;
  const tags = [...new Set(clean(b.tags).split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean))].filter((t) => (used += t.length + 1) <= 450);
  const privacy = PRIVACY.includes(b.privacy) ? b.privacy : 'private';

  try {
    const ch = pick(req);
    const token = await accessToken(ch);
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
        snippet: { title, description, categoryId: category, ...(tags.length ? { tags } : {}), ...(lang ? { defaultLanguage: lang, defaultAudioLanguage: lang } : {}) },
        status: { privacyStatus: privacy, selfDeclaredMadeForKids: !!b.kids },
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
    // 3) Miniature personnalisée (facultative ; la chaîne doit être vérifiée par téléphone)
    let thumbError = null;
    if (String(b.thumbUrl || '').startsWith(MEDIA)) {
      try {
        const t = await fetch(b.thumbUrl);
        if (!t.ok) throw new Error('Miniature introuvable.');
        const tr = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${d.id}`, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': t.headers.get('content-type') || 'image/jpeg' },
          body: Buffer.from(await t.arrayBuffer()),
        });
        if (!tr.ok) { const e = await tr.json().catch(() => ({})); throw new Error(e.error?.message || 'Miniature refusée par YouTube.'); }
      } catch (e) { thumbError = e.message; }
    }
    await log({ message: title, media_url: b.mediaUrl, media_type: 'video', youtube_id: d.id, youtube_channel: String(ch.n), status: 'ok' });
    res.status(200).json({ ok: true, id: d.id, privacy: d.status?.privacyStatus || privacy, thumbError });
  } catch (e) {
    await log({ message: title, media_url: b.mediaUrl, media_type: 'video', status: 'error', error: 'YouTube : ' + e.message });
    res.status(500).json({ error: e.message });
  }
};
