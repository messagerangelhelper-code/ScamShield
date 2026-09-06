export function scamAnalysis(text) {
  const content = String(text || "").toLowerCase();

  const indicators = [];

  const patterns = [
    {
      words: ["urgent", "immediately", "act now"],
      reason: "Urgency or pressure tactics detected."
    },
    {
      words: ["send money", "wire transfer", "gift card", "crypto"],
      reason: "Request for money or cryptocurrency detected."
    },
    {
      words: ["password", "verification code", "security code"],
      reason: "Possible credential or account-access request detected."
    },
    {
      words: ["guaranteed", "risk free", "easy money"],
      reason: "Potentially misleading financial claims detected."
    },
    {
      words: ["click this link", "click here", "verify your account"],
      reason: "Potential phishing or suspicious-link language detected."
    }
  ];

  for (const pattern of patterns) {
    if (pattern.words.some((word) => content.includes(word))) {
      indicators.push(pattern.reason);
    }
  }

  let risk = "LOW";

  if (indicators.length >= 3) {
    risk = "HIGH";
  } else if (indicators.length >= 1) {
    risk = "MEDIUM";
  }

  return {
    risk,
    indicators,
    indicatorCount: indicators.length
  };
}
