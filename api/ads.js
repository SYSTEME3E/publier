// Publicité : rapports (ads_read) et boost de publication (ads_management).
// Utilise un token UTILISATEUR (ADS_TOKEN), pas le token de Page.
const { PAGE_ID, g, send, guard } = require('./_fb');
const { ADS_TOKEN, AD_ACCOUNT_ID, MAX_DAILY_BUDGET = '10' } = process.env;
const ZERO = ['XOF', 'XAF', 'JPY', 'KRW', 'VND', 'CLP', 'UGX', 'RWF', 'GNF', 'PYG', 'KMF'];
const acct = () => 'act_' + String(AD_ACCOUNT_ID).replace(/^act_/, '');
const G = (p, q = {}) => g(p, { access_token: ADS_TOKEN, ...q });
const S = (p, q = {}) => send(p, { access_token: ADS_TOKEN, ...q });

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  if (!ADS_TOKEN || !AD_ACCOUNT_ID) return res.status(500).json({ error: 'ADS_TOKEN ou AD_ACCOUNT_ID manque dans les variables Vercel.' });
  try {
    if (req.method === 'GET') {
      const [account, sum, camps] = await Promise.all([
        G(acct(), { fields: 'name,currency,account_status,amount_spent,balance' }),
        G(`${acct()}/insights`, { fields: 'spend,impressions,reach,clicks', date_preset: 'last_7d' }),
        G(`${acct()}/campaigns`, { fields: 'name,effective_status,daily_budget,insights.date_preset(last_7d){spend,impressions,reach,clicks}', limit: '20' }),
      ]);
      return res.status(200).json({ account, max: Number(MAX_DAILY_BUDGET), total: sum.data?.[0] || {}, campaigns: camps.data || [] });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
    const b = req.body || {};

    if (b.action === 'status') {
      if (!/^\d+$/.test(b.id || '') || !['ACTIVE', 'PAUSED'].includes(b.status)) return res.status(400).json({ error: 'Demande invalide.' });
      await S(b.id, { status: b.status });
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'boost') {
      const budget = Number(b.dailyBudget), days = Math.round(Number(b.days));
      const countries = String(b.countries || '').toUpperCase().split(/[\s,]+/).filter((c) => /^[A-Z]{2}$/.test(c));
      if (!/^\d+_\d+$/.test(b.postId || '')) return res.status(400).json({ error: 'Publication invalide.' });
      if (!(budget > 0)) return res.status(400).json({ error: 'Budget invalide.' });
      if (budget > Number(MAX_DAILY_BUDGET)) return res.status(400).json({ error: `Budget maximum par jour : ${MAX_DAILY_BUDGET} (réglable avec MAX_DAILY_BUDGET).` });
      if (!(days >= 1 && days <= 30)) return res.status(400).json({ error: 'Durée : 1 à 30 jours.' });
      if (!countries.length) return res.status(400).json({ error: 'Indique au moins un pays (ex : FR, CI, SN).' });

      const { currency } = await G(acct(), { fields: 'currency' });
      const minor = ZERO.includes(currency) ? Math.round(budget) : Math.round(budget * 100);
      const name = 'Boost ' + b.postId;
      const end = new Date(Date.now() + days * 86400000).toISOString();

      const camp = await S(`${acct()}/campaigns`, { name, objective: 'OUTCOME_ENGAGEMENT', status: 'PAUSED', special_ad_categories: '[]', is_adset_budget_sharing_enabled: 'false' });
      const set = await S(`${acct()}/adsets`, {
        name, campaign_id: camp.id, daily_budget: String(minor), billing_event: 'IMPRESSIONS', optimization_goal: 'POST_ENGAGEMENT',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP', destination_type: 'ON_POST', promoted_object: JSON.stringify({ page_id: PAGE_ID }),
        targeting: JSON.stringify({ geo_locations: { countries }, age_min: 18 }), end_time: end, status: 'PAUSED',
      });
      const cr = await S(`${acct()}/adcreatives`, { name, object_story_id: b.postId });
      const ad = await S(`${acct()}/ads`, { name, adset_id: set.id, creative: JSON.stringify({ creative_id: cr.id }), status: 'PAUSED' });
      await S(ad.id, { status: 'ACTIVE' }); await S(set.id, { status: 'ACTIVE' }); await S(camp.id, { status: 'ACTIVE' });
      return res.status(200).json({ ok: true, campaign: camp.id });
    }
    res.status(400).json({ error: 'Action inconnue.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
