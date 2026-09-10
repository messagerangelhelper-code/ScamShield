function CharityCheck() {
  return (
    <section className="charity-check">
      <h2>Verify a Charity Before Donating</h2>
      <p className="subtext">
        Scam donation requests spike after disasters and during the
        holidays. Before giving, verify the charity is real and actually
        registered — for free, in under a minute.
      </p>

      <ul className="insurance-red-flags">
        <li>A real charity never pressures you to donate immediately</li>
        <li>A real charity never asks for gift cards, wire transfers, or crypto</li>
        <li>Legitimate charities are registered and searchable by name</li>
        <li>Be wary of names that sound similar to well-known charities</li>
      </ul>

      <div className="button-row">
        <a
          href="https://apps.irs.gov/app/eos/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <button type="button">
            Verify Tax-Exempt Status (IRS — free)
          </button>
        </a>
        <a
          href="https://give.org/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <button type="button">BBB Wise Giving Alliance</button>
        </a>
        <a
          href="https://www.charitynavigator.org/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <button type="button">Charity Navigator Ratings</button>
        </a>
      </div>
    </section>
  );
}

export default CharityCheck;
