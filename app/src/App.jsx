import Dashboard from "./components/Dashboard";
import ScamCheck from "./components/ScamCheck";
import LinkCheck from "./components/LinkCheck";
import CryptoCheck from "./components/CryptoCheck";
import IC3Report from "./components/IC3Report";
import PricingPlans from "./components/PricingPlans";
import SeniorMode from "./components/SeniorMode";
import InsuranceCheck from "./components/InsuranceCheck";
import CharityCheck from "./components/CharityCheck";
import AdminReset from "./components/AdminReset";
import USAFlagIcon from "./components/USAFlagIcon";

function App() {
  const isAdmin = new URLSearchParams(window.location.search).get("admin") === "true";

  return (
    <main>
      <header>
        <div className="header-top-row">
          <h1>
            ScamShield<span className="domain-badge">.global</span>
          </h1>
          <USAFlagIcon />
        </div>
        <p>
          AI-powered scam detection, evidence collection,
          and fraud reporting assistance.
        </p>
      </header>

      <SeniorMode />
      <Dashboard />
      <ScamCheck />
      <LinkCheck />
      <CryptoCheck />
      <InsuranceCheck />
      <CharityCheck />
      <IC3Report />
      <PricingPlans />
      {isAdmin && <AdminReset />}
    </main>
  );
}

export default App;
