function Subscriptions() {
  const plans = [
    {
      name: "Free",
      price: "$0",
      description: "Basic protection for everyday scam checks.",
      features: [
        "Basic scam analysis",
        "Risk warnings",
        "Limited monthly analyses",
        "Basic evidence organization"
      ]
    },
    {
      name: "Protect",
      price: "$9.99/month",
      description: "More protection for individuals.",
      features: [
        "Expanded AI scam analysis",
        "Screenshot and message analysis",
        "Evidence organization",
        "Senior Protection Mode",
        "Before You Pay warnings",
        "Crypto scam warnings"
      ]
    },
    {
      name: "Family",
      price: "$19.99/month",
      description: "Protection for families and loved ones.",
      features: [
        "Everything in Protect",
        "Multiple family members",
        "Trusted-contact features",
        "Family safety alerts",
        "Shared review with permission"
      ]
    },
    {
      name: "Premium",
      price: "$29.99/month",
      description: "Advanced protection and investigation tools.",
      features: [
        "Everything in Family",
        "Advanced crypto investigation",
        "Scam-network analysis",
        "Expanded evidence tools",
        "Priority support"
      ]
    }
  ];

  return (
    <section>
      <h2>Choose Your ScamShield Protection</h2>

      <p>
        Choose the level of protection that fits you and your family.
      </p>

      <div>
        {plans.map((plan) => (
          <article key={plan.name}>
            <h3>{plan.name}</h3>
            <h4>{plan.price}</h4>
            <p>{plan.description}</p>

            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>

            <button type="button">
              Choose {plan.name}
            </button>
          </article>
        ))}
      </div>

      <hr />

      <h3>Business & Insurance Protection</h3>

      <p>
        ScamShield can provide customized protection and fraud
        intelligence for businesses, insurers, and other organizations.
      </p>

      <button type="button">
        Contact ScamShield
      </button>
    </section>
  );
}

export default Subscriptions;
