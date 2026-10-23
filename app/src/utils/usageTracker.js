const KEY = "scamshield_usage";
const FREE_LIMIT = 3;

// Free checks refresh automatically on the 1st of each month.
// Stored per device/browser; premium status is kept across months.
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function getUsage() {
  let stored;
  try {
    stored = JSON.parse(localStorage.getItem(KEY));
  } catch {
    stored = null;
  }
  if (!stored) stored = { count: 0, premium: false };

  const month = currentMonth();
  if (stored.month !== month) {
    stored = { ...stored, count: 0, month };
    try {
      localStorage.setItem(KEY, JSON.stringify(stored));
    } catch {
      /* storage blocked (private mode) — still works for this visit */
    }
  }
  return stored;
}

export function canRunCheck() {
  const { count, premium } = getUsage();
  return premium || count < FREE_LIMIT;
}

export function recordCheck() {
  bumpStat("checksRun");
  const stored = getUsage();
  if (!stored.premium) {
    stored.count += 1;
    try {
      localStorage.setItem(KEY, JSON.stringify(stored));
    } catch {
      /* ignore */
    }
  }
  return stored;
}

// Lifetime totals for the Protection Dashboard (kept separately from the monthly count).
const STATS_KEY = KEY.replace("_usage", "_stats");

export function getStats() {
  try {
    const s = JSON.parse(localStorage.getItem(STATS_KEY)) || {};
    return { checksRun: s.checksRun || 0, scamsFlagged: s.scamsFlagged || 0 };
  } catch {
    return { checksRun: 0, scamsFlagged: 0 };
  }
}

export function bumpStat(field) {
  const s = getStats();
  s[field] = (s[field] || 0) + 1;
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("stats-change"));
}

// "3 free checks remaining", "1 free check remaining", or "Unlimited checks (Premium)".
export function checksLeftText() {
  const left = remainingChecks();
  if (left === Infinity) return "Unlimited checks (Premium)";
  return `${left} free check${left === 1 ? "" : "s"} remaining this month`;
}

export function remainingChecks() {
  const { count, premium } = getUsage();
  return premium ? Infinity : Math.max(0, FREE_LIMIT - count);
}
