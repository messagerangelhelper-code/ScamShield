import { useEffect, useState } from "react";
import { getUsage } from "../utils/usageTracker";

// Payments are handled by the CashCow platform (Stripe checkout).
const CASHCOW_URL = "https://cashcowai.online/#all-access";

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
          <h3>Premium</h3>
          <p className="price">Coming soon</p>
          <p className="subtext">Part of CashCow All Access: one membership for Premium in every CashCow app.</p>
          <ul>
            <li>Everything in Free</li>
            <li>Unlimited checks in every tool: messages, screenshots, links, QR codes, phone numbers, emails and crypto wallets</li>
            <li>Investigate as many cases as you need</li>
          </ul>
          <a href={CASHCOW_URL}>
            <button type="button">Get notified</button>
          </a>
        </div>
      </div>
    </section>
  );
}

export default PricingPlans;
