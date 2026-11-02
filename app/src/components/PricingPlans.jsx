import { useEffect, useState } from "react";
import { getUsage } from "../utils/usageTracker";
import { ALL_ACCESS, SCAMSHIELD_PLANS, checkPremiumOnce, startCheckout } from "../utils/premium";

// Payments are handled by the CashCow platform (Stripe checkout).
function PlanRow({ p, busy, onBuy, primary }) {
  return (
    <div className="plan-row">
      <div>
        <strong>{p.label}</strong> {p.note && <span className="plan-note">{p.note}</span>}
        <div className="price">{p.price} <span className="subtext">{p.per}</span></div>
      </div>
      <button type="button" className={primary ? "" : "secondary"} disabled={!!busy} onClick={() => onBuy(p.id)}>
        {busy === p.id ? "Opening…" : "Choose"}
      </button>
    </div>
  );
}

function PricingPlans() {
  const [usage, setUsage] = useState(0);
  const [isPremium, setIsPremium] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const refresh = () => {
      const data = getUsage();
      setUsage(data.count);
      setIsPremium(data.premium);
    };
    refresh();
    checkPremiumOnce().then(refresh);
    window.addEventListener("stats-change", refresh);
    return () => window.removeEventListener("stats-change", refresh);
  }, []);

  async function buy(id) {
    setError("");
    setBusy(id);
    try {
      await startCheckout(id);
    } catch (e) {
      setError(e.message);
      setBusy("");
    }
  }

  if (isPremium) {
    return (
      <section className="pricing-plans" id="plans">
        <h2>You're on Premium ✅</h2>
        <p>Unlimited checks across all ScamShield tools. Thank you for supporting the project.</p>
      </section>
    );
  }

  return (
    <section className="pricing-plans" id="plans">
      <h2>Plans</h2>
      <p className="subtext">You've used {usage} of 3 free checks this month. Free checks refresh on the 1st.</p>

      <div className="plans-row">
        <div className="plan-card">
          <h3>Free</h3>
          <p className="price">$0</p>
          <ul>
            <li>3 checks every month</li>
            <li>Every guide and checklist</li>
            <li>Detective Report with PDF</li>
            <li>Shared scam list warnings</li>
          </ul>
        </div>

        <div className="plan-card highlight">
          <h3>ScamShield Premium</h3>
          <ul>
            <li>Unlimited checks in every tool: messages, screenshots, links, QR codes, phone numbers, emails and crypto wallets</li>
            <li>Email Guard: forward or auto-check your email for scams</li>
            <li>Works in ScamShield, ScamGuard Global and Email Guard</li>
          </ul>
          {SCAMSHIELD_PLANS.map((p) => <PlanRow key={p.id} p={p} busy={busy} onBuy={buy} primary />)}
        </div>

        <div className="plan-card">
          <h3>⭐ CashCow All Access</h3>
          <p className="subtext">Same price, every app: ScamShield Premium plus Premium in My Health Check Scan, My Letter Helper, My Recall Check, My Caregiver Circle, My Fix-It Helper, My Shopping Helper and every new CashCow app.</p>
          <p className="subtext">Sign in to your CashCow account above first.</p>
          {ALL_ACCESS.map((p) => <PlanRow key={p.id} p={p} busy={busy} onBuy={buy} />)}
        </div>
      </div>
      {busy && <p className="subtext">Opening secure checkout. The first time can take up to a minute.</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      <p className="subtext">Payments are handled securely by Stripe through CashCow. Monthly and yearly plans renew until you cancel.</p>
    </section>
  );
}

export default PricingPlans;
