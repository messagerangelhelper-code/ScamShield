import { useState, useEffect } from "react";

const MODE_KEY = "scamshield_senior_mode";
const CONTACT_KEY = "scamshield_trusted_contact";

export function isSeniorMode() {
  return localStorage.getItem(MODE_KEY) === "true";
}

function SeniorMode() {
  const [enabled, setEnabled] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setEnabled(localStorage.getItem(MODE_KEY) === "true");
    const contact = JSON.parse(localStorage.getItem(CONTACT_KEY)) || {};
    setContactName(contact.name || "");
    setContactPhone(contact.phone || "");
  }, []);

  useEffect(() => {
    document.body.classList.toggle("senior-mode", enabled);
    localStorage.setItem(MODE_KEY, enabled ? "true" : "false");
  }, [enabled]);

  function handleSaveContact(e) {
    e.preventDefault();
    localStorage.setItem(
      CONTACT_KEY,
      JSON.stringify({ name: contactName, phone: contactPhone })
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <section className="senior-mode-panel">
      <h2>Simple Mode & Trusted Contact</h2>

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Turn on larger text and simpler screens
      </label>

      <p className="subtext">
        Save a family member or friend you trust. If something looks
        suspicious, you'll be able to call them with one tap before sending
        any money.
      </p>

      <form onSubmit={handleSaveContact}>
        <input
          type="text"
          placeholder="Their name (e.g. my daughter Sarah)"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
        />
        <input
          type="tel"
          placeholder="Their phone number"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
        />
        <button type="submit">Save Trusted Contact</button>
        {saved && <p className="subtext">Saved.</p>}
      </form>

      {contactPhone && (
        <a href={`tel:${contactPhone}`}>
          <button type="button" className="call-trusted-button">
            📞 Call {contactName || "my trusted contact"} now
          </button>
        </a>
      )}
    </section>
  );
}

export default SeniorMode;
