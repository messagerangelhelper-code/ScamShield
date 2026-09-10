import Dashboard from "./components/Dashboard";
import ScamCheck from "./components/ScamCheck";
import CryptoCheck from "./components/CryptoCheck";
import IC3Report from "./components/IC3Report";
import PricingPlans from "./components/PricingPlans";
import SeniorMode from "./components/SeniorMode";
import InsuranceCheck from "./components/InsuranceCheck";
import CharityCheck from "./components/CharityCheck";

function App() {
  return (
    <main>
      <header>
        <h1>ScamShield</h1>
        <p>
          AI-powered scam detection, evidence collection,
          and fraud reporting assistance.
        </p>
      </header>

      <SeniorMode />
      <Dashboard />
      <ScamCheck />
      <CryptoCheck />
      <InsuranceCheck />
      <CharityCheck />
      <IC3Report />
      <PricingPlans />
    </main>
  );
}

export default App;
