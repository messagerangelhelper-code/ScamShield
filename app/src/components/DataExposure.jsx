// "My Data Exposure": has your email shown up in a data breach (Premium, via Have I Been Pwned),
// is a password already leaked (free, checked privately), and how to pull your details off
// people-search sites and lock things down (free). A summary can go into the Detective Report.
import { useEffect, useState } from "react";
import { currentToken } from "../utils/auth";
import { getUsage } from "../utils/usageTracker";

const API = "https://cashcow-reviews-api.onrender.com";
const STORE = "scamshield_exposure";
const OPTOUT_STORE = "scamshield_optouts";
const EVENT = "exposure-change";
const SESSION_KEYS = ["scamshield_web_premium_session", "scamguard_premium_session"];

const PEOPLE_SEARCH = [
  { id: "whitepages", name: "Whitepages", url: "https://www.whitepages.com/suppression-requests" },
  { id: "spokeo", name: "Spokeo", url: "https://www.spokeo.com/optout" },
  { id: "beenverified", name: "BeenVerified", url: "https://www.beenverified.com/app/optout/search" },
  { id: "peopleconnect", name: "Intelius, Instant Checkmate, TruthFinder (one form)", url: "https://suppression.peopleconnect.us/login" },
  { id: "truepeoplesearch", name: "TruePeopleSearch", url: "https://www.truepeoplesearch.com/removal" },
  { id: "fastpeoplesearch", name: "FastPeopleSearch", url: "https://www.fastpeoplesearch.com/removal" },
  { id: "peoplefinders", name: "PeopleFinders", url: "https://www.peoplefinders.com/opt-out" },
  { id: "usphonebook", name: "USPhoneBook", url: "https://www.usphonebook.com/opt-out" },
  { id: "prescreen", name: "Stop pre-approved credit card offers (official)", url: "https://www.optoutprescreen.com/" },
  { id: "dnc", name: "National Do Not Call list (official)", url: "https://www.donotcall.gov/" },
];

// ---- Saved summary for the Detective Report ----
function readStore(key, empty) {
  try { return JSON.parse(localStorage.getItem(key)) || empty; } catch { return empty; }
}
let saved = readStore(STORE, null);
function writeSaved(v) {
  saved = v;
  try { v ? localStorage.setItem(STORE, JSON.stringify(v)) : localStorage.removeItem(STORE); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVENT));
}
export function clearExposure() { writeSaved(null); }
export function useExposure() {
  const [v, setV] = useState(saved);
  useEffect(() => {
    const up = () => setV(saved);
    window.addEventListener(EVENT, up);
    return () => window.removeEventListener(EVENT, up);
  }, []);
  return v;
}

function savedSession() {
  for (const k of SESSION_KEYS) {
    try {
      const v = JSON.parse(localStorage.getItem(k) || "null");
      if (v && v.sessionId) return v.sessionId;
    } catch { /* ignore */ }
  }
  return "";
}

async function sha1Hex(text) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function niceDate(d) {
  if (!d) return "";
  const t = new Date(`${d}T12:00:00`);
  return isNaN(t) ? d : t.toLocaleDateString(undefined, { year: "numeric", month: "short" });
}

function BreachCheck() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [added, setAdded] = useState(false);
  const [premium, setPrem] = useState(() => getUsage().premium);
  useEffect(() => {
    const up = () => setPrem(getUsage().premium);
    window.addEventListener("stats-change", up);
    return () => window.removeEventListener("stats-change", up);
  }, []);

  async function check(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setError(""); setResult(null); setAdded(false);
    try {
      const token = await currentToken();
      const res = await fetch(`${API}/api/data-exposure`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ email: email.trim(), session_id: savedSession() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Couldn't check right now. Try again in a minute.");
      setResult(data);
    } catch (err) {
      setError(err.message === "Failed to fetch" ? "Couldn't reach the breach check. Check your connection." : err.message);
    } finally {
      setBusy(false);
    }
  }

  function addToReport() {
    const kinds = [...new Set(result.breaches.flatMap((b) => b.data))];
    writeSaved({
      at: new Date().toISOString(),
      email: result.email,
      count: result.breaches.length,
      kinds: kinds.slice(0, 15),
      breaches: result.breaches.slice(0, 20).map((b) => ({ title: b.title, date: b.date, data: b.data.slice(0, 6) })),
    });
    setAdded(true);
  }

  if (!premium) {
    return (
      <div className="result risk-medium">
        <h3>🔒 Breach check is Premium</h3>
        <p>
          Find out which data breaches leaked your email, and what was taken: passwords, phone numbers,
          addresses and more. Included with ScamShield Premium and CashCow All Access.
        </p>
        <a href="#plans">See Premium plans</a>
      </div>
    );
  }

  const n = result?.breaches.length || 0;
  return (
    <>
      <form onSubmit={check}>
        <label className="field-label" htmlFor="exposure-email">Your email address</label>
        <input id="exposure-email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off"
          placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" disabled={busy}>{busy ? "Checking..." : "Check my email"}</button>
      </form>
      {error && <p className="error">{error}</p>}
      {result && (
        <div className={`result ${n ? "risk-high" : "risk-low"}`} role="status">
          <h3>👉 Your answer: {n ? `Found in ${n} data breach${n === 1 ? "" : "es"}` : "Not found in any known breach"}</h3>
          {n ? (
            <>
              <p>These companies were hacked and your email was in the stolen data. Start with the newest ones.</p>
              <ul className="exposure-list" style={{ display: "grid", gap: 8 }}>
                {result.breaches.map((b) => (
                  <li key={b.title + b.date}>
                    <strong>{b.title}</strong> · {niceDate(b.date)}
                    {b.data.length > 0 && <div className="subtext">Leaked: {b.data.join(", ")}</div>}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={addToReport} disabled={added}>
                {added ? "Added to your Detective Report ✓" : "Add to my Detective Report"}
              </button>
            </>
          ) : (
            <p>Good news. Breaches aren't always found or made public, so keep using strong, different passwords.</p>
          )}
          {result.hidden > 0 && (
            <p className="subtext">
              {result.hidden} more private breach{result.hidden === 1 ? "" : "es"} can only be shown when you check the
              email you're signed in with.
            </p>
          )}
        </div>
      )}
      <p className="subtext">
        Breach data from <a href="https://haveibeenpwned.com" target="_blank" rel="noopener noreferrer" style={{ color: "#8fb3ff" }}>Have I Been Pwned</a>.
      </p>
    </>
  );
}

function PasswordCheck() {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState(null);
  const [error, setError] = useState("");

  async function check(e) {
    e.preventDefault();
    if (!pw) return;
    setBusy(true); setError(""); setFound(null);
    try {
      // Only the first 5 characters of a scrambled code leave this phone, never the password.
      const hash = await sha1Hex(pw);
      const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, { headers: { "Add-Padding": "true" } });
      if (!res.ok) throw new Error();
      const line = (await res.text()).split("\n").find((l) => l.startsWith(hash.slice(5)));
      setFound(line ? parseInt(line.split(":")[1], 10) || 0 : 0);
    } catch {
      setError("Couldn't check right now. Try again in a minute.");
    } finally {
      setBusy(false);
      setPw("");
    }
  }

  return (
    <>
      <form onSubmit={check}>
        <label className="field-label" htmlFor="exposure-pw">A password you use</label>
        <input id="exposure-pw" type="password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button type="submit" disabled={busy}>{busy ? "Checking..." : "Check password"}</button>
      </form>
      <p className="subtext">Your password never leaves this phone. Only a scrambled piece of it is checked.</p>
      {error && <p className="error">{error}</p>}
      {found !== null && (
        <div className={`result ${found ? "risk-high" : "risk-low"}`} role="status">
          <h3>👉 Your answer: {found ? "This password has been leaked" : "Not found in leaked passwords"}</h3>
          <p>
            {found
              ? `It showed up ${found.toLocaleString()} time${found === 1 ? "" : "s"} in stolen password lists. Stop using it everywhere and change it today.`
              : "Good. Still use a different password for every account."}
          </p>
        </div>
      )}
    </>
  );
}

function OptOutList() {
  const [done, setDone] = useState(() => readStore(OPTOUT_STORE, {}));
  function toggle(id) {
    const next = { ...done, [id]: !done[id] };
    setDone(next);
    try { localStorage.setItem(OPTOUT_STORE, JSON.stringify(next)); } catch { /* ignore */ }
  }
  const count = PEOPLE_SEARCH.filter((s) => done[s.id]).length;
  return (
    <>
      <p className="subtext">
        These sites sell your name, address, phone and relatives to anyone, including scammers. Each one has a free
        removal form. Tick each one when you've sent it. ({count} of {PEOPLE_SEARCH.length} done)
      </p>
      <div className="checklist" style={{ display: "grid", gap: 8, margin: "10px 0" }}>
        {PEOPLE_SEARCH.map((s) => (
          <label key={s.id} className="check-item">
            <input type="checkbox" checked={!!done[s.id]} onChange={() => toggle(s.id)} />
            <span>
              {s.name} · <a href={s.url} target="_blank" rel="noopener noreferrer">Open removal page</a>
            </span>
          </label>
        ))}
      </div>
      <p className="subtext">Listings can come back after a few months, so check again twice a year.</p>
    </>
  );
}

function LockDown() {
  return (
    <ol className="exposure-steps" style={{ display: "grid", gap: 8, paddingLeft: 22, lineHeight: 1.5 }}>
      <li>Change the password for every breached site, and any site where you used the same password.</li>
      <li>Turn on 2-step sign-in for your email, bank and phone carrier accounts.</li>
      <li>Freeze your credit with all three bureaus (free). See <strong>Freeze My Credit</strong> in your dashboard above.</li>
      <li>Ask your phone carrier for a port-out PIN, so no one can move your number to their phone.</li>
      <li>Watch your bank and card statements for charges you don't know.</li>
      <li>
        If someone used your information, report it at{" "}
        <a href="https://www.identitytheft.gov" target="_blank" rel="noopener noreferrer">IdentityTheft.gov</a> for a recovery plan.
      </li>
    </ol>
  );
}

const OFF_TAB = { background: "transparent", color: "#ffffff", border: "2px solid #3c6fd1" };

export default function DataExposure() {
  const [tab, setTab] = useState("breach");
  const TABS = [["breach", "Email breaches"], ["password", "Password"], ["optout", "People-search sites"], ["lock", "Lock it down"]];
  return (
    <section className="link-check email-check data-exposure" id="data-exposure">
      <h2>My Data Exposure</h2>
      <p className="subtext">
        Scammers use leaked and sold personal details to sound real. See what's out there about you, then shut it down.
      </p>
      <div className="button-row" role="tablist" style={{ marginBottom: 12 }}>
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id}
            style={tab === id ? undefined : OFF_TAB} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === "breach" && <BreachCheck />}
      {tab === "password" && <PasswordCheck />}
      {tab === "optout" && <OptOutList />}
      {tab === "lock" && <LockDown />}
    </section>
  );
}
