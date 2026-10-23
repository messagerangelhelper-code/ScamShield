import { useState, useEffect } from "react";
import FreezeCredit from "./FreezeCredit";
import { getStats } from "../utils/usageTracker";

function Dashboard() {
  const [stats, setStats] = useState(getStats);

  useEffect(() => {
    const update = () => setStats(getStats());
    window.addEventListener("stats-change", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("stats-change", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  return (
    <section className="dashboard">
      <h2>Your Protection Dashboard</h2>
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-number">{stats.checksRun}</span>
          <span className="stat-label">Checks run</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{stats.scamsFlagged}</span>
          <span className="stat-label">Warnings found</span>
        </div>
      </div>

      <div className="dashboard-actions">
        <FreezeCredit />
      </div>
    </section>
  );
}

export default Dashboard;
