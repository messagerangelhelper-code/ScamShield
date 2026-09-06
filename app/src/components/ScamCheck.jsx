import { useState } from "react";
import { scamAnalysis } from "../services/scamAnalysis";
import RiskResult from "./RiskResult";

function ScamCheck() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);

  function handleAnalyze() {
    if (!text.trim()) {
      setResult(null);
      return;
    }

    const analysis = scamAnalysis(text);
    setResult(analysis);
  }

  return (
    <section>
      <h2>Check Something Suspicious</h2>

      <p>
        Paste a suspicious message, website, phone number, email,
        username, or cryptocurrency address for analysis.
      </p>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Paste suspicious content here..."
        rows="8"
      />

      <br />

      <button type="button" onClick={handleAnalyze}>
        Analyze for Scams
      </button>

      {result && <RiskResult result={result} />}
    </section>
  );
}

export default ScamCheck;
