// 운영 상태, 이번 운영의 최고 점수, 역대 기록(상위 10)을 저장하고 읽는다.
// 저장소 선택 (위에서부터 먼저 있는 것):
//   1) KV_REST_API_URL/TOKEN 또는 UPSTASH_REDIS_REST_URL/TOKEN  (Upstash REST)
//   2) REDIS_URL                                                 (Redis 공식 서비스, redis:// 접속)
//   3) STATUS_FILE                                               (로컬 개발/시험용 파일. 배포에서는 쓰지 않음)
// 아무것도 없으면 오류(code 'STORAGE')를 던지고, 호출하는 쪽은 '운영 종료'로 취급한다 (fail-closed).
//
// Redis 키
//   nysc_game1:status  운영 상태 JSON {open, changedAt, group, sid}
//   nysc_game1:best    이번 운영의 최고 점수 (운영 시작 때 0, 종료 때 삭제)
//   nysc_game1:hall    역대 기록 (sorted set, 멤버 "<sid>|<단체명>", 점수). 항상 상위 10개만 유지
const fs = require('fs');

const K_STATUS = 'nysc_game1:status';
const K_BEST = 'nysc_game1:best';
const K_HALL = 'nysc_game1:hall';
const HALL_SIZE = 10;

// 점수가 지금 최고보다 높을 때만 갱신하고 역대 기록도 같이 올린다 (동시에 여러 명이 보내도 안전)
const LUA_SUBMIT = [
  "local cur = tonumber(redis.call('GET', KEYS[1]) or '0') or 0",
  "local s = tonumber(ARGV[1])",
  "if s > cur then",
  "  redis.call('SET', KEYS[1], ARGV[1])",
  "  redis.call('ZADD', KEYS[2], s, ARGV[2])",
  "  redis.call('ZREMRANGEBYRANK', KEYS[2], 0, -" + (HALL_SIZE + 1) + ")",
  "  return s",
  "end",
  "return cur",
].join('\n');

function notConfigured() {
  const e = new Error('storage_not_configured');
  e.code = 'STORAGE';
  return e;
}

/* ---------- 명령 실행기 ---------- */
function restConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}
async function restRun(cfg, command) {
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

let tcp = null;
async function tcpClient(url) {
  if (tcp && tcp.isOpen && tcp.isReady) return tcp;
  if (tcp) { try { await tcp.disconnect(); } catch (e) {} tcp = null; }
  const { createClient } = require('redis');
  const c = createClient({ url, socket: { connectTimeout: 5000, reconnectStrategy: false } });
  c.on('error', () => {});
  await c.connect();
  tcp = c;
  return c;
}
async function tcpRun(url, command) {
  try {
    const c = await tcpClient(url);
    return await c.sendCommand(command.map(String));
  } catch (e) {
    if (tcp) { try { await tcp.disconnect(); } catch (e2) {} tcp = null; }
    throw e;
  }
}

// 레디스 계열이면 run(command) 함수를, 아니면 null
function redisRunner() {
  const cfg = restConfig();
  if (cfg) return (cmd) => restRun(cfg, cmd);
  if (process.env.REDIS_URL) return (cmd) => tcpRun(process.env.REDIS_URL, cmd);
  return null;
}

/* ---------- 값 해석 ---------- */
function parseStatus(raw) {
  const base = { open: false, changedAt: 0, group: '', sid: 0 };
  if (!raw) return base;
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!v) return base;
    return {
      open: v.open === true,
      changedAt: Number(v.changedAt) || 0,
      group: typeof v.group === 'string' ? v.group : '',
      sid: Number(v.sid) || 0,
    };
  } catch (e) {
    return base;
  }
}
function parseBest(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function memberOf(status) { return status.sid + '|' + status.group; }
function parseMember(member, score) {
  const i = String(member).indexOf('|');
  const sid = Number(String(member).slice(0, i)) || 0;
  return { sid, name: String(member).slice(i + 1), score: Number(score) || 0, at: sid };
}

/* ---------- 파일 저장소 (로컬 시험용) ---------- */
function fileRead() {
  try {
    const v = JSON.parse(fs.readFileSync(process.env.STATUS_FILE, 'utf8'));
    // 이전 형식({open, changedAt})도 읽는다
    if (v && v.status === undefined && v.open !== undefined) return { status: v, best: 0, hall: [] };
    return { status: v.status || null, best: v.best || 0, hall: Array.isArray(v.hall) ? v.hall : [] };
  } catch (e) {
    return { status: null, best: 0, hall: [] };
  }
}
function fileWrite(d) { fs.writeFileSync(process.env.STATUS_FILE, JSON.stringify(d)); }

/* ---------- 공개 함수 ---------- */
// -> { open, changedAt, group, sid, best }
async function getState() {
  const run = redisRunner();
  if (run) {
    const arr = await run(['MGET', K_STATUS, K_BEST]);
    const st = parseStatus(arr && arr[0]);
    return Object.assign(st, { best: st.open ? parseBest(arr && arr[1]) : 0 });
  }
  if (process.env.STATUS_FILE) {
    const d = fileRead();
    const st = parseStatus(d.status);
    return Object.assign(st, { best: st.open ? parseBest(d.best) : 0 });
  }
  throw notConfigured();
}

async function getStatus() { return getState(); }

// 운영 시작: 새 운영(세션)을 만들고 이번 운영의 최고 점수를 0으로 되돌린다
async function startOperation(group) {
  const now = Date.now();
  const st = { open: true, changedAt: now, group: String(group), sid: now };
  const run = redisRunner();
  if (run) {
    await run(['SET', K_BEST, '0']);
    await run(['SET', K_STATUS, JSON.stringify(st)]);
    return Object.assign(st, { best: 0 });
  }
  if (process.env.STATUS_FILE) {
    const d = fileRead();
    fileWrite({ status: st, best: 0, hall: d.hall });
    return Object.assign(st, { best: 0 });
  }
  throw notConfigured();
}

// 운영 종료: 이번 운영의 최고 점수는 지우고, 역대 기록은 남긴다
async function stopOperation() {
  const prev = await getState();
  const st = { open: false, changedAt: Date.now(), group: prev.group, sid: 0 };
  const run = redisRunner();
  if (run) {
    await run(['SET', K_STATUS, JSON.stringify(st)]);
    await run(['DEL', K_BEST]);
    return Object.assign(st, { best: 0 });
  }
  if (process.env.STATUS_FILE) {
    const d = fileRead();
    fileWrite({ status: st, best: 0, hall: d.hall });
    return Object.assign(st, { best: 0 });
  }
  throw notConfigured();
}

// 점수 제출. 운영 중이 아니면 null, 아니면 갱신된 이번 운영 최고 점수를 돌려준다
async function submitScore(score) {
  const st = await getState();
  if (!st.open) return null;
  const member = memberOf(st);
  const run = redisRunner();
  if (run) {
    const best = await run(['EVAL', LUA_SUBMIT, '2', K_BEST, K_HALL, String(score), member]);
    return { best: parseBest(best), group: st.group };
  }
  const d = fileRead();
  let best = parseBest(d.best);
  if (score > best) {
    best = score;
    const hall = d.hall.filter((h) => h.member !== member);
    hall.push({ member, score });
    hall.sort((a, b) => b.score - a.score);
    d.hall = hall.slice(0, HALL_SIZE);
    d.best = best;
    fileWrite(d);
  }
  return { best, group: st.group };
}

// 역대 기록 상위 10 -> [{ name, score, at, sid }]  (점수 높은 순)
async function getHall() {
  const run = redisRunner();
  if (run) {
    const flat = (await run(['ZREVRANGE', K_HALL, '0', String(HALL_SIZE - 1), 'WITHSCORES'])) || [];
    const out = [];
    for (let i = 0; i + 1 < flat.length; i += 2) out.push(parseMember(flat[i], flat[i + 1]));
    return out;
  }
  if (process.env.STATUS_FILE) {
    return fileRead().hall.slice().sort((a, b) => b.score - a.score).slice(0, HALL_SIZE).map((h) => parseMember(h.member, h.score));
  }
  throw notConfigured();
}

async function clearHall() {
  const run = redisRunner();
  if (run) { await run(['DEL', K_HALL]); return; }
  if (process.env.STATUS_FILE) { const d = fileRead(); d.hall = []; fileWrite(d); return; }
  throw notConfigured();
}

module.exports = { getStatus, getState, startOperation, stopOperation, submitScore, getHall, clearHall, HALL_SIZE };
