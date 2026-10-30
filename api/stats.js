const { PAGE_ID, g, guard, isNeg } = require('./_fb');

const sum = (a) => a.reduce((s, x) => s + (x || 0), 0);
const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);

async function metric(name, since, until) {
  const d = await g(`${PAGE_ID}/insights`, { metric: name, period: 'day', since, until });
  return (d.data?.[0]?.values || []).map((v) => (typeof v.value === 'number' ? v.value : 0));
}

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  const alerts = [];
  try {
    const now = Math.floor(Date.now() / 1000);
    const [page, posts] = await Promise.all([
      g(PAGE_ID, { fields: 'name,fan_count,followers_count' }),
      g(`${PAGE_ID}/posts`, {
        fields: 'id,message,created_time,permalink_url,shares,reactions.limit(0).summary(true),comments.limit(25).summary(true){id,message,from,created_time}',
        limit: '15',
      }),
    ]);

    // Statistiques de la Page (chaque métrique isolée : si l'une échoue, les autres passent)
    const names = ['page_media_view', 'page_post_engagements', 'page_daily_follows', 'page_daily_unfollows'];
    const got = await Promise.allSettled(names.map((n) => metric(n, now - 14 * 86400, now)));
    const M = {}; let insightErr = null;
    got.forEach((r, i) => { if (r.status === 'fulfilled') M[names[i]] = r.value; else insightErr = r.reason.message; });
    const last7 = (k) => sum((M[k] || []).slice(-7));
    const prev7 = (k) => sum((M[k] || []).slice(-14, -7));

    // Visibilité par publication (10 dernières)
    const list = posts.data || [];
    const views = await Promise.allSettled(list.slice(0, 10).map((p) => g(`${p.id}/insights`, { metric: 'post_media_view' })));
    const out = list.map((p, i) => ({
      id: p.id, message: p.message || '', created: p.created_time, url: p.permalink_url,
      reactions: p.reactions?.summary?.total_count || 0,
      comments: p.comments?.summary?.total_count || 0,
      shares: p.shares?.count || 0,
      views: views[i]?.status === 'fulfilled' ? views[i].value.data?.[0]?.values?.[0]?.value ?? null : null,
    }));

    // --- Alertes ---
    const negatives = [];
    list.forEach((p) => (p.comments?.data || []).forEach((c) => {
      if (c.from?.id !== PAGE_ID && isNeg(c.message)) negatives.push({ id: c.id, message: c.message, from: c.from?.name || 'Anonyme', post: p.permalink_url });
    }));
    if (negatives.length) alerts.push({ level: 'danger', title: `${negatives.length} commentaire(s) négatif(s)`, text: 'Réponds ou masque-les depuis la page Commentaires.', go: '#comments' });

    if (insightErr) alerts.push({ level: 'info', title: 'Statistiques de la Page indisponibles', text: `Vérifie l’autorisation read_insights. (${insightErr})` });
    else {
      const v = pct(last7('page_media_view'), prev7('page_media_view'));
      if (v !== null && v <= -20) alerts.push({ level: 'warn', title: `Visibilité en baisse de ${Math.abs(v)} %`, text: 'Tes vues des 7 derniers jours sont plus basses que la semaine d’avant. Publie plus régulièrement, avec des vidéos si possible.' });
      if (last7('page_daily_unfollows') > last7('page_daily_follows') && last7('page_daily_unfollows') > 0) alerts.push({ level: 'warn', title: 'Plus de désabonnements que d’abonnements', text: 'Cette semaine, tu perds des abonnés. Revois le contenu ou la fréquence.' });
    }

    const lastDate = list[0] && new Date(list[0].created_time);
    const days = lastDate ? Math.floor((Date.now() - lastDate) / 86400000) : null;
    if (days === null || days >= 7) alerts.push({ level: 'warn', title: 'Page inactive', text: days === null ? 'Aucune publication trouvée.' : `Dernière publication il y a ${days} jours. Facebook réduit la portée des Pages qui publient peu.`, go: '#publish' });

    const withViews = out.filter((p) => p.views !== null).map((p) => p.views).sort((a, b) => a - b);
    if (withViews.length >= 4) {
      const med = withViews[Math.floor(withViews.length / 2)];
      const weak = out.filter((p) => p.views !== null && p.views < med * 0.4);
      if (weak.length) alerts.push({ level: 'info', title: `${weak.length} publication(s) sans visibilité`, text: 'Très en dessous de ta médiane. Regarde la page Publications pour voir lesquelles.', go: '#posts' });
    }
    const silent = out.filter((p) => p.views > 100 && p.reactions + p.comments + p.shares === 0).length;
    if (silent) alerts.push({ level: 'info', title: `${silent} publication(s) vue(s) mais sans interaction`, text: 'Le contenu est vu mais n’accroche pas : ajoute une question ou un appel à l’action.' });
    if (!alerts.length) alerts.push({ level: 'ok', title: 'Tout va bien', text: 'Aucun problème détecté pour le moment.' });

    res.status(200).json({
      page: { name: page.name, followers: page.followers_count ?? page.fan_count },
      kpis: {
        views: last7('page_media_view'), viewsDelta: pct(last7('page_media_view'), prev7('page_media_view')),
        engagement: last7('page_post_engagements'), engagementDelta: pct(last7('page_post_engagements'), prev7('page_post_engagements')),
        follows: last7('page_daily_follows') - last7('page_daily_unfollows'),
      },
      daily: M.page_media_view || [], posts: out, alerts,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
