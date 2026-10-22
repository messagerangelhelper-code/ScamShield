import { useState } from "react";
import { useCaseFile, removeEvidence, setCaseTitle, clearCase } from "../utils/caseFile";

const BRAND = "ScamShield";

const VERDICT_TEXT = {
  high: "Warning signs found",
  caution: "Be careful",
  low: "No warning signs found",
};

function when(iso) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function overall(items) {
  const high = items.filter((i) => i.verdict === "high").length;
  const caution = items.filter((i) => i.verdict === "caution").length;
  if (high > 0) return { level: "high", text: `${high} of ${items.length} checks found warning signs. This looks like a scam. Don't send money or personal details.` };
  if (caution > 0) return { level: "medium", text: `${caution} of ${items.length} checks need a closer look. Slow down and verify before you trust them.` };
  return { level: "low", text: `None of the ${items.length} checks found warning signs. That's good news, but scammers can still fool any check, so stay careful.` };
}

function buildText(data) {
  const sum = overall(data.items);
  const lines = [
    `${BRAND.toUpperCase()} DETECTIVE REPORT`,
    data.title ? `Case: ${data.title}` : null,
    `Prepared ${new Date().toLocaleString()}`,
    "",
    `Summary: ${sum.text}`,
    "",
  ];
  data.items.forEach((item, n) => {
    lines.push(`${n + 1}. ${item.type.toUpperCase()}: ${item.subject}`);
    lines.push(`   Checked ${when(item.at)} · ${VERDICT_TEXT[item.verdict]}`);
    if (item.details) lines.push(`   ${item.details}`);
    item.reasons.forEach((r) => lines.push(`   - ${r}`));
    lines.push("");
  });
  lines.push("To report a scam: reportfraud.ftc.gov or ic3.gov (FBI).");
  return lines.filter((l) => l !== null).join("\n");
}

function DetectiveReport() {
  const data = useCaseFile();
  const [status, setStatus] = useState("");
  const items = data.items;
  const sum = items.length ? overall(items) : null;

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(buildText(data));
      setStatus("Report copied. Paste it into a text or email.");
    } catch {
      setStatus("Couldn't copy automatically. Use Download instead.");
    }
  }

  async function shareReport() {
    const text = buildText(data);
    if (navigator.share) {
      try {
        await navigator.share({ title: `${BRAND} Detective Report`, text });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    copyReport();
  }

  function downloadReport() {
    const blob = new Blob([buildText(data)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${BRAND.replace(/\s+/g, "-")}-Detective-Report-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("Report downloaded.");
  }

  function newCase() {
    if (window.confirm("Start a new case? This clears the checks saved in this report.")) {
      clearCase();
      setStatus("");
    }
  }

  return (
    <section className="link-check detective-report">
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

      {items.length === 0 ? (
        <p className="empty-case">No evidence yet. Check a link, phone number, email, photo or message above and it will show up here.</p>
      ) : (
        <>
          <div className={`result risk-${sum.level}`} role="status">
            <h3>{sum.level === "high" ? "⚠️ Case summary" : "Case summary"}</h3>
            <p>{sum.text}</p>
          </div>

          <ol className="evidence-list">
            {items.map((item) => (
              <li key={item.id} className={`evidence evidence-${item.verdict}`}>
                <div className="evidence-head">
                  <span className="evidence-type">{item.type}</span>
                  <span className={`evidence-verdict verdict-${item.verdict}`}>{VERDICT_TEXT[item.verdict]}</span>
                </div>
                <div className="evidence-subject">{item.subject}</div>
                {item.details && <div className="evidence-details">{item.details}</div>}
                {item.reasons.length > 0 && (
                  <ul>{item.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                )}
                <div className="evidence-foot">
                  <span>{when(item.at)}</span>
                  <button type="button" className="link-btn" onClick={() => removeEvidence(item.id)} aria-label={`Remove ${item.type} ${item.subject}`}>Remove</button>
                </div>
              </li>
            ))}
          </ol>

          <div className="button-row no-print">
            <button type="button" onClick={shareReport}>Share report</button>
            <button type="button" onClick={copyReport}>Copy report</button>
            <button type="button" onClick={downloadReport}>Download report</button>
            <button type="button" onClick={() => window.print()}>Print or save as PDF</button>
          </div>
          {status && <p className="subtext" role="status">{status}</p>}
          <button type="button" className="link-btn no-print" onClick={newCase}>Start a new case</button>
        </>
      )}
    </section>
  );
}

export default DetectiveReport;
