function RiskResult({ risk = "Not analyzed", reasons = [] }) {
  return (
    <section>
      <h2>Scam Risk Assessment</h2>

      <p>
        <strong>Risk Level:</strong> {risk}
      </p>

      {reasons.length > 0 && (
        <>
          <h3>Why it may be suspicious</h3>
          <ul>
            {reasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export default RiskResult;
