function TaxScamCheck() {
  return (
    <section className="tax-scam-check">
      <h2>Verify an IRS Contact</h2>
      <p className="subtext">
        The IRS's own 2026 "Dirty Dozen" scam list specifically warns about
        AI-generated voice calls impersonating the IRS, with spoofed caller
        ID. Before responding to any "IRS" contact, check it against these
        real warning signs.
      </p>

      <ul className="insurance-red-flags">
        <li>The IRS contacts you by mail first — not by phone, text, email, or social media</li>
        <li>The IRS never demands immediate payment or threatens arrest over the phone</li>
        <li>The IRS never asks for payment by gift card, wire transfer, or cryptocurrency</li>
        <li>Be cautious of AI-generated or robotic-sounding "IRS" voice calls with urgent threats</li>
        <li>The IRS never asks for sensitive info via unsolicited email, text, or social media DM</li>
      </ul>

      <div className="button-row">
        <a
          href="https://www.irs.gov/SubmitATip"
          target="_blank"
          rel="noopener noreferrer"
        >
          <button type="button">Report to IRS (free)</button>
        </a>
        <a
          href="mailto:phishing@irs.gov"
          target="_blank"
          rel="noopener noreferrer"
        >
          <button type="button">Forward a Phishing Email</button>
        </a>
      </div>
    </section>
  );
}

export default TaxScamCheck;
