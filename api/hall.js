// GET  /api/hall                  -> { entries: [{ name, score, at, live }], keyRequired }  역대 기록 상위 10
// POST /api/hall { clear:true, key } -> 역대 기록 전체 삭제 (ADMIN_KEY 가 있으면 key 필요)
const store = require('../lib/store');
const { keyRequired, keyOk, bodyOf } = require('../lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  const kr = keyRequired();
  try {
    if (req.method === 'GET') {
      const [list, st] = await Promise.all([store.getHall(), store.getState()]);
      const entries = list.map((e) => ({ name: e.name, score: e.score, at: e.at, live: st.open && e.sid === st.sid }));
      return res.status(200).json({ entries, keyRequired: kr });
    }
    if (req.method === 'POST') {
      const body = bodyOf(req);
      if (body.clear !== true) return res.status(400).json({ error: 'clear must be true', keyRequired: kr });
      if (!keyOk(body.key)) return res.status(401).json({ error: 'unauthorized', keyRequired: kr });
      await store.clearHall();
      return res.status(200).json({ entries: [], keyRequired: kr });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    return res.status(500).json({ error: e && e.code === 'STORAGE' ? 'storage_not_configured' : 'storage_error', keyRequired: kr });
  }
};
