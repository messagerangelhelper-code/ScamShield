import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const CHAINS = [
  { value: "ethereum", label: "Ethereum" },
  { value: "bitcoin", label: "Bitcoin" },
  { value: "bnb", label: "BNB Chain" },
  { value: "tron", label: "TRON" },
];

function CryptoCheck() {
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState("ethereum");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleCheck(e) {
    e.preventDefault();
    if (!address.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_URL}/api/crypto-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address.trim(), chain }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError(err.message || "Something went wrong checking this address.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="crypto-check">
      <h2>Check a Crypto Address Before Sending</h2>
      <p className="subtext">
        Always check the destination wallet — especially if someone is
        "helping" you send or cash out funds.
      </p>

      <form onSubmit={handleCheck}>
        <select value={chain} onChange={(e) => setChain(e.target.value)}>
          {CHAINS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Paste wallet address here..."
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Checking..." : "Check Address"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className={`result risk-${result.risk_level}`}>
          <h3>Risk Level: {result.risk_level?.toUpperCase()}</h3>
          {result.aml_score !== undefined && (
            <p>AML Score: {result.aml_score} / 100</p>
          )}
          {result.category && <p>Category: {result.category}</p>}
          {result.label && <p>Known as: {result.label}</p>}
          {result.message && <p>{result.message}</p>}
          {result.risk_level === "high" && (
            <p className="warning">
              ⚠️ This address has been flagged. Do not send funds — this may
              be a scam.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default CryptoCheck;
