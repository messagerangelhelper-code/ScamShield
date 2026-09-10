import { useState, useEffect } from "react";

function Dashboard() {
  const [stats, setStats] = useState({
    checksRun: 0,
    scamsFlagged: 0,
  });

  useEffect(() => {
    // Reads from localStorage for now — swap for a real API call
    // once the backend has a /api/stats endpoint.
    const saved = JSON.parse(localStorage.getItem("scamshield_stats")) || {
      checksRun: 0,
      scamsFlagged: 0,
    };
    setStats(saved);
  }, []);

  return (
    <section className="dashboard">
      <h2>Your Protection Dashboard</h2>
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-number">{stats.checksRun}</span>
          <span className="stat-label">Checks Run</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{stats.scamsFlagged}</span>
          <span className="stat-label">Scams Flagged</span>
        </div>
      </div>
    </section>
  );
}

export default Dashboard;
