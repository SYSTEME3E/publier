// Statistiques d'une chaîne YouTube (chaîne, 15 dernières vidéos, alertes)
const { guard, pick, yt, isNeg } = require('./_yt');

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  const alerts = [];
  try {
    const ch = pick(req);
    const c = await yt(ch, 'channels', { params: { part: 'snippet,statistics,contentDetails', mine: 'true' } });
    const info = c.items?.[0];
    if (!info) throw new Error('Aucune chaîne YouTube trouvée pour ce compte.');
    const uploads = info.contentDetails?.relatedPlaylists?.uploads;
    let ids = [];
    if (uploads) {
      const pl = await yt(ch, 'playlistItems', { params: { part: 'contentDetails', playlistId: uploads, maxResults: '15' } });
      ids = (pl.items || []).map((i) => i.contentDetails.videoId);
    }
    let vids = [];
    if (ids.length) {
      const v = await yt(ch, 'videos', { params: { part: 'snippet,statistics,status', id: ids.join(',') } });
      vids = v.items || [];
    }
    const posts = vids.map((v) => ({
      id: v.id, title: v.snippet?.title || '', created: v.snippet?.publishedAt,
      url: 'https://www.youtube.com/watch?v=' + v.id, studio: 'https://studio.youtube.com/video/' + v.id + '/edit',
      thumb: v.snippet?.thumbnails?.medium?.url || null, privacy: v.status?.privacyStatus,
      views: Number(v.statistics?.viewCount ?? 0), likes: Number(v.statistics?.likeCount ?? 0), comments: Number(v.statistics?.commentCount ?? 0),
    }));

    // Alertes
    try {
      const t = await yt(ch, 'commentThreads', { params: { part: 'snippet', allThreadsRelatedToChannelId: info.id, maxResults: '50', order: 'time' } });
      const neg = (t.items || []).filter((x) => isNeg(x.snippet?.topLevelComment?.snippet?.textOriginal)).length;
      if (neg) alerts.push({ level: 'danger', title: `${neg} commentaire(s) négatif(s)`, text: 'Réponds, masque ou supprime-les depuis la page Commentaires YouTube.', go: '#ytcomments' });
    } catch {}
    const last = posts[0] && new Date(posts[0].created);
    const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
    if (days === null || days >= 7) alerts.push({ level: 'warn', title: 'Chaîne inactive', text: days === null ? 'Aucune vidéo trouvée.' : `Dernière vidéo il y a ${days} jours. YouTube recommande les chaînes qui publient régulièrement.`, go: '#publish' });
    const sorted = posts.map((p) => p.views).sort((a, b) => a - b);
    if (sorted.length >= 4) {
      const med = sorted[Math.floor(sorted.length / 2)];
      const weak = posts.filter((p) => p.views < med * 0.4).length;
      if (weak) alerts.push({ level: 'info', title: `${weak} vidéo(s) peu vue(s)`, text: 'Très en dessous de ta médiane. Revois le titre et la miniature.' });
    }
    const silent = posts.filter((p) => p.views > 100 && p.likes + p.comments === 0).length;
    if (silent) alerts.push({ level: 'info', title: `${silent} vidéo(s) vue(s) sans interaction`, text: 'Ajoute une question ou un appel à l’action en début de description.' });
    const priv = posts.filter((p) => p.privacy === 'private').length;
    if (priv) alerts.push({ level: 'info', title: `${priv} vidéo(s) privée(s)`, text: 'Une vidéo privée n’est visible que par toi. Passe-la en public dans YouTube Studio.' });
    if (!alerts.length) alerts.push({ level: 'ok', title: 'Tout va bien', text: 'Aucun problème détecté pour le moment.' });

    const s = info.statistics || {};
    res.status(200).json({
      channel: { n: ch.n, title: info.snippet?.title, thumb: info.snippet?.thumbnails?.default?.url, subs: s.hiddenSubscriberCount ? null : Number(s.subscriberCount), views: Number(s.viewCount || 0), videos: Number(s.videoCount || 0) },
      kpis: { recentViews: posts.reduce((a, p) => a + p.views, 0), recentLikes: posts.reduce((a, p) => a + p.likes, 0), recentComments: posts.reduce((a, p) => a + p.comments, 0) },
      posts, alerts,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
