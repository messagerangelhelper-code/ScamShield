// Search bar under the header: type what you need ("phone", "freeze", "breach") and jump straight to that tool.
// It reads the tool titles from the page itself, so new tools show up here automatically.
import { useEffect, useRef, useState } from "react";

// Extra words people might type for each tool (matched against the tool's title).
const ALSO = [
  [/message or listing/i, "text sms marketplace facebook listing ad"],
  [/whole message/i, "text sms screenshot email message letter"],
  [/link/i, "url website web address click"],
  [/qr/i, "qr code scan parking"],
  [/phone/i, "call number caller robocall text"],
  [/email sender/i, "email address sender inbox"],
  [/photo/i, "picture image profile catfish"],
  [/meet or pay/i, "stranger date romance seller buyer"],
  [/job or task/i, "work from home task employment hiring"],
  [/crypto/i, "bitcoin wallet usdt coin"],
  [/insurance/i, "agent policy"],
  [/medical/i, "health medicare doctor pills"],
  [/charity/i, "donate donation nonprofit"],
  [/irs/i, "tax taxes refund government"],
  [/data exposure/i, "breach leak hacked password people search opt out privacy identity"],
  [/dashboard/i, "freeze credit bureau equifax experian transunion stats"],
  [/account/i, "sign in login password reset"],
  [/detective/i, "report case evidence pdf print police"],
  [/law enforcement|fraud reporting/i, "report police ftc fbi ic3"],
  [/community/i, "forum chat group"],
  [/plans|premium/i, "upgrade price subscribe all access buy"],
  [/simple mode/i, "senior large text trusted contact family"],
];

function collect() {
  const out = [];
  document.querySelectorAll("main section").forEach((sec) => {
    if (sec.closest(".formal-report")) return;
    const h = sec.querySelector("h2");
    if (!h || h.closest(".formal-report")) return;
    const title = h.textContent.trim();
    if (!title || /owner view|testing tools/i.test(title)) return;
    const extra = ALSO.filter(([re]) => re.test(title)).map(([, w]) => w).join(" ");
    const sub = sec.querySelector(".subtext, p");
    out.push({ title, el: sec, words: `${title} ${extra} ${sub ? sub.textContent : ""}`.toLowerCase() });
  });
  return out;
}

function rank(list, q) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return list;
  return list
    .map((t) => {
      const title = t.title.toLowerCase();
      let score = 0;
      for (const w of terms) {
        if (title.includes(w)) score += 3;
        else if (t.words.includes(w)) score += 1;
        else return null;
      }
      return { ...t, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

const CSS = `
header { margin-bottom: 0 !important; border-bottom: none !important; }
.hs-bar { position: sticky; top: 0; z-index: 50; background: #0f2557; border-bottom: 2px solid #b31942; padding: 10px 20px 12px; margin-bottom: 24px; }
.hs-wrap { position: relative; }
.hs-wrap input { width: 100%; font-size: 16px; padding: 12px 14px; border-radius: 10px; border: 2px solid #3c6fd1; background: #0d1b3d; color: #ffffff; }
.hs-wrap input::placeholder { color: #9aa5b8; }
.hs-list { position: absolute; left: 0; right: 0; top: calc(100% + 6px); background: #0d1b3d; border: 2px solid #3c6fd1; border-radius: 10px; margin: 0; padding: 6px; list-style: none; max-height: 60vh; overflow-y: auto; box-shadow: 0 10px 30px rgba(0,0,0,.5); }
.hs-list button { display: block; width: 100%; text-align: left; background: transparent; color: #ffffff; font-size: 16px; font-weight: 600; padding: 12px 10px; border-radius: 8px; }
.hs-list button:hover, .hs-list button.hs-on { background: #1e3358; }
.hs-none { color: #9aa5b8; padding: 10px; }
main section { scroll-margin-top: 90px; }
.hs-flash { animation: hsflash 1.6s ease-out; }
@keyframes hsflash { 0% { box-shadow: 0 0 0 4px #f2b33d; } 100% { box-shadow: 0 0 0 0 transparent; } }
`;

export default function HeaderSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [tools, setTools] = useState([]);
  const [on, setOn] = useState(0);
  const box = useRef(null);

  useEffect(() => {
    function away(e) { if (box.current && !box.current.contains(e.target)) setOpen(false); }
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);

  const results = rank(tools, q);

  function go(t) {
    setOpen(false);
    setQ("");
    t.el.scrollIntoView({ behavior: "smooth", block: "start" });
    t.el.classList.remove("hs-flash");
    void t.el.offsetWidth;
    t.el.classList.add("hs-flash");
    const field = t.el.querySelector("input:not([type=checkbox]), textarea");
    if (field) setTimeout(() => field.focus({ preventScroll: true }), 600);
  }

  function keys(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOn((n) => Math.min(n + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setOn((n) => Math.max(n - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[on]) go(results[on]); }
    else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div className="hs-bar">
      <style>{CSS}</style>
      <div className="hs-wrap" ref={box}>
        <input
          type="search"
          aria-label="Find a tool"
          placeholder="🔍 Find a tool: phone, link, breach, freeze..."
          value={q}
          onFocus={() => { setTools(collect()); setOpen(true); }}
          onChange={(e) => { setQ(e.target.value); setOn(0); setOpen(true); }}
          onKeyDown={keys}
        />
        {open && (
          <ul className="hs-list" role="listbox">
            {results.length === 0 ? (
              <li className="hs-none">No tool matches "{q}". Try another word.</li>
            ) : (
              results.map((t, i) => (
                <li key={t.title}>
                  <button type="button" className={i === on ? "hs-on" : ""} onClick={() => go(t)}>{t.title}</button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
