import { useState } from "react";
import { addEvidence } from "../utils/caseFile";
import { canRunCheck, recordCheck, remainingChecks } from "../utils/usageTracker";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const RISK_TEXT = {
  high: { title: "⚠️ Warning signs found", body: "Don't click links, open attachments, reply or send money to this sender." },
  caution: { title: "Be careful", body: "Nothing proves it's a scam, but check these things before you trust this email." },
  low: { title: "No warning signs in the address", body: "The address looks normal. Scammers can still break into real accounts, so be careful with links and payment requests." },
};

function EmailCheck() {
  const [email, setEmail] = useState("");
  const [claimed, setClaimed] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleCheck(e) {
    e.preventDefault();
    if (!email.trim()) return;
    if (!canRunCheck()) {
      setError("You've used all 3 free checks this month. Upgrade to Premium below for unlimited checks.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_URL}/api/email-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), claimed: claimed.trim() }),
      });
      if (!res.ok) throw new Error("Couldn't check this email right now. Try again in a minute.");
      const data = await res.json();
      if (!data.valid) {
        setError(data.reasons?.[0] || "That isn't a complete email address.");
        return;
      }
      setResult(data);
      recordCheck();
      addEvidence({
        type: "Email sender",
        subject: data.email,
        verdict: data.risk,
        reasons: data.reasons || [],
        details: claimed.trim() ? `Says they're: ${claimed.trim()}` : "",
      });
    } catch (err) {
      setError(err.message || "Couldn't check this email right now.");
    } finally {
      setLoading(false);
    }
  }

  const text = result ? RISK_TEXT[result.risk] || RISK_TEXT.caution : null;

  return (
    <section className="link-check email-check">
      <h2>Check an Email Sender</h2>
      <p className="subtext">
        The name on an email can say anything. Paste the sender's actual address, the part with
        the @, and we'll check if it's free, throwaway, brand-new or pretending to be a company.
      </p>
      <p className="subtext">{remainingChecks()} free checks remaining</p>

      <form onSubmit={handleCheck}>
        <label className="field-label" htmlFor="email-address">Sender's email address</label>
        <input
          id="email-address"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="e.g. support@paypal-help-center.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className="field-label" htmlFor="email-claimed">Who do they say they are? (optional)</label>
        <input
          id="email-claimed"
          type="text"
          placeholder="e.g. PayPal, Amazon, my bank"
          value={claimed}
          onChange={(e) => setClaimed(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Checking..." : "Check Email"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {result && text && (
        <div className={`result risk-${result.risk === "low" ? "low" : result.risk === "high" ? "high" : "medium"}`}>
          <h3>{text.title}</h3>
          <p>{text.body}</p>
          {result.domain && (
            <p className="subtext">
              <strong>{result.email}</strong>
              {result.free_provider ? " · free email account" : ""}
              {result.domain_age_days != null ? ` · website name is ${result.domain_age_days} days old` : ""}
            </p>
          )}
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
          {result.sources_checked?.length > 0 && (
            <p className="subtext">Checked: {result.sources_checked.join(", ")}</p>
          )}
        </div>
      )}

      <div className="button-row">
        <a href="https://reportfraud.ftc.gov/" target="_blank" rel="noopener noreferrer">
          <button type="button">Report a Scam Email (FTC)</button>
        </a>
      </div>
      <p className="subtext">You can also forward phishing emails to reportphishing@apwg.org.</p>
    </section>
  );
}

export default EmailCheck;
