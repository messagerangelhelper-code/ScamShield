import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { canRunCheck, recordCheck, remainingChecks } from "../utils/usageTracker";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const MAX_SIDE = 1600; // shrink big photos so decoding stays fast on phones

// Reads a QR code out of an image file entirely on this device.
// Nothing is uploaded except the decoded link, which goes to the link checker.
function decodeImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      URL.revokeObjectURL(url);
      const code = jsQR(data, w, h, { inversionAttempts: "attemptBoth" });
      resolve(code ? code.data : null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file couldn't be opened as an image."));
    };
    img.src = url;
  });
}

function looksLikeLink(text) {
  return /^(https?:\/\/|www\.)/i.test(text.trim());
}

function describeContent(text) {
  const t = text.trim();
  if (/^WIFI:/i.test(t)) return "This QR code joins a Wi-Fi network. Only use it if you trust the place that gave it to you.";
  if (/^(tel|sms|smsto):/i.test(t)) return "This QR code starts a call or text message. Check the number before you send anything.";
  if (/^mailto:/i.test(t)) return "This QR code starts an email. Check the address before you send anything.";
  if (/^(bitcoin|ethereum|litecoin):/i.test(t) || /^(0x[a-f0-9]{40}|bc1[a-z0-9]{20,})$/i.test(t)) {
    return "This QR code is a crypto wallet address. Use the Crypto Check below before sending any money — crypto payments can't be reversed.";
  }
  return "This QR code contains text, not a website link. Read it carefully before acting on it.";
}

function QRCheck() {
  const [decoded, setDecoded] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pickerRef = useRef(null);
  const cameraRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    setError(null);
    setResult(null);
    setDecoded(null);
    setLoading(true);

    try {
      const text = await decodeImageFile(file);
      if (!text) {
        setError("No QR code found. Try a clearer screenshot, or crop it so the QR code fills more of the picture.");
        return;
      }
      setDecoded(text);

      if (!looksLikeLink(text)) return;

      if (!canRunCheck()) {
        setError("We found the link, but you've used all 3 free checks. Upgrade to Premium below for unlimited checks.");
        return;
      }

      const link = /^www\./i.test(text.trim()) ? `http://${text.trim()}` : text.trim();
      const res = await fetch(`${API_URL}/api/url-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [link] }),
      });
      const data = await res.json();
      setResult(data);
      recordCheck();
    } catch (err) {
      setError(err.message || "Couldn't read that QR code right now.");
    } finally {
      setLoading(false);
    }
  }

  // Lets people paste a copied screenshot (Ctrl+V / long-press Paste).
  useEffect(() => {
    function onPaste(e) {
      const items = e.clipboardData ? Array.from(e.clipboardData.items) : [];
      const imageItem = items.find((it) => it.type.startsWith("image/"));
      if (imageItem) handleFile(imageItem.getAsFile());
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const isLink = decoded && looksLikeLink(decoded);
  const isFlagged = result && result.flagged_urls && result.flagged_urls.length > 0;
  const reasons = result?.details?.heuristics?.reasons || [];

  return (
    <section className="qr-check">
      <h2>Check a QR Code</h2>
      <p className="subtext">
        Someone sent you a QR code on the phone or computer you're using?
        Take a screenshot of it, then choose that screenshot here. ScamShield
        reads the code on your device and checks where it really goes —
        before you open it.
      </p>
      <p className="subtext">{remainingChecks()} free checks remaining</p>

      <div className="button-row">
        <button type="button" onClick={() => pickerRef.current && pickerRef.current.click()} disabled={loading}>
          {loading ? "Reading..." : "Choose a Screenshot or Photo"}
        </button>
        <button type="button" onClick={() => cameraRef.current && cameraRef.current.click()} disabled={loading}>
          Use Camera
        </button>
      </div>
      <p className="subtext">On a computer you can also copy a screenshot and paste it on this page.</p>

      <input
        ref={pickerRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => { handleFile(e.target.files[0]); e.target.value = ""; }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => { handleFile(e.target.files[0]); e.target.value = ""; }}
      />

      {error && <p className="error">{error}</p>}

      {decoded && (
        <div className={`result ${isFlagged ? "risk-high" : "risk-low"}`}>
          <p><strong>This QR code goes to:</strong></p>
          <p style={{ wordBreak: "break-all" }}>{decoded}</p>

          {!isLink && <p>{describeContent(decoded)}</p>}

          {isLink && result && (
            isFlagged ? (
              <>
                <h3>⚠️ Flagged as unsafe</h3>
                <p>Do not open this link or enter any information on it.</p>
              </>
            ) : (
              <>
                <h3>No known threats found</h3>
                <p>
                  This doesn't guarantee it's safe. Only open it if you were
                  expecting it from someone you know.
                </p>
              </>
            )
          )}

          {reasons.length > 0 && (
            <ul>
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {result?.details?.domain_age?.is_new_domain && (
            <p>This website was registered only {result.details.domain_age.age_days} days ago — scam sites are usually brand new.</p>
          )}
          {result?.details?.hosting?.checked && (
            <p className="subtext">
              Hosted in {result.details.hosting.country}{result.details.hosting.network ? ` on ${result.details.hosting.network}` : ""}.
              {" "}IP address data is powered by{" "}
              <a href="https://ipinfo.io" target="_blank" rel="noopener noreferrer">IPinfo</a>.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default QRCheck;
