// Premium for ScamShield: ScamShield Premium or CashCow All Access, paid through CashCow (Stripe).
// After paying, Stripe sends people back here with ?session_id=..., and the app asks CashCow
// whether that purchase is paid (and, for subscriptions, still active). Signed-in people
// are also checked against their CashCow account, so Premium follows them to every device.
import { currentToken } from "./auth";
import { getUsage, setPremium } from "./usageTracker";

const API = "https://cashcow-reviews-api.onrender.com";
const APP = "scamshield";          // the Premium this unlocks (shared by ScamShield, ScamGuard and Email Guard)
const RETURN = "scamshield_web";            // where Stripe sends people back
const KEY = "scamshield_web_premium_session";
const RECHECK_MS = 3 * 24 * 60 * 60 * 1000;

export const SCAMSHIELD_PLANS = [
  { id: "ssp_monthly", label: "Monthly", price: "$29", per: "/month" },
  { id: "ssp_yearly", label: "Yearly", price: "$249", per: "/year", note: "Save 28%" },
];

export const ALL_ACCESS = [
  { id: "rent", label: "Monthly", price: "$29", per: "/month" },
  { id: "lease", label: "Yearly", price: "$249", per: "/year", note: "Save 28%" },
  { id: "buy", label: "Lifetime", price: "$499", per: "one time", note: "Pay once" },
];

function readSaved() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
function save(v) {
  try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch { /* ignore */ }
}

async function verify(sessionId) {
  const res = await fetch(`${API}/api/verify-session?session_id=${encodeURIComponent(sessionId)}&app=${APP}`);
  if (!res.ok) throw new Error("verify failed");
  return res.json();
}

async function accountPremium() {
  const token = await currentToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API}/api/entitlements?app=${APP}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return !!(await res.json()).premium;
  } catch {
    return null;
  }
}

async function checkPremium() {
  // 1. Just came back from checkout?
  const params = new URLSearchParams(window.location.search);
  const sid = params.get("session_id");
  if (sid) {
    params.delete("session_id");
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash);
    try {
      const r = await verify(sid);
      if (r.premium) {
        save({ sessionId: sid, checkedAt: Date.now() });
        setPremium(true);
        return true;
      }
    } catch { /* fall through */ }
  }
  // 2. Signed in? Ask the account.
  const viaAccount = await accountPremium();
  if (viaAccount) { setPremium(true); return true; }
  // 3. Bought on this phone without signing in: re-check every few days.
  const saved = readSaved();
  if (saved) {
    if (Date.now() - (saved.checkedAt || 0) < RECHECK_MS) { setPremium(true); return true; }
    try {
      const r = await verify(saved.sessionId);
      if (r.premium) { save({ ...saved, checkedAt: Date.now() }); setPremium(true); return true; }
      save(null);
    } catch {
      setPremium(true); // CashCow unreachable: don't take Premium away by mistake
      return true;
    }
  }
  if (viaAccount === false || saved) setPremium(false);
  return getUsage().premium;
}

let once = null;
export function checkPremiumOnce() {
  if (!once) once = checkPremium();
  return once;
}

export async function startCheckout(planId) {
  const token = await currentToken();
  let res;
  try {
    res = await fetch(`${API}/api/create-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ plan: planId, return_app: RETURN }),
    });
  } catch {
    throw new Error("Couldn't reach checkout. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) throw new Error(data.detail || "Checkout isn't available right now. Please try again in a minute.");
  window.location.href = data.url;
}
