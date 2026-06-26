const REDIS_URL = String(process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/+$/, "");
const REDIS_TOKEN = String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();

function isEnabled() {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

async function runCommand(command) {
  if (!isEnabled()) return { ok: false, result: null };
  if (typeof fetch !== "function") {
    return { ok: false, result: null, error: "Global fetch is unavailable" };
  }

  try {
    const response = await fetch(REDIS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      return { ok: false, result: null, error: `HTTP ${response.status}` };
    }

    const payload = await response.json();
    if (payload?.error) {
      return { ok: false, result: null, error: payload.error };
    }

    return { ok: true, result: payload?.result ?? null };
  } catch (error) {
    return { ok: false, result: null, error: error.message || "Redis request failed" };
  }
}

async function getJSON(key) {
  if (!key) return null;
  const res = await runCommand(["GET", key]);
  if (!res.ok || !res.result) return null;

  try {
    return JSON.parse(String(res.result));
  } catch (_error) {
    return null;
  }
}

async function setJSON(key, value, ttlSeconds = 0) {
  if (!key) return false;
  const encoded = JSON.stringify(value);
  const safeTTL = Math.max(0, Number(ttlSeconds) || 0);
  const command = safeTTL > 0
    ? ["SETEX", key, String(safeTTL), encoded]
    : ["SET", key, encoded];
  const res = await runCommand(command);
  return Boolean(res.ok);
}

module.exports = {
  isEnabled,
  getJSON,
  setJSON,
};
