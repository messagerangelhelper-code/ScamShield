// The Detective Report's "case file": every check the user runs is saved here
// on this device, so they can share one summary with family, a bank or police.
import { useEffect, useState } from "react";

const KEY = "scamshield_casefile";
const PREFIX = "SS";
const MAX_ITEMS = 30;
const EVENT = "casefile-change";

function newCaseId() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${PREFIX}-${ymd}-${rand}`;
}

function blankCase() {
  return { caseId: "", openedAt: "", title: "", preparedBy: "", items: [] };
}

function read() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (data && Array.isArray(data.items)) return { ...blankCase(), ...data };
  } catch {
    /* storage blocked or empty */
  }
  return blankCase();
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

// Gives the case a report number the first time anything is saved to it.
function opened(cur) {
  if (cur.caseId) return cur;
  const firstAt = cur.items[0]?.at || new Date().toISOString();
  return { ...cur, caseId: newCaseId(), openedAt: firstAt };
}

// verdict: "high" (warning signs), "caution" or "low" (nothing found)
export function addEvidence({ type, subject, verdict, reasons = [], details = "" }) {
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    type,
    subject: String(subject || "").slice(0, 2000), // full message text is kept for the report
    verdict: verdict === "high" ? "high" : verdict === "low" ? "low" : "caution",
    reasons: reasons.filter(Boolean).map((r) => String(r).slice(0, 300)).slice(0, 8),
    details: String(details || "").slice(0, 200),
  };
  const cur = opened(memory);
  write({ ...cur, items: [...cur.items, item].slice(-MAX_ITEMS) });
}

export function removeEvidence(id) {
  write({ ...memory, items: memory.items.filter((i) => i.id !== id) });
}

export function setCaseTitle(title) {
  write({ ...memory, title: String(title).slice(0, 120) });
}

export function setPreparedBy(name) {
  write({ ...memory, preparedBy: String(name).slice(0, 80) });
}

export function clearCase() {
  write(blankCase());
}

export function useCaseFile() {
  const [data, setData] = useState(memory);
  useEffect(() => {
    const update = () => setData(memory);
    window.addEventListener(EVENT, update);
    // Older saved cases (from before report numbers) get one now.
    if (memory.items.length && !memory.caseId) write(opened(memory));
    return () => window.removeEventListener(EVENT, update);
  }, []);
  return data;
}
