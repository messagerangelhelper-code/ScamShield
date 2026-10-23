import { useEffect, useState } from "react";
import { useAuth, currentToken } from "../utils/auth";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const KIND_LABEL = {
  phone: "Phone", domain: "Website", url: "Link", email: "Email", wallet: "Crypto wallet",
  telegram: "Telegram", cashtag: "Cash App",
};

function day(iso) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
}

function evidenceText(op) {
  const lines = [
    `SCAM OPERATION #${op.operation_id}`,
    op.summary,
    `Scam type: ${(op.categories || []).join(", ") || "Unknown"}`,
    `Reports: ${op.reports}   People reporting: ${op.reporters}   States: ${op.states}`,
    `First seen: ${day(op.first_seen)}   Last seen: ${day(op.last_seen)}`,
    "",
    "LINKED CLUES",
    ...(op.members || []).map((m) => `- ${KIND_LABEL[m.kind] || m.kind}: ${m.value} (reported by ${m.reporters})`),
  ];
  return lines.join("\n");
}

// Owner-only view of the operations the connection engine has found.
// The server decides who's allowed; for everyone else this shows nothing.
function OperationsPanel() {
  const { user } = useAuth();
  const [ops, setOps] = useState(null);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    if (!user) { setOps(null); return undefined; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/network/operations`, {
          headers: { Authorization: `Bearer ${await currentToken()}` },
        });
        if (!res.ok) { if (!cancelled) setOps(null); return; }
        const data = await res.json();
        if (!cancelled) setOps(data.operations || []);
      } catch {
        if (!cancelled) setOps(null);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!ops) return null;

  async function copy(op) {
    try {
      await navigator.clipboard.writeText(evidenceText(op));
      setCopied(op.operation_id);
    } catch {
      setCopied(null);
    }
  }

  return (
    <section className="link-check ops-panel">
      <h2>Scam Operations (owner view)</h2>
      <p className="subtext">
        Clues that were reported together are linked into operations. The biggest ones are listed first.
        Only owner accounts can see this.
      </p>
      {ops.length === 0 ? (
        <p className="empty-case">No operations yet. They appear once two or more clues are reported together.</p>
      ) : (
        <ol className="ops-list">
          {ops.map((op) => (
            <li key={op.operation_id} className="op-card">
              <div className="op-head">
                <strong>Operation #{op.operation_id}</strong>
                <span>{(op.categories || []).join(", ")}</span>
              </div>
              <p>{op.summary}</p>
              <p className="subtext">First seen {day(op.first_seen)} · Last seen {day(op.last_seen)} · {op.reports} reports</p>
              <details>
                <summary>Linked clues ({(op.members || []).length})</summary>
                <ul>
                  {(op.members || []).map((m) => (
                    <li key={`${m.kind}-${m.value}`}><span className="op-kind">{KIND_LABEL[m.kind] || m.kind}</span> {m.value} <span className="op-count">×{m.reporters}</span></li>
                  ))}
                </ul>
              </details>
              <button type="button" onClick={() => copy(op)}>
                {copied === op.operation_id ? "Copied" : "Copy evidence summary"}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default OperationsPanel;
