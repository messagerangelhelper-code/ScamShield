function InsuranceCheck() {
  return (
    <section className="insurance-check">
      <h2>Verify an Insurance Agent or Company</h2>
      <p className="subtext">
        Real insurance agents and companies are licensed by your state. If
        someone contacts you about a policy, claim, or "deductible payment,"
        verify them for free before sending anything.
      </p>

      <ul className="insurance-red-flags">
        <li>A real insurer never asks you to pay a deductible directly to an agent</li>
        <li>A real claim is never delayed by an upfront "processing fee"</li>
        <li>Medicare will never call asking you to "confirm" your Medicare number</li>
        <li>A licensed agent will always have a verifiable license number</li>
      </ul>

      <div className="button-row">
        <a
          href="https://eapps.naic.org/cis/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <button type="button">
            Verify Agent/Company License (NAIC — free)
          </button>
        </a>
        <a
          href="https://www.medicare.gov/basics/reporting-medicare-fraud"
          target="_blank"
          rel="noopener noreferrer"
        >
          <button type="button">Report Medicare Fraud</button>
        </a>
      </div>
    </section>
  );
}

export default InsuranceCheck;
