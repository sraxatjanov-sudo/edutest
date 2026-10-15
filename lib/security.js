// Parol xeshlash, tokenlar, tasodifiylik va so'rovlar chastotasini cheklash
const crypto = require('node:crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === check.length && crypto.timingSafeEqual(check, expected);
}

const newToken = () => crypto.randomBytes(32).toString('hex');

// Kriptografik tasodifiy aralashtirish (Fisher–Yates)
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Oddiy xotiradagi chastota cheklagich: kalit bo'yicha oynada N ta urinish
function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return {
    hit(key) {
      const now = Date.now();
      let e = hits.get(key);
      if (!e || e.reset < now) { e = { count: 0, reset: now + windowMs }; hits.set(key, e); }
      e.count++;
      return { ok: e.count <= max, retryAfter: Math.ceil((e.reset - now) / 1000) };
    },
    clear(key) { hits.delete(key); },
  };
}

module.exports = { hashPassword, verifyPassword, newToken, shuffle, rateLimiter };
