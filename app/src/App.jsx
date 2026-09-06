import Dashboard from "./components/Dashboard";
import ScamCheck from "./components/ScamCheck";

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
    </main>
  );
}

export default App;
