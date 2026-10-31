// Commentaires YouTube : lister, répondre, masquer (mise en attente de modération), supprimer
const { guard, pick, yt, isNeg } = require('./_yt');

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const ch = pick(req);
    if (req.method === 'GET') {
      const me = await yt(ch, 'channels', { params: { part: 'id', mine: 'true' } });
      const channelId = me.items?.[0]?.id;
      if (!channelId) throw new Error('Aucune chaîne YouTube trouvée pour ce compte.');
      const t = await yt(ch, 'commentThreads', { params: { part: 'snippet', allThreadsRelatedToChannelId: channelId, maxResults: '50', order: 'time' } });
      const items = t.items || [];
      const vids = [...new Set(items.map((x) => x.snippet?.videoId).filter(Boolean))].slice(0, 50);
      const titles = {};
      if (vids.length) {
        try { (await yt(ch, 'videos', { params: { part: 'snippet', id: vids.join(',') } })).items?.forEach((v) => { titles[v.id] = v.snippet?.title || ''; }); } catch {}
      }
      const rows = items.map((x) => {
        const c = x.snippet.topLevelComment, s = c.snippet;
        return {
          id: c.id, message: s.textOriginal || '', from: s.authorDisplayName || 'Anonyme', created: s.publishedAt,
          mine: s.authorChannelId?.value === channelId, replied: (x.snippet.totalReplyCount || 0) > 0, negative: isNeg(s.textOriginal),
          post: `https://www.youtube.com/watch?v=${x.snippet.videoId}&lc=${c.id}`, postText: (titles[x.snippet.videoId] || '').slice(0, 60),
        };
      });
      return res.status(200).json({ comments: rows });
    }
    if (req.method === 'POST') {
      const { action, id, message } = req.body || {};
      if (!/^[\w.-]+$/.test(id || '')) return res.status(400).json({ error: 'Identifiant invalide.' });
      if (action === 'reply') {
        if (!message?.trim()) return res.status(400).json({ error: 'Écris une réponse.' });
        await yt(ch, 'comments', { method: 'POST', params: { part: 'snippet' }, body: { snippet: { parentId: id, textOriginal: message.slice(0, 9000) } } });
      } else if (action === 'hide') await yt(ch, 'comments/setModerationStatus', { method: 'POST', params: { id, moderationStatus: 'heldForReview' } });
      else if (action === 'delete') await yt(ch, 'comments', { method: 'DELETE', params: { id } });
      else return res.status(400).json({ error: 'Action inconnue.' });
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Méthode non autorisée.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
