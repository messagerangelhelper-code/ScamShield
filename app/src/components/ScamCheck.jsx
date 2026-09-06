import { useState } from "react";

function ScamCheck() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");

  function analyzeScam() {
    if (!input.trim()) {
      setResult("Please enter something to analyze.");
      return;
    }

    setResult(
      "Analysis ready. ScamShield will examine this information for suspicious indicators."
    );
  }

  return (
    <section>
      <h2>Check Something Suspicious</h2>

      <p>
        Paste a suspicious message, website, phone number, email, username,
        or cryptocurrency address for analysis.
      </p>

      <textarea
        placeholder="Paste suspicious content here..."
        rows="8"
        value={input}
        onChange={(event) => setInput(event.target.value)}
      />

      <br />

      <button type="button" onClick={analyzeScam}>
        Analyze for Scams
      </button>

      {result && <p>{result}</p>}
    </section>
  );
}

export default ScamCheck;
