const windowMs = 10 * 60 * 1000;
const limit = 10;
const maxInFlight = 8;
const maxKeys = 5000;
const attempts = new Map();
let inFlight = 0;
let nextCleanup = 0;

// Резервируем попытку до scrypt. Заголовки прокси здесь не считаются
// надёжным источником адреса клиента.
export function beginLoginAttempt(realm, login, now = Date.now()) {
  if (inFlight >= maxInFlight) return null;
  if (now >= nextCleanup) {
    for (const [key, row] of attempts) {
      if (!row.pending && now - row.startedAt >= windowMs) attempts.delete(key);
    }
    nextCleanup = now + 60_000;
  }

  const key = `${realm}:${login.trim().toLowerCase()}`;
  let row = attempts.get(key);
  if (row && !row.pending && now - row.startedAt >= windowMs) {
    attempts.delete(key);
    row = undefined;
  }
  if (!row) {
    if (attempts.size >= maxKeys) return null;
    row = { startedAt: now, failures: 0, pending: 0 };
    attempts.set(key, row);
  }
  if (row.failures + row.pending >= limit) return null;
  row.pending += 1;
  inFlight += 1;

  return valid => {
    row.pending -= 1;
    inFlight -= 1;
    row.failures = valid ? 0 : row.failures + 1;
    if (!row.failures && !row.pending) attempts.delete(key);
  };
}

export function resetLoginThrottle() {
  attempts.clear();
  inFlight = 0;
  nextCleanup = 0;
}
