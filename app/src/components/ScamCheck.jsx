
import { useState } from "react";
import { analyzeScam } from "../services/analyzeScam";
import RiskResult from "./RiskResult";

function ScamCheck() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);

  function handleAnalyze() {
    if (!text.trim()) {
      setResult(null);
      return;
    }

    const analysis = analyzeScam(text);
    setResult(analysis);
  }

  return (
    <section>
      <h2>Check Something Suspicious</h2>

      <p>
        Paste a suspicious message, website, phone number, username,
        email, or cryptocurrency address for analysis.
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

      <RiskResult result={result} />
    </section>
  );
}

export default ScamCheck;
