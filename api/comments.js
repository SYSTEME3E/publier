const { PAGE_ID, g, send, guard, isNeg } = require('./_fb');

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    if (req.method === 'GET') {
      const d = await g(`${PAGE_ID}/posts`, {
        fields: 'permalink_url,message,comments.limit(30).order(reverse_chronological){id,message,from,created_time,comment_count,is_hidden}',
        limit: '10',
      });
      const rows = [];
      (d.data || []).forEach((p) => (p.comments?.data || []).forEach((c) => {
        rows.push({ id: c.id, message: c.message || '', from: c.from?.name || 'Anonyme', created: c.created_time,
          mine: c.from?.id === PAGE_ID, replied: (c.comment_count || 0) > 0, hidden: !!c.is_hidden, negative: isNeg(c.message),
          post: p.permalink_url, postText: (p.message || '').slice(0, 60) });
      }));
      rows.sort((a, b) => new Date(b.created) - new Date(a.created));
      return res.status(200).json({ comments: rows, scanned: (d.data || []).length });
    }
    if (req.method === 'POST') {
      const { action, id, message } = req.body || {};
      if (!/^[\d_]+$/.test(id || '')) return res.status(400).json({ error: 'Identifiant invalide.' });
      if (action === 'reply') {
        if (!message?.trim()) return res.status(400).json({ error: 'Écris une réponse.' });
        await send(`${id}/comments`, { message });
      } else if (action === 'hide') await send(id, { is_hidden: 'true' });
      else if (action === 'delete') await send(id, {}, 'DELETE');
      else return res.status(400).json({ error: 'Action inconnue.' });
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Méthode non autorisée.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
