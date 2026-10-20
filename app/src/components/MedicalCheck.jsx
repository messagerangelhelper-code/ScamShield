function MedicalCheck() {
  return (
    <section className="insurance-check medical-check">
      <h2>Check a Medical Offer</h2>
      <p className="subtext">
        Medical scams use "free" tests, equipment or cheap medicine to get your
        Medicare or insurance details, then bill in your name. Check before you
        give anything out.
      </p>

      <ul className="insurance-red-flags">
        <li>A stranger offers a "free" genetic, DNA, cancer or heart test — and asks for your Medicare number</li>
        <li>Someone calls about "free" braces, diabetic supplies or medical equipment you never asked your doctor for</li>
        <li>An online pharmacy sells prescription medicine with "no prescription needed"</li>
        <li>A product promises to cure diabetes, cancer or other serious illness</li>
        <li>A caller demands same-day payment on a medical bill, especially by gift card</li>
        <li>Your Medicare statement shows services you never received — someone may be using your identity</li>
      </ul>

      <p className="subtext">
        Only give your Medicare or insurance number to your own doctor,
        pharmacy or insurer. Medicare will not call you to sell anything.
      </p>

      <div className="button-row">
        <a
          href="https://www.fda.gov/drugs/buying-using-medicine-safely/besaferx-your-source-online-pharmacy-information"
          target="_blank"
          rel="noopener noreferrer"
        >
          <button type="button">Check an Online Pharmacy (FDA BeSafeRx)</button>
        </a>
        <a
          href="https://oig.hhs.gov/fraud/report-fraud/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <button type="button">Report Health Care Fraud (HHS-OIG)</button>
        </a>
        <a
          href="https://www.medicare.gov/basics/reporting-medicare-fraud"
          target="_blank"
          rel="noopener noreferrer"
        >
          <button type="button">Report Medicare Fraud</button>
        </a>
      </div>
      <p className="subtext">HHS-OIG hotline: 1-800-HHS-TIPS</p>
    </section>
  );
}

export default MedicalCheck;
