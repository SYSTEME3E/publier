const { guard } = require('./_fb');
const { SUPABASE_URL = 'https://vxefmhkoojbjxtczjujo.supabase.co', SUPABASE_KEY = 'sb_publishable_T_aNobx9dQA29cdoF4pWtA_rM2lNiA2' } = process.env;

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/publications?select=*&order=created_at.desc&limit=30`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || 'Lecture de l’historique impossible.');
    res.status(200).json({ items: d });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
