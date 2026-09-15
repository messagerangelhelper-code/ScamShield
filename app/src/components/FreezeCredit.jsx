import { useState } from "react";
import { Lock, Phone, ExternalLink, ShieldAlert } from "lucide-react";

const BUREAUS = [
  {
    name: "Equifax",
    freezeUrl: "https://my.equifax.com/consumer-registration/UCSC/#/personal-info",
    phone: "1-800-685-1111",
  },
  {
    name: "Experian",
    freezeUrl: "https://www.experian.com/freeze/center.html",
    phone: "1-888-397-3742",
  },
  {
    name: "TransUnion",
    freezeUrl: "https://www.transunion.com/credit-freeze",
    phone: "1-888-909-8872",
  },
];

export default function FreezeCredit() {
  const [expanded, setExpanded] = useState(null);

  return (
    <div className="rounded-2xl p-5 space-y-4 bg-neutral-900 border border-neutral-800">
      <div className="flex items-center gap-2">
        <ShieldAlert className="text-red-400" size={20} />
        <h2 className="text-lg font-semibold text-white">Freeze My Credit</h2>
      </div>
      <p className="text-sm text-neutral-400">
        A credit freeze stops anyone — including scammers — from opening new
        accounts in your name. You need to freeze with{" "}
        <span className="text-white font-medium">all three bureaus</span> for
        full protection. It's free and doesn't hurt your credit score.
      </p>

      <div className="space-y-3">
        {BUREAUS.map((b) => (
          <div key={b.name} className="rounded-xl bg-neutral-800 p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-white">{b.name}</span>
              <button
                onClick={() => setExpanded(expanded === b.name ? null : b.name)}
                className="text-xs text-neutral-400 underline"
              >
                {expanded === b.name ? "Hide options" : "How to freeze"}
              </button>
            </div>
            {expanded === b.name && (
              <div className="mt-3 space-y-2">
                <a
                  href={b.freezeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300"
                >
                  <ExternalLink size={14} /> Freeze online at {b.name}.com
                </a>
                <a
                  href={`tel:${b.phone.replace(/\D/g, "")}`}
                  className="flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300"
                >
                  <Phone size={14} /> Call {b.phone}
                </a>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-neutral-800/60 p-4 flex gap-2">
        <Lock size={16} className="text-neutral-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-neutral-400 leading-relaxed">
          Keep the PIN or password each bureau gives you — you'll need it to
          lift the freeze later when you actually apply for credit.
        </p>
      </div>
    </div>
  );
}
