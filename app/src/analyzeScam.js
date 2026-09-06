export function analyzeScam(text) {
  const indicators = [];

  const content = text.toLowerCase();

  const patterns = [
    {
      words: ["urgent", "immediately", "act now", "last chance"],
      reason: "Urgency or pressure tactics detected."
    },
    {
      words: ["send money", "wire transfer", "gift card", "bitcoin", "crypto"],
      reason: "Request for money or cryptocurrency detected."
    },
    {
      words: ["password", "verification code", "security code", "login"],
      reason: "Possible credential or account-access request detected."
    },
    {
      words: ["guaranteed", "risk free", "easy money", "double your money"],
      reason: "Potentially misleading financial promises detected."
    },
    {
      words: ["click this link", "click here", "verify your account"],
      reason: "Possible phishing or suspicious-link language detected."
    }
  ];

  patterns.forEach((pattern) => {
    const found = pattern.words.some((word) => content.includes(word));

    if (found) {
      indicators.push(pattern.reason);
    }
  });

  let risk = "LOW";

  if (indicators.length >= 3) {
    risk = "HIGH";
  } else if (indicators.length >= 1) {
    risk = "MEDIUM";
  }

  return {
    risk,
    indicators,
    evidenceCount: indicators.length
  };
}
