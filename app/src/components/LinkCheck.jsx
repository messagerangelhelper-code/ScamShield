import { useState } from "react";
import { canRunCheck, recordCheck, remainingChecks } from "../utils/usageTracker";
import VoiceInput from "./VoiceInput";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function LinkCheck() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleCheck(e) {
    e.preventDefault();
    if (!url.trim()) return;

    if (!canRunCheck()) {
      setError("You've used all 3 free checks. Upgrade to Premium below for unlimited checks.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_URL}/api/url-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [url.trim()] }),
      });
      const data = await res.json();

      if (!data.configured) {
        setError("Link-checking isn't set up yet on this deployment — verify this link manually before clicking it.");
        return;
      }

      setResult(data);
      recordCheck();
    } catch (err) {
      setError(err.message || "Couldn't check this link right now.");
    } finally {
      setLoading(false);
    }
  }

  const isFlagged = result && result.flagged_urls && result.flagged_urls.length > 0;

  return (
    <section className="link-check">
      <h2>Check a Link</h2>
      <p className="subtext">
        Paste a suspicious link before clicking it — checked against
        Google's database of known scam, phishing, and malware sites.
      </p>
      <p className="subtext">{remainingChecks()} free checks remaining</p>

      <form onSubmit={handleCheck}>
        <VoiceInput onResult={(text) => setUrl((prev) => prev + text)} />
        <input
          type="text"
          placeholder="Paste a link here, e.g. https://..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Checking..." : "Check Link"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className={`result ${isFlagged ? "risk-high" : "risk-low"}`}>
          {isFlagged ? (
            <>
              <h3>⚠️ Flagged as unsafe</h3>
              <p>This link was flagged by at least one scam/phishing database. Do not click it.</p>
            </>
          ) : (
            <>
              <h3>No known threats found</h3>
              <p>
                This link isn't on any known-scam list checked below — but
                that doesn't guarantee it's safe. Brand-new scam sites take
                time to get flagged, so stay cautious regardless.
              </p>
            </>
          )}
          {result.sources_checked && result.sources_checked.length > 0 && (
            <p className="subtext">
              Checked against: {result.sources_checked.join(", ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default LinkCheck;
