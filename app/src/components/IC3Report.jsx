import { useState } from "react";

const initialState = {
  dateOccurred: "",
  amountLost: "",
  paymentMethod: "",
  scammerContact: "",
  platform: "",
  description: "",
};

function IC3Report() {
  const [form, setForm] = useState(initialState);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function buildReportText() {
    return `SCAMSHIELD — INCIDENT SUMMARY
Prepared for submission to IC3.gov (FBI Internet Crime Complaint Center)
Generated: ${new Date().toLocaleString()}

Date incident occurred: ${form.dateOccurred || "Not provided"}
Amount lost: ${form.amountLost || "Not provided"}
Payment method used: ${form.paymentMethod || "Not provided"}
Platform where contact was made: ${form.platform || "Not provided"}
Scammer contact info (username, phone, email, wallet address, etc.):
${form.scammerContact || "Not provided"}

Description of what happened:
${form.description || "Not provided"}

---
This summary is for your own records and to make filing faster.
It is NOT submitted automatically — copy the relevant sections into
the official IC3 complaint form at https://www.ic3.gov/Home/FileComplaint
`;
  }

  function handleDownload() {
    const blob = new Blob([buildReportText()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scamshield-incident-summary.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="ic3-report">
      <h2>Report to Law Enforcement</h2>
      <p className="subtext">
        There's no direct FBI submission API — no such thing exists publicly.
        This organizes your evidence into a clean summary so filing the real
        report at IC3.gov takes minutes, not hours.
      </p>

      <form onSubmit={(e) => e.preventDefault()}>
        <label>
          Date it happened
          <input
            type="date"
            name="dateOccurred"
            value={form.dateOccurred}
            onChange={handleChange}
          />
        </label>

        <label>
          Amount lost (USD)
          <input
            type="text"
            name="amountLost"
            placeholder="e.g. 800"
            value={form.amountLost}
            onChange={handleChange}
          />
        </label>

        <label>
          Payment method used
          <input
            type="text"
            name="paymentMethod"
            placeholder="e.g. bank transfer, crypto, gift card"
            value={form.paymentMethod}
            onChange={handleChange}
          />
        </label>

        <label>
          Platform where you were contacted
          <input
            type="text"
            name="platform"
            placeholder="e.g. Facebook Marketplace"
            value={form.platform}
            onChange={handleChange}
          />
        </label>

        <label>
          Scammer's contact info
          <input
            type="text"
            name="scammerContact"
            placeholder="Username, phone, email, wallet address..."
            value={form.scammerContact}
            onChange={handleChange}
          />
        </label>

        <label>
          What happened
          <textarea
            name="description"
            rows={5}
            placeholder="Describe the incident in your own words..."
            value={form.description}
            onChange={handleChange}
          />
        </label>

        <div className="button-row">
          <button type="button" onClick={handleDownload}>
            Download Summary
          </button>
          <a
            href="https://www.ic3.gov/Home/FileComplaint"
            target="_blank"
            rel="noopener noreferrer"
          >
            <button type="button">Open IC3.gov to File</button>
          </a>
        </div>
      </form>
    </section>
  );
}

export default IC3Report;
