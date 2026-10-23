import Dashboard from "./components/Dashboard";
import InvestigateMessage from "./components/InvestigateMessage";
import LinkCheck from "./components/LinkCheck";
import QRCheck from "./components/QRCheck";
import PhoneCheck from "./components/PhoneCheck";
import EmailCheck from "./components/EmailCheck";
import PhotoCheck from "./components/PhotoCheck";
import StrangerCheck from "./components/StrangerCheck";
import TaskScamCheck from "./components/TaskScamCheck";
import DetectiveReport from "./components/DetectiveReport";
import Account from "./components/Account";
import OperationsPanel from "./components/OperationsPanel";
import CryptoCheck from "./components/CryptoCheck";
import IC3Report from "./components/IC3Report";
import PricingPlans from "./components/PricingPlans";
import SeniorMode from "./components/SeniorMode";
import InsuranceCheck from "./components/InsuranceCheck";
import MedicalCheck from "./components/MedicalCheck";
import CharityCheck from "./components/CharityCheck";
import TaxScamCheck from "./components/TaxScamCheck";
import USAFlagIcon from "./components/USAFlagIcon";

function App() {

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
          Check messages, links, phone numbers and more before you trust a
          stranger, then save the evidence and report it.
        </p>
      </header>

      <SeniorMode />
      <Dashboard />
      <InvestigateMessage />
      <LinkCheck />
      <QRCheck />
      <PhoneCheck />
      <EmailCheck />
      <PhotoCheck />
      <StrangerCheck />
      <TaskScamCheck />
      <CryptoCheck />
      <InsuranceCheck />
      <MedicalCheck />
      <CharityCheck />
      <TaxScamCheck />
      <Account />
      <DetectiveReport />
      <OperationsPanel />
      <IC3Report />
      <PricingPlans />
    </main>
  );
}

export default App;
