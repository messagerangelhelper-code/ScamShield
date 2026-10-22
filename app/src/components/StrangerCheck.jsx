import { useState } from "react";
import { addEvidence } from "../utils/caseFile";

const CHECKLISTS = {
  dating: {
    tab: "Dating or new friend",
    intro: "Met someone online who seems great? Check off anything that's true.",
    items: [
      "You've never seen them on a live video call, or they always have an excuse",
      "They wanted to move the chat to WhatsApp, Telegram or another app quickly",
      "They said \"I love you\" or talked about a future together very fast",
      "They live or work far away (overseas, on an oil rig, in the military, a doctor abroad)",
      "They asked for money, gift cards or crypto, even a small amount or a \"fee\"",
      "They brought up an investment or crypto trading opportunity",
      "They asked you to keep your relationship secret from friends or family",
    ],
    next: [
      "Never send money, gift cards or crypto to someone you haven't met in person.",
      "Ask for a live video call. A real person will agree.",
      "Run their photos through Check a Photo above.",
      "Meeting in person? Pick a public place, tell a friend, and check the public safety registry first.",
    ],
    links: [
      { label: "Learn about romance scams (FTC)", href: "https://consumer.ftc.gov/articles/what-know-about-romance-scams" },
      { label: "National Sex Offender Public Website", href: "https://www.nsopw.gov/" },
    ],
  },
  rental: {
    tab: "Rental or Marketplace",
    intro: "Renting a place or buying from a stranger? Check off anything that's true.",
    items: [
      "The price is much lower than similar places or items",
      "The owner or seller is \"out of the country\" or can't meet in person",
      "They want a deposit or payment before you see the place or item",
      "They want Zelle, a wire transfer, gift cards, crypto or a \"friends and family\" payment",
      "They asked you to read back a code they texted you",
      "They're rushing you: \"other people are interested, decide today\"",
      "They sent too much money and asked you to send the difference back",
    ],
    next: [
      "Never pay before you've seen the place or item in person.",
      "Never read a texted code to anyone. It's used to take over your accounts.",
      "Look up the address online. If it's listed for sale or rent elsewhere, it's likely a copied listing.",
      "Pay through the platform's own checkout, never by wire, Zelle or gift card.",
    ],
    links: [
      { label: "Learn about rental scams (FTC)", href: "https://consumer.ftc.gov/articles/rental-listing-scams" },
      { label: "Report it (FTC)", href: "https://reportfraud.ftc.gov/" },
    ],
  },
  job: {
    tab: "Job offer",
    intro: "Got a job offer from someone you don't know? Check off anything that's true.",
    items: [
      "You were hired without a real interview, or the interview was only by text or chat",
      "The recruiter emails from Gmail, Yahoo or another free email account",
      "They sent you a check to buy equipment or supplies",
      "They want you to pay for training, equipment or a background check",
      "They asked for your Social Security or bank details before a written offer",
      "The pay is very high for easy work (reshipping packages, \"processing payments\", liking videos)",
      "They want you to start right away and keep it quiet",
    ],
    next: [
      "Real employers never ask you to pay to get a job.",
      "Never deposit a check and send money back. The check will bounce and you'll owe the bank.",
      "Look up the company yourself and call its main number to confirm the job is real.",
      "Use Check an Email Sender above on the recruiter's address.",
    ],
    links: [
      { label: "Learn about job scams (FTC)", href: "https://consumer.ftc.gov/all-scams/job-scams" },
      { label: "Report it (FTC)", href: "https://reportfraud.ftc.gov/" },
    ],
  },
};

function StrangerCheck() {
  const [kind, setKind] = useState("dating");
  const [ticked, setTicked] = useState({});
  const [saved, setSaved] = useState("");
  const list = CHECKLISTS[kind];
  const marks = ticked[kind] || [];
  const count = marks.length;

  function saveToReport() {
    addEvidence({
      type: `Checklist: ${list.tab}`,
      subject: `${count} of ${list.items.length} red flags`,
      verdict: risk === "medium" ? "caution" : risk,
      reasons: marks.slice().sort((a, b) => a - b).map((i) => list.items[i]),
    });
    setSaved(kind);
  }

  function toggle(i) {
    setSaved("");
    setTicked((t) => {
      const cur = t[kind] || [];
      return { ...t, [kind]: cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i] };
    });
  }

  let risk = "low";
  let title = "No red flags checked so far";
  let body = "Keep going slowly. Scammers often build trust for weeks before they ask for anything.";
  if (count >= 2) {
    risk = "high";
    title = `⚠️ ${count} red flags: this looks like a scam`;
    body = "Stop before you send money or personal details. Talk to someone you trust first.";
  } else if (count === 1) {
    risk = "medium";
    title = "1 red flag: be careful";
    body = "One sign isn't proof, but slow down and check the steps below.";
  }

  return (
    <section className="link-check stranger-check">
      <h2>Before You Meet or Pay</h2>
      <p className="subtext">Pick what's happening, then check off anything that sounds familiar.</p>

      <div className="tab-row" role="group" aria-label="Choose a situation">
        {Object.entries(CHECKLISTS).map(([id, c]) => (
          <button
            key={id}
            type="button"
            className={id === kind ? "tab-btn active" : "tab-btn"}
            aria-pressed={id === kind}
            onClick={() => setKind(id)}
          >
            {c.tab}
          </button>
        ))}
      </div>

      <p className="subtext">{list.intro}</p>
      <div className="check-list">
        {list.items.map((item, i) => (
          <label key={item} className="check-item">
            <input type="checkbox" checked={marks.includes(i)} onChange={() => toggle(i)} />
            <span>{item}</span>
          </label>
        ))}
      </div>

      <div className={`result risk-${risk}`} role="status">
        <h3>{title}</h3>
        <p>{body}</p>
        <ul>{list.next.map((n) => <li key={n}>{n}</li>)}</ul>
      </div>
      <button type="button" onClick={saveToReport} disabled={saved === kind}>
        {saved === kind ? "Added to your Detective Report" : "Add to my Detective Report"}
      </button>

      <div className="button-row">
        {list.links.map((l) => (
          <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">
            <button type="button">{l.label}</button>
          </a>
        ))}
      </div>
    </section>
  );
}

export default StrangerCheck;
