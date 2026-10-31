// Direct (live) : crée le direct sur YouTube et/ou Facebook et renvoie le serveur + la clé pour OBS.
// La vidéo ne passe pas par ce site : OBS l'envoie directement à YouTube / Facebook.
const { PAGE_ID, g, send, guard } = require('./_fb');
const { pick, yt } = require('./_yt');

const ID = /^[\w-]+$/;
const clean = (t) => String(t || '').replace(/[<>]/g, '');

async function ytCreate(req, title, description, privacy) {
  const ch = pick(req);
  const s = await yt(ch, 'liveStreams', {
    method: 'POST', params: { part: 'snippet,cdn,status' },
    body: { snippet: { title }, cdn: { ingestionType: 'rtmp', resolution: 'variable', frameRate: 'variable' } },
  });
  const bc = await yt(ch, 'liveBroadcasts', {
    method: 'POST', params: { part: 'snippet,status,contentDetails' },
    body: {
      snippet: { title, description, scheduledStartTime: new Date().toISOString() },
      status: { privacyStatus: ['public', 'unlisted', 'private'].includes(privacy) ? privacy : 'private', selfDeclaredMadeForKids: false },
      contentDetails: { enableAutoStart: true, enableAutoStop: true, monitorStream: { enableMonitorStream: false } },
    },
  });
  await yt(ch, 'liveBroadcasts/bind', { method: 'POST', params: { id: bc.id, streamId: s.id, part: 'id' } });
  const i = s.cdn.ingestionInfo;
  return {
    channel: ch.n, broadcastId: bc.id, streamId: s.id,
    server: i.rtmpsIngestionAddress || i.ingestionAddress, key: i.streamName,
    watch: `https://www.youtube.com/watch?v=${bc.id}`, studio: `https://studio.youtube.com/video/${bc.id}/livestreaming`,
    privacy: bc.status?.privacyStatus,
  };
}

async function fbCreate(title, description) {
  const d = await send(`${PAGE_ID}/live_videos`, { title, description, status: 'LIVE_NOW' });
  const m = String(d.secure_stream_url || d.stream_url || '').match(/^(.*\/)([^/]+)$/);
  if (!m) throw new Error('Facebook n’a pas renvoyé d’adresse de diffusion.');
  const link = d.permalink_url ? (d.permalink_url.startsWith('/') ? 'https://www.facebook.com' + d.permalink_url : d.permalink_url) : `https://www.facebook.com/${d.id}`;
  return { id: d.id, server: m[1], key: m[2], watch: link };
}

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  const b = req.body || {};
  try {
    if (b.action === 'create') {
      const title = clean(b.title).trim().slice(0, 100), description = clean(b.description).slice(0, 4900);
      if (!title) return res.status(400).json({ error: 'Donne un titre.' });
      const out = { errors: [] };
      if (b.youtube) try { out.youtube = await ytCreate(req, title, description, b.privacy); } catch (e) { out.errors.push('YouTube : ' + e.message); }
      if (b.facebook) try { out.facebook = await fbCreate(title, description); } catch (e) { out.errors.push('Facebook : ' + e.message); }
      if (!out.youtube && !out.facebook) return res.status(500).json({ error: out.errors.join(' | ') || 'Choisis une plateforme.' });
      return res.status(200).json(out);
    }

    if (b.action === 'status' || b.action === 'end') {
      const y = b.youtube, f = b.facebook;
      if ((y && !(ID.test(y.broadcastId || '') && ID.test(y.streamId || ''))) || (f && !/^\d+$/.test(f.id || ''))) return res.status(400).json({ error: 'Identifiant invalide.' });
      const out = {};
      if (b.action === 'status') {
        if (y) {
          const ch = pick(req);
          const [s, l] = await Promise.all([
            yt(ch, 'liveStreams', { params: { part: 'status', id: y.streamId } }),
            yt(ch, 'liveBroadcasts', { params: { part: 'status', id: y.broadcastId } }),
          ]);
          out.youtube = { life: l.items?.[0]?.status?.lifeCycleStatus, stream: s.items?.[0]?.status?.streamStatus, health: s.items?.[0]?.status?.healthStatus?.status };
        }
        if (f) { const d = await g(f.id, { fields: 'status,live_views' }); out.facebook = { status: d.status, views: d.live_views }; }
        return res.status(200).json(out);
      }
      if (y) {
        const ch = pick(req);
        try { await yt(ch, 'liveBroadcasts/transition', { method: 'POST', params: { id: y.broadcastId, broadcastStatus: 'complete', part: 'status' } }); }
        catch { await yt(ch, 'liveBroadcasts', { method: 'DELETE', params: { id: y.broadcastId } }); }
      }
      if (f) await send(f.id, { end_live_video: 'true' });
      return res.status(200).json({ ok: true });
    }
    res.status(400).json({ error: 'Action inconnue.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
