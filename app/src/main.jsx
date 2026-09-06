import React from "react";
import ReactDOM from "react-dom/client";

function App() {
  return (
    <div>
      <h1>ScamShield</h1>
      <p>Scam detection and victim protection.</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
