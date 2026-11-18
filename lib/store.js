// 운영 상태({ open, changedAt })를 저장하고 읽는다.
// - 배포(Vercel): Marketplace의 Upstash Redis가 넣어 주는 환경변수(KV_REST_API_URL/TOKEN 또는 UPSTASH_REDIS_REST_URL/TOKEN)를 사용
// - 로컬 개발/시험: STATUS_FILE 환경변수로 지정한 파일 사용 (배포 환경에서는 쓰지 않는다)
// - 둘 다 없으면 오류를 던진다 -> 호출하는 쪽은 '운영 종료'로 취급한다 (fail-closed)
const fs = require('fs');

const KEY = 'nysc_game1:status';

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function redis(cfg, command) {
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error('redis http ' + r.status);
  const j = await r.json();
  if (j && j.error) throw new Error('redis ' + j.error);
  return j ? j.result : null;
}

function parse(raw) {
  if (!raw) return { open: false, changedAt: 0 };
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { open: v && v.open === true, changedAt: Number(v && v.changedAt) || 0 };
  } catch (e) {
    return { open: false, changedAt: 0 };
  }
}

function notConfigured() {
  const e = new Error('storage_not_configured');
  e.code = 'STORAGE';
  return e;
}

async function getStatus() {
  const cfg = redisConfig();
  if (cfg) return parse(await redis(cfg, ['GET', KEY]));
  if (process.env.STATUS_FILE) {
    try { return parse(fs.readFileSync(process.env.STATUS_FILE, 'utf8')); } catch (e) { return { open: false, changedAt: 0 }; }
  }
  throw notConfigured();
}

async function setStatus(open) {
  const value = { open: open === true, changedAt: Date.now() };
  const cfg = redisConfig();
  if (cfg) {
    await redis(cfg, ['SET', KEY, JSON.stringify(value)]);
    return value;
  }
  if (process.env.STATUS_FILE) {
    fs.writeFileSync(process.env.STATUS_FILE, JSON.stringify(value));
    return value;
  }
  throw notConfigured();
}

module.exports = { getStatus, setStatus };
