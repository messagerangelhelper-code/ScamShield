cat > app/src/components/DecoyCard.jsx << 'EOF'
import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function DecoyCard() {
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  async function handleRequestCard() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/decoy-card`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "prepaid_card_scam" }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCard(data);
    } catch (err) {
      setError(err.message || "Couldn't generate a decoy card right now.");
    } finally {
      setLoading(false);
    }
  }

  if (!expanded) {
    return (
      <div className="decoy-prompt">
        <p>
          <strong>Are they asking you to load money onto a gift card or
          prepaid Visa?</strong> That's one of the most common scam payment
          methods — it's untraceable once used.
        </p>
        <button onClick={() => setExpanded(true)}>Show me a safer alternative</button>
      </div>
    );
  }

  return (
    <div className="decoy-card">
      <h3>Decoy Card</h3>
      <p className="subtext">
        Instead of a real card, we can generate a near-zero-balance decoy
        card to give them. If they try to use it, the attempt is logged —
        merchant name, location, and time — as evidence for your scam report.
      </p>
      {!card && (
        <button onClick={handleRequestCard} disabled={loading}>
          {loading ? "Generating..." : "Generate Decoy Card"}
        </button>
      )}
      {error && <p className="error">{error}</p>}
      {card && (
        <div className="result risk-low">
          <p>{card.note}</p>
          {card.card_number && (
            <>
              <p>Card Number: {card.card_number}</p>
              <p>Expiry: {card.expiry}</p>
              <p>CVV: {card.cvv}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default DecoyCard;
EOF
