// The Detective Report's "case file": every check the user runs is saved here
// on this device, so they can share one summary with family or the police.
import { useEffect, useState } from "react";

const KEY = "scamshield_casefile";
const MAX_ITEMS = 30;
const EVENT = "casefile-change";

function read() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (data && Array.isArray(data.items)) return data;
  } catch {
    /* storage blocked or empty */
  }
  return { title: "", items: [] };
}

let memory = read(); // still works for this visit if storage is blocked

function write(next) {
  memory = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

// verdict: "high" (warning signs), "caution" or "low" (nothing found)
export function addEvidence({ type, subject, verdict, reasons = [], details = "" }) {
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    type,
    subject: String(subject || "").slice(0, 200),
    verdict: verdict === "high" ? "high" : verdict === "low" ? "low" : "caution",
    reasons: reasons.filter(Boolean).map((r) => String(r).slice(0, 300)).slice(0, 8),
    details: String(details || "").slice(0, 200),
  };
  const cur = memory;
  write({ ...cur, items: [...cur.items, item].slice(-MAX_ITEMS) });
}

export function removeEvidence(id) {
  write({ ...memory, items: memory.items.filter((i) => i.id !== id) });
}

export function setCaseTitle(title) {
  write({ ...memory, title: String(title).slice(0, 120) });
}

export function clearCase() {
  write({ title: "", items: [] });
}

export function useCaseFile() {
  const [data, setData] = useState(memory);
  useEffect(() => {
    const update = () => setData(memory);
    window.addEventListener(EVENT, update);
    return () => window.removeEventListener(EVENT, update);
  }, []);
  return data;
}
