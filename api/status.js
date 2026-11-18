// GET  /api/status            -> { open, changedAt, keyRequired }
// POST /api/status {open,key} -> 운영 시작/종료 (ADMIN_KEY 환경변수를 설정했다면 key 필요)
const crypto = require('crypto');
const store = require('../lib/store');

function keyOk(provided) {
  const k = process.env.ADMIN_KEY;
  if (!k) return true;
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided), b = Buffer.from(k);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  const keyRequired = !!process.env.ADMIN_KEY;
  try {
    if (req.method === 'GET') {
      const s = await store.getStatus();
      return res.status(200).json({ open: s.open, changedAt: s.changedAt, keyRequired });
    }
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      body = body || {};
      if (typeof body.open !== 'boolean') return res.status(400).json({ error: 'open must be boolean' });
      if (!keyOk(body.key)) return res.status(401).json({ error: 'unauthorized' });
      const s = await store.setStatus(body.open);
      return res.status(200).json({ open: s.open, changedAt: s.changedAt, keyRequired });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    return res.status(500).json({ error: e && e.code === 'STORAGE' ? 'storage_not_configured' : 'storage_error', keyRequired });
  }
};
