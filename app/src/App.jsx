import Dashboard from "./components/Dashboard";
import ScamCheck from "./components/ScamCheck";
import CryptoCheck from "./components/CryptoCheck";
import IC3Report from "./components/IC3Report";
import PricingPlans from "./components/PricingPlans";

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

      <Dashboard />
      <ScamCheck />
      <CryptoCheck />
      <IC3Report />
      <PricingPlans />
    </main>
  );
}

export default App;
