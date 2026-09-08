cat > app/src/components/PricingPlans.jsx << 'EOF'
import { useEffect, useState } from "react";
import { getUsage } from "../utils/usageTracker";

const PAYPAL_CLIENT_ID = "YOUR_PAYPAL_CLIENT_ID";

function PricingPlans() {
  const [usage, setUsage] = useState(0);
  const [isPremium, setIsPremium] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);

  useEffect(() => {
    const data = getUsage();
    setUsage(data.count);
    setIsPremium(data.premium);
  }, []);

  useEffect(() => {
    if (isPremium || sdkLoaded) return;
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&vault=true&intent=subscription`;
    script.onload = () => setSdkLoaded(true);
    document.body.appendChild(script);
    return () => document.body.removeChild(script);
  }, [isPremium, sdkLoaded]);

  useEffect(() => {
    if (!sdkLoaded || !window.paypal) return;
    window.paypal
      .Buttons({
        style: { shape: "rect", color: "blue", layout: "vertical", label: "subscribe" },
        createSubscription: function (data, actions) {
          return actions.subscription.create({ plan_id: "YOUR_PAYPAL_PLAN_ID" });
        },
        onApprove: function (data) {
          const stored = JSON.parse(localStorage.getItem("scamshield_usage")) || {};
          stored.premium = true;
          stored.subscriptionId = data.subscriptionID;
          localStorage.setItem("scamshield_usage", JSON.stringify(stored));
          setIsPremium(true);
        },
      })
      .render("#paypal-button-container");
  }, [sdkLoaded]);

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
            <li>3 total checks (scam-checker, crypto, or both combined)</li>
            <li>Basic red-flag scoring</li>
          </ul>
        </div>
        <div className="plan-card highlight">
          <h3>Premium</h3>
          <p className="price">$9.99<span>/mo</span></p>
          <p className="subtext">or $79/year (save ~34%)</p>
          <ul>
            <li>Unlimited scam & crypto checks</li>
            <li>IC3 report builder</li>
            <li>Senior protection mode</li>
            <li>Priority updates to scam pattern database</li>
          </ul>
          <div id="paypal-button-container"></div>
        </div>
      </div>
    </section>
  );
}

export default PricingPlans;
EOF
