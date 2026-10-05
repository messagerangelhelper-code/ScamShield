import { useEffect, useState } from "react";
import { getUsage } from "../utils/usageTracker";

// Payments are handled by the CashCow platform (Stripe checkout).
const CASHCOW_URL = "https://integrity-records-platform.onrender.com/";

function PricingPlans() {
  const [usage, setUsage] = useState(0);
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    const data = getUsage();
    setUsage(data.count);
    setIsPremium(data.premium);
  }, []);

  if (isPremium) {
    return (
      <section className="pricing-plans">
        <h2>You're on Premium ✅</h2>
        <p>Unlimited checks across all ScamShield tools. Thank you for supporting the project.</p>
      </section>
    );
  }

  return (
    <section className="pricing-plans">
      <h2>Plans</h2>
      <p className="subtext">You've used {usage} of 3 free checks.</p>

      <div className="plans-row">
        <div className="plan-card">
          <h3>Free</h3>
          <p className="price">$0</p>
          <ul>
            <li>3 total checks</li>
            <li>Basic red-flag scoring</li>
          </ul>
        </div>

        <div className="plan-card highlight">
          <h3>Premium</h3>
          <p className="price">$29<span>/mo</span></p>
          <p className="subtext">or $249/year</p>
          <ul>
            <li>Unlimited scam, link & crypto checks</li>
            <li>IC3 report builder</li>
            <li>Senior protection mode</li>
            <li>Priority updates to the scam pattern database</li>
          </ul>
          <a href={CASHCOW_URL}>
            <button type="button">Get Premium</button>
          </a>
        </div>
      </div>
    </section>
  );
}

export default PricingPlans;
