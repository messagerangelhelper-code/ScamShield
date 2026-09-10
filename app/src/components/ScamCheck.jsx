import { useState } from "react";
import { canRunCheck, recordCheck, remainingChecks } from "../utils/usageTracker";
import { isSeniorMode } from "./SeniorMode";
import DecoyCard from "./DecoyCard";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function ScamCheck() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleCheck(e) {
    e.preventDefault();
    if (!input.trim()) return;

    if (!canRunCheck()) {
      setError("You've used all 3 free checks. Upgrade to Premium below for unlimited checks.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_URL}/api/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input }),
      });

      if (!res.ok) throw new Error("Server error, please try again.");

      const data = await res.json();

      // Also check any URLs found in the pasted text against Google Safe Browsing
      const urlPattern = /https?:\/\/[^\s]+/g;
      const foundUrls = input.match(urlPattern) || [];

      if (foundUrls.length > 0) {
        try {
          const urlRes = await fetch(`${API_URL}/api/url-check`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ urls: foundUrls }),
          });
          const urlData = await urlRes.json();

          if (urlData.configured && urlData.flagged_urls.length > 0) {
            data.flags = [
              ...data.flags,
              `This link is on Google's known scam/phishing list: ${urlData.flagged_urls[0]}`,
            ];
            data.risk_score = Math.min(100, data.risk_score + 40);
            data.risk_level = data.risk_score >= 50 ? "high" : data.risk_level;
          } else if (!urlData.configured) {
            data.flags = [
              ...data.flags,
              "Link detected but URL-reputation checking isn't set up yet — verify this link manually before clicking.",
            ];
          }
        } catch {
          // Safe Browsing check failing shouldn't block the rest of the result
        }
      }

      setResult(data);
      recordCheck();

      // Update local dashboard stats
      const saved = JSON.parse(localStorage.getItem("scamshield_stats")) || {
        checksRun: 0,
        scamsFlagged: 0,
      };
      saved.checksRun += 1;
      if (data.risk_level === "high") saved.scamsFlagged += 1;
      localStorage.setItem("scamshield_stats", JSON.stringify(saved));
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="scam-check">
      <h2>Check a Message or Listing</h2>
      <p className="subtext">{remainingChecks()} free checks remaining</p>
      <form onSubmit={handleCheck}>
        <textarea
          rows={6}
          placeholder="Paste a suspicious listing, message, or offer here..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Checking..." : "Check for Scam"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className={`result risk-${result.risk_level}`}>
          <h3>Risk Level: {result.risk_level.toUpperCase()}</h3>
          <p>Score: {result.risk_score} / 100</p>
          {result.flags.length > 0 && (
            <ul>
              {result.flags.map((flag, i) => (
                <li key={i}>{flag}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {result?.risk_level === "high" && isSeniorMode() && (
        <div className="senior-warning">
          <p>
            <strong>This looks like a scam.</strong> Before you do anything
            else — send money, share a code, or reply — call your trusted
            contact using the button below in the "Simple Mode & Trusted
            Contact" section. It's okay to wait and check with someone first.
          </p>
        </div>
      )}

      {result?.trigger_decoy_card && <DecoyCard />}
    </section>
  );
}

export default ScamCheck;
