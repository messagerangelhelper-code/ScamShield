import { useState } from "react";

const BUREAUS = [
  {
    name: "Equifax",
    freezeUrl: "https://my.equifax.com/consumer-registration/UCSC/#/personal-info",
    phone: "1-800-685-1111",
  },
  {
    name: "Experian",
    freezeUrl: "https://www.experian.com/freeze/center.html",
    phone: "1-888-397-3742",
  },
  {
    name: "TransUnion",
    freezeUrl: "https://www.transunion.com/credit-freeze",
    phone: "1-888-909-8872",
  },
];

export default function FreezeCredit() {
  const [expanded, setExpanded] = useState(null);

  return (
    <div className="freeze-credit">
      <h3 className="freeze-credit-title">Freeze My Credit</h3>
      <p className="freeze-credit-description">
        A credit freeze stops anyone — including scammers — from opening new
        accounts in your name. You need to freeze with all three bureaus for
        full protection. It's free and doesn't hurt your credit score.
      </p>

      <div className="bureau-list">
        {BUREAUS.map((b) => (
          <div key={b.name} className="bureau-card">
            <div className="bureau-card-header">
              <span className="bureau-name">{b.name}</span>
              <button
                onClick={() => setExpanded(expanded === b.name ? null : b.name)}
                className="bureau-toggle"
              >
                {expanded === b.name ? "Hide options" : "How to freeze"}
              </button>
            </div>
            {expanded === b.name && (
              <div className="bureau-options">
                <a href={b.freezeUrl} target="_blank" rel="noopener noreferrer" className="bureau-link">
                  Freeze online at {b.name}.com
                </a>
                <a href={`tel:${b.phone.replace(/\D/g, "")}`} className="bureau-link">
                  Call {b.phone}
                </a>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="freeze-credit-note">
        Keep the PIN or password each bureau gives you — you'll need it to
        lift the freeze later when you actually apply for credit.
      </p>
    </div>
  );
}
