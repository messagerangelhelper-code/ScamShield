import { useState } from "react";

function AdminReset() {
  const [confirmed, setConfirmed] = useState(false);

  function handleReset() {
    localStorage.removeItem("scamshield_usage");
    localStorage.removeItem("scamshield_stats");
    setConfirmed(true);
    setTimeout(() => setConfirmed(false), 2000);
  }

  return (
    <section className="admin-reset">
      <h2>Testing Tools</h2>
      <p className="subtext">
        Resets your free-check count and dashboard stats on this device only.
        This is for testing — remove this section before a real launch.
      </p>
      <button type="button" onClick={handleReset}>
        Reset Test Data
      </button>
      {confirmed && <p className="subtext">Reset complete — refresh the page.</p>}
    </section>
  );
}

export default AdminReset;
