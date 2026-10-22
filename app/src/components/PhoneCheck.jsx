import { useState } from "react";
import { canRunCheck, recordCheck, remainingChecks } from "../utils/usageTracker";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const RISK_TEXT = {
  high: { title: "⚠️ Warning signs found", body: "Don't call back, don't pay, and don't share any codes or personal details." },
  caution: { title: "Be careful", body: "Nothing proves it's a scam, but there are things to double-check before you trust this number." },
  low: { title: "No warning signs in the number", body: "That doesn't prove the caller is honest. Caller ID can be faked, so judge them by what they ask for." },
};

function PhoneCheck() {
  const [number, setNumber] = useState("");
  const [claimed, setClaimed] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleCheck(e) {
    e.preventDefault();
    if (!number.trim()) return;
    if (!canRunCheck()) {
      setError("You've used all 3 free checks this month. Upgrade to Premium below for unlimited checks.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_URL}/api/phone-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: number.trim(), claimed: claimed.trim() }),
      });
      if (!res.ok) throw new Error("Couldn't check this number right now. Try again in a minute.");
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setResult(data);
      recordCheck();
    } catch (err) {
      setError(err.message || "Couldn't check this number right now.");
    } finally {
      setLoading(false);
    }
  }

  const text = result ? RISK_TEXT[result.risk] || RISK_TEXT.caution : null;

  return (
    <section className="link-check phone-check">
      <h2>Check a Phone Number</h2>
      <p className="subtext">
        Got a call or text from a number you don't know? Check where it's really from and what kind
        of line it is before you call back or answer their questions.
      </p>
      <p className="subtext">{remainingChecks()} free checks remaining</p>

      <form onSubmit={handleCheck}>
        <label className="field-label" htmlFor="phone-number">Phone number</label>
        <input
          id="phone-number"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="e.g. (876) 555-0134 or +44 20 7946 0958"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
        />
        <label className="field-label" htmlFor="phone-claimed">Who do they say they are? (optional)</label>
        <input
          id="phone-claimed"
          type="text"
          placeholder="e.g. my bank, the IRS, Amazon, Medicare"
          value={claimed}
          onChange={(e) => setClaimed(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Checking..." : "Check Number"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {result && text && (
        <div className={`result risk-${result.risk === "low" ? "low" : result.risk === "high" ? "high" : "medium"}`}>
          <h3>{text.title}</h3>
          <p>{text.body}</p>
          <p className="subtext">
            <strong>{result.formatted}</strong>
            {result.country ? ` · ${result.country}` : ""}
            {result.location ? ` (${result.location})` : ""}
            {result.line_type && result.line_type !== "Unknown" ? ` · ${result.line_type}` : ""}
            {result.phone_company ? ` · ${result.phone_company}` : ""}
          </p>
          {result.reasons?.length > 0 && (
            <ul>
              {result.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
          {result.tips?.length > 0 && (
            <ul className="tips">
              {result.tips.map((t) => <li key={t}>{t}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="button-row">
        <a href="https://reportfraud.ftc.gov/" target="_blank" rel="noopener noreferrer">
          <button type="button">Report a Scam Call (FTC)</button>
        </a>
        <a href="https://www.donotcall.gov/" target="_blank" rel="noopener noreferrer">
          <button type="button">Join the Do Not Call List</button>
        </a>
      </div>
    </section>
  );
}

export default PhoneCheck;
