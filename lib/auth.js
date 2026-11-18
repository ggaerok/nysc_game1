// 관리 키 확인. ADMIN_KEY 환경변수가 없으면 누구나 허용한다.
const crypto = require('crypto');
function keyRequired() { return !!process.env.ADMIN_KEY; }
function keyOk(provided) {
  const k = process.env.ADMIN_KEY;
  if (!k) return true;
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided), b = Buffer.from(k);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function bodyOf(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  return b && typeof b === 'object' ? b : {};
}
module.exports = { keyRequired, keyOk, bodyOf };
