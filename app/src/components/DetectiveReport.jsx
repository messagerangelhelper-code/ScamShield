import { useEffect, useState } from "react";
import { useCaseFile, removeEvidence, setCaseTitle, setPreparedBy, clearCase } from "../utils/caseFile";

const BRAND = "ScamShield";

const VERDICT_TEXT = {
  high: "Warning signs found",
  caution: "Needs a closer look",
  low: "No warning signs found",
};

// How each kind of check works, listed in the report's Methods section.
const METHODS = {
  Message: "Pattern analysis of the message text against known scam tactics (urgency, payment demands, impersonation, requests for codes or personal details).",
  Link: "Link-structure analysis, website registration date from the public RDAP registry, the URLhaus malicious-link database (abuse.ch), and server hosting location (IPinfo).",
  "QR code link": "The QR code was decoded on the device, then the link inside it was checked the same way as a link.",
  "Phone number": "International numbering-plan analysis (country, region and line type) and known scam-number patterns such as Caribbean \"one ring\" area codes.",
  "Email sender": "Email domain analysis: free and throwaway providers, look-alike company names, domain registration date (RDAP) and mail-server records (public DNS).",
  "Email address": "Email domain analysis: free and throwaway providers, look-alike company names, domain registration date (RDAP) and mail-server records (public DNS).",
  "Crypto wallet": "Wallet risk screening through PublicAML.",
  Photo: "Embedded photo data (EXIF) read on the device: camera, date taken and editing software.",
  "Payment request": "Detection of irreversible payment methods named in the message (gift cards, wire transfers, crypto, payment apps).",
};
const CHECKLIST_METHOD = "A red-flag checklist completed by the person preparing this report.";

function stamp(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}

function shortStamp(iso) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function overall(items) {
  const high = items.filter((i) => i.verdict === "high").length;
  const caution = items.filter((i) => i.verdict === "caution").length;
  const low = items.length - high - caution;
  if (high > 0) return { level: "high", high, caution, low, finding: "Warning signs of a scam were found",
    text: `${high} of ${items.length} checks found warning signs. This looks like a scam. Don't send money or personal details.` };
  if (caution > 0) return { level: "medium", high, caution, low, finding: "Some items need a closer look",
    text: `${caution} of ${items.length} checks need a closer look. Slow down and verify before you trust them.` };
  return { level: "low", high, caution, low, finding: "No warning signs were found",
    text: `None of the ${items.length} checks found warning signs. That's good news, but scammers can still fool any check, so stay careful.` };
}

function methodsFor(items) {
  const seen = [];
  items.forEach((i) => {
    const m = i.type.startsWith("Checklist") ? CHECKLIST_METHOD : METHODS[i.type];
    const label = i.type.startsWith("Checklist") ? "Checklist" : i.type;
    if (m && !seen.some((s) => s.label === label)) seen.push({ label, text: m });
  });
  return seen;
}

function buildText(data, generatedAt, fingerprint) {
  const sum = overall(data.items);
  const rule = "=".repeat(64);
  const lines = [
    rule,
    `${BRAND.toUpperCase()} SCAM INVESTIGATION REPORT`,
    rule,
    `Report number:     ${data.caseId || "-"}`,
    `Case:              ${data.title || "(not named)"}`,
    `Prepared by:       ${data.preparedBy || "(not given)"}`,
    `Case opened:       ${stamp(data.openedAt)}`,
    `Report generated:  ${stamp(generatedAt)}`,
    `Exhibits:          ${data.items.length}`,
    `Overall finding:   ${sum.finding}`,
    "",
    "1. SUMMARY OF FINDINGS",
    `   ${sum.text}`,
    `   Warning signs found: ${sum.high}   Needs a closer look: ${sum.caution}   No warning signs: ${sum.low}`,
    "",
    "2. EXHIBITS",
  ];
  data.items.forEach((item, n) => {
    lines.push("");
    lines.push(`   Exhibit ${n + 1}: ${item.type}`);
    lines.push(`   Item examined:  ${item.subject}`);
    lines.push(`   Checked:        ${stamp(item.at)}`);
    lines.push(`   Finding:        ${VERDICT_TEXT[item.verdict]}`);
    if (item.details) lines.push(`   Details:        ${item.details}`);
    if (item.reasons.length) {
      lines.push("   Observations:");
      item.reasons.forEach((r) => lines.push(`     - ${r}`));
    }
  });
  lines.push("", "3. METHODS");
  methodsFor(data.items).forEach((m) => lines.push(`   ${m.label}: ${m.text}`));
  lines.push(
    "",
    "4. NOTES AND LIMITATIONS",
    `   These checks were run by the person named above using the ${BRAND} app, at the`,
    "   times shown (device local time). The findings are automated warning signs, not a",
    "   legal determination or a forensic examination. Keep the original messages,",
    "   screenshots, call logs, emails and payment receipts: they are the primary evidence.",
    "",
    "5. WHERE TO REPORT",
    "   Federal Trade Commission: reportfraud.ftc.gov",
    "   FBI Internet Crime Complaint Center (IC3): ic3.gov",
    "   Your local police department, your bank, and the platform where contact was made.",
    "",
    "6. DECLARATION (optional)",
    "   I collected the items listed above and ran these checks on the dates shown.",
    "   Name: ______________________  Signature: ______________________  Date: __________",
    "",
    rule,
    fingerprint ? `Report fingerprint (SHA-256): ${fingerprint}` : null,
    fingerprint ? "If any part of this report is changed, the fingerprint will no longer match." : null,
    `Generated by ${BRAND}`,
  );
  return lines.filter((l) => l !== null).join("\n");
}

async function sha256(text) {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

function DetectiveReport() {
  const data = useCaseFile();
  const [status, setStatus] = useState("");
  const [generatedAt, setGeneratedAt] = useState(() => new Date().toISOString());
  const [fingerprint, setFingerprint] = useState("");
  const items = data.items;
  const sum = items.length ? overall(items) : null;

  // The fingerprint covers the report's content (everything except the fingerprint line itself).
  useEffect(() => {
    let cancelled = false;
    sha256(buildText(data, generatedAt, "")).then((h) => !cancelled && setFingerprint(h));
    return () => { cancelled = true; };
  }, [data, generatedAt]);

  function fresh() {
    const now = new Date().toISOString();
    setGeneratedAt(now);
    return now;
  }

  async function currentText() {
    const now = fresh();
    const h = await sha256(buildText(data, now, ""));
    return buildText(data, now, h);
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(await currentText());
      setStatus("Report copied. Paste it into a text or email.");
    } catch {
      setStatus("Couldn't copy automatically. Use Download instead.");
    }
  }

  async function shareReport() {
    const text = await currentText();
    if (navigator.share) {
      try {
        await navigator.share({ title: `${BRAND} Scam Investigation Report ${data.caseId}`, text });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    copyReport();
  }

  async function downloadReport() {
    const blob = new Blob([await currentText()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${BRAND.replace(/\s+/g, "-")}-Report-${data.caseId || new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("Report downloaded.");
  }

  function printReport() {
    fresh();
    setTimeout(() => window.print(), 150);
  }

  function newCase() {
    if (window.confirm("Start a new case? This clears the checks saved in this report.")) {
      clearCase();
      setStatus("");
    }
  }

  return (
    <section className="link-check detective-report">
      <div className="report-screen">
        <h2>{BRAND} Detective Report</h2>
        <p className="subtext">
          Every check you run above is saved here on this device. When you're done investigating,
          share the report with family, your bank or the police.
        </p>

        <label className="field-label" htmlFor="case-title">What's this case about? (optional)</label>
        <input
          id="case-title"
          type="text"
          placeholder="e.g. Man from Facebook named Mark asking for gift cards"
          value={data.title}
          onChange={(e) => setCaseTitle(e.target.value)}
        />
        <label className="field-label" htmlFor="case-preparer">Your name, for the report (optional)</label>
        <input
          id="case-preparer"
          type="text"
          autoComplete="name"
          placeholder="Shown as 'Prepared by'"
          value={data.preparedBy}
          onChange={(e) => setPreparedBy(e.target.value)}
        />

        {items.length === 0 ? (
          <p className="empty-case">No evidence yet. Check a link, phone number, email, photo or message above and it will show up here.</p>
        ) : (
          <>
            <div className={`result risk-${sum.level}`} role="status">
              <h3>{sum.level === "high" ? "⚠️ Case summary" : "Case summary"}</h3>
              <p>{sum.text}</p>
              {data.caseId && <p className="subtext">Report number {data.caseId}</p>}
            </div>

            <ol className="evidence-list">
              {items.map((item, n) => (
                <li key={item.id} className={`evidence evidence-${item.verdict}`}>
                  <div className="evidence-head">
                    <span className="evidence-type">Exhibit {n + 1} · {item.type}</span>
                    <span className={`evidence-verdict verdict-${item.verdict}`}>{VERDICT_TEXT[item.verdict]}</span>
                  </div>
                  <div className="evidence-subject">{item.subject}</div>
                  {item.details && <div className="evidence-details">{item.details}</div>}
                  {item.reasons.length > 0 && (
                    <ul>{item.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                  )}
                  <div className="evidence-foot">
                    <span>{shortStamp(item.at)}</span>
                    <button type="button" className="link-btn" onClick={() => removeEvidence(item.id)} aria-label={`Remove exhibit ${n + 1}, ${item.type}`}>Remove</button>
                  </div>
                </li>
              ))}
            </ol>

            <div className="button-row">
              <button type="button" onClick={printReport}>Print or save as PDF</button>
              <button type="button" onClick={shareReport}>Share report</button>
              <button type="button" onClick={copyReport}>Copy report</button>
              <button type="button" onClick={downloadReport}>Download report</button>
            </div>
            <p className="subtext">The PDF is a formal investigation report with a report number, numbered exhibits and a signature line.</p>
            {status && <p className="subtext" role="status">{status}</p>}
            <button type="button" className="link-btn" onClick={newCase}>Start a new case</button>
          </>
        )}
      </div>

      {items.length > 0 && (
        <article className="formal-report" aria-hidden="true">
          <header className="fr-header">
            <div>
              <div className="fr-brand">{BRAND}</div>
              <h1 className="fr-title">Scam Investigation Report</h1>
            </div>
            <table className="fr-meta-mini">
              <tbody>
                <tr><th>Report No.</th><td>{data.caseId}</td></tr>
                <tr><th>Generated</th><td>{stamp(generatedAt)}</td></tr>
              </tbody>
            </table>
          </header>

          <h2 className="fr-h">Case information</h2>
          <table className="fr-table fr-info">
            <tbody>
              <tr><th>Case</th><td>{data.title || "(not named)"}</td></tr>
              <tr><th>Prepared by</th><td>{data.preparedBy || "(not given)"}</td></tr>
              <tr><th>Case opened</th><td>{stamp(data.openedAt)}</td></tr>
              <tr><th>Exhibits</th><td>{items.length}</td></tr>
              <tr><th>Overall finding</th><td><strong>{sum.finding}</strong></td></tr>
            </tbody>
          </table>

          <h2 className="fr-h">1. Summary of findings</h2>
          <p>{sum.text}</p>
          <table className="fr-table fr-counts">
            <thead><tr><th>Warning signs found</th><th>Needs a closer look</th><th>No warning signs</th><th>Total exhibits</th></tr></thead>
            <tbody><tr><td>{sum.high}</td><td>{sum.caution}</td><td>{sum.low}</td><td>{items.length}</td></tr></tbody>
          </table>

          <h2 className="fr-h">2. Exhibits</h2>
          {items.map((item, n) => (
            <section key={item.id} className="fr-exhibit">
              <h3 className="fr-ex-title">Exhibit {n + 1}: {item.type}</h3>
              <table className="fr-table">
                <tbody>
                  <tr><th>Item examined</th><td className="fr-mono">{item.subject}</td></tr>
                  <tr><th>Checked</th><td>{stamp(item.at)}</td></tr>
                  <tr><th>Finding</th><td><strong>{VERDICT_TEXT[item.verdict]}</strong></td></tr>
                  {item.details && <tr><th>Details</th><td>{item.details}</td></tr>}
                  {item.reasons.length > 0 && (
                    <tr><th>Observations</th><td><ul>{item.reasons.map((r) => <li key={r}>{r}</li>)}</ul></td></tr>
                  )}
                </tbody>
              </table>
            </section>
          ))}

          <h2 className="fr-h">3. Methods</h2>
          <table className="fr-table">
            <tbody>
              {methodsFor(items).map((m) => <tr key={m.label}><th>{m.label}</th><td>{m.text}</td></tr>)}
            </tbody>
          </table>

          <h2 className="fr-h">4. Notes and limitations</h2>
          <p>
            These checks were run by the person named above using the {BRAND} app, at the times shown
            (device local time). The findings are automated warning signs, not a legal determination
            or a forensic examination. Keep the original messages, screenshots, call logs, emails and
            payment receipts: they are the primary evidence.
          </p>

          <h2 className="fr-h">5. Where to report</h2>
          <p>
            Federal Trade Commission: reportfraud.ftc.gov · FBI Internet Crime Complaint Center (IC3): ic3.gov ·
            your local police department, your bank, and the platform where contact was made.
          </p>

          <div className="fr-keep">
            <h2 className="fr-h">6. Declaration (optional)</h2>
            <p>I collected the items listed above and ran these checks on the dates shown.</p>
            <div className="fr-sign">
              <div><span className="fr-line" />Name</div>
              <div><span className="fr-line" />Signature</div>
              <div><span className="fr-line" />Date</div>
            </div>
          </div>

          <footer className="fr-footer">
            {fingerprint && <div>Report fingerprint (SHA-256): <span className="fr-mono">{fingerprint}</span></div>}
            {fingerprint && <div>If any part of this report is changed, the fingerprint will no longer match.</div>}
            <div>Generated by {BRAND} · Report No. {data.caseId}</div>
          </footer>
        </article>
      )}
    </section>
  );
}

export default DetectiveReport;
