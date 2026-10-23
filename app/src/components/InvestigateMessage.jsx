import { useState } from "react";
import { canRunCheck, recordCheck, remainingChecks } from "../utils/usageTracker";
import { addEvidence } from "../utils/caseFile";
import { readScreenshot } from "../utils/readScreenshot";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const VERDICT = {
  high: { title: "⚠️ This looks like a scam", cls: "high", label: "Warning signs" },
  caution: { title: "Be careful", cls: "medium", label: "Be careful" },
  low: { title: "No warning signs found", cls: "low", label: "Looks OK" },
};

function InvestigateMessage() {
  const [text, setText] = useState("");
  const [sender, setSender] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reading, setReading] = useState("");

  async function handleScreenshot(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setReading("Opening the screenshot…");
    try {
      const words = await readScreenshot(file, setReading);
      if (!words.trim()) {
        setError("We couldn't read any words in that screenshot. Try a sharper one, or copy and paste the text instead.");
      } else {
        setText((t) => (t.trim() ? `${t.trim()}\n\n${words}` : words));
        setResult(null);
      }
    } catch {
      setError("The screenshot reader couldn't start. Check your internet connection (it needs it the first time) and try again.");
    } finally {
      setReading("");
    }
  }

  async function handleInvestigate(e) {
    e.preventDefault();
    if (!text.trim()) return;
    if (!canRunCheck()) {
      setError("You've used all 3 free checks this month. Upgrade to Premium below for unlimited checks.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_URL}/api/investigate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), sender: sender.trim() }),
      });
      if (!res.ok) throw new Error("Couldn't investigate this message right now. Try again in a minute.");
      const data = await res.json();
      setResult(data);
      recordCheck();
      // Save the full message (not the shortened preview) as the evidence.
      data.findings.forEach((f) => addEvidence(f.type === "Message" ? { ...f, subject: text.trim() } : f));
    } catch (err) {
      setError(err.message || "Couldn't investigate this message right now.");
    } finally {
      setLoading(false);
    }
  }

  const v = result ? VERDICT[result.verdict] || VERDICT.caution : null;
  const c = result?.clues;
  const clueCount = c
    ? c.phones.length + c.links.length + c.emails.length + c.wallets.length + c.cashtags.length + (c.messaging_links || []).length
    : 0;

  return (
    <section className="link-check investigate-check">
      <h2>Investigate a Whole Message</h2>
      <p className="subtext">
        Paste the entire text, email or chat, or read it from a screenshot. Works for WhatsApp and
        Telegram chats too. We pull out every phone number, link, email address, crypto wallet,
        group invite and payment name in it, and check each one. It counts as one check.
      </p>
      <p className="subtext">{remainingChecks()} free checks remaining</p>

      <form onSubmit={handleInvestigate}>
        <label className={reading ? "shot-btn disabled" : "shot-btn"}>
          Read a screenshot
          <input type="file" accept="image/*" className="sr-only" onChange={handleScreenshot} disabled={!!reading} />
        </label>
        <p className="subtext">The screenshot stays on your phone. We only read the words in it.</p>
        {reading && <p className="subtext reading" role="status">{reading}</p>}
        <label className="field-label" htmlFor="inv-text">The message</label>
        <textarea
          id="inv-text"
          rows={6}
          placeholder="Paste the whole message here, or read a screenshot above"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <label className="field-label" htmlFor="inv-sender">Who sent it? (optional phone number or email)</label>
        <input
          id="inv-sender"
          type="text"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="e.g. +1 876 555 0134 or support@paypa1.com"
          value={sender}
          onChange={(e) => setSender(e.target.value)}
        />
        <p className="subtext">Check the text read from a screenshot before you tap Investigate. You can fix any mistakes.</p>
        <button type="submit" disabled={loading || !!reading}>
          {loading ? "Investigating..." : "Investigate"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {result && v && (
        <>
          <div className={`result risk-${v.cls}`} role="status">
            <h3>{v.title}</h3>
            <p>{result.summary}</p>
            <p className="subtext">
              Found {clueCount} clue{clueCount === 1 ? "" : "s"} to check
              {c.brands_mentioned.length > 0 ? ` · Mentions ${c.brands_mentioned.join(", ")}` : ""}
            </p>
          </div>

          <ol className="evidence-list">
            {result.findings.map((f) => (
              <li key={`${f.type}-${f.subject}`} className={`evidence evidence-${f.verdict}`}>
                <div className="evidence-head">
                  <span className="evidence-type">{f.type}</span>
                  <span className={`evidence-verdict verdict-${f.verdict}`}>{VERDICT[f.verdict]?.label}</span>
                </div>
                <div className="evidence-subject">{f.subject}</div>
                {f.details && <div className="evidence-details">{f.details}</div>}
                {f.reasons.length > 0 && <ul>{f.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
              </li>
            ))}
          </ol>
          <p className="subtext">All of this was saved to your Detective Report below.</p>
        </>
      )}
    </section>
  );
}

export default InvestigateMessage;
