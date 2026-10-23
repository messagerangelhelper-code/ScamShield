import { useState } from "react";
import { canRunCheck, recordCheck, remainingChecks } from "../utils/usageTracker";
import { addEvidence } from "../utils/caseFile";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// The task-job scam script, step by step. Users tick what has happened so far.
const STEPS = [
  {
    title: "A stranger offered you a job",
    detail: "By text, WhatsApp, Telegram or a job site. Remote work, flexible hours, good pay for easy tasks.",
    next: "They'll pass you to a second person, a \"trainer\" or \"manager,\" so it feels like a real company.",
  },
  {
    title: "You were handed to a \"trainer\" or \"manager\"",
    detail: "A second person took over to teach you the job.",
    next: "They'll log you into a work website, often using their own account, to show you the tasks.",
  },
  {
    title: "They trained you on a work website",
    detail: "Tasks like booking restaurant tables, rating hotels or products, liking videos or \"optimizing\" apps. You saw money going up.",
    next: "They'll send you an invite link or invitation code to make your own account.",
  },
  {
    title: "You got an invite link or invitation code",
    detail: "You made your own account on their website. You can't get in without an invite.",
    next: "You'll earn small amounts, and the first payouts may really arrive. That's to win your trust.",
  },
  {
    title: "You were paid a small amount",
    detail: "A first withdrawal worked, or your balance kept growing.",
    next: "A \"combination order,\" \"lucky order\" or \"premium task\" will push your account into a negative balance.",
  },
  {
    title: "Your account went negative, or you were asked to deposit",
    detail: "You must \"recharge,\" deposit or top up (usually in crypto) to continue or to withdraw.",
    next: "Each deposit leads to another, bigger one. Then come \"fees\" or \"taxes\" to withdraw. The money doesn't come back.",
  },
  {
    title: "They asked for fees or taxes to withdraw",
    detail: "Your money is \"frozen\" until you pay more.",
    next: "It won't end. Later, \"recovery\" services may contact you promising to get the money back. They're scammers too.",
  },
];

function TaskScamCheck() {
  const [done, setDone] = useState([]);
  const [link, setLink] = useState("");
  const [linkResult, setLinkResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const stage = done.length ? Math.max(...done) + 1 : 0; // furthest step reached (1-7)
  const current = stage ? STEPS[stage - 1] : null;
  const deposited = stage >= 6;

  function toggle(i) {
    setSaved(false);
    setDone((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]));
  }

  async function checkLink(e) {
    e.preventDefault();
    if (!link.trim()) return;
    if (!canRunCheck()) {
      setError("You've used all 3 free checks this month. Upgrade to Premium below for unlimited checks.");
      return;
    }
    setLoading(true);
    setError(null);
    setLinkResult(null);
    try {
      const url = link.trim();
      const res = await fetch(`${API_URL}/api/url-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [/^https?:\/\//i.test(url) ? url : `https://${url}`] }),
      });
      if (!res.ok) throw new Error("Couldn't check this link right now. Try again in a minute.");
      const data = await res.json();
      const reasons = [...(data.details?.heuristics?.reasons || [])];
      const age = data.details?.domain_age;
      if (age?.checked) reasons.push(`Website created ${age.age_days} days ago.`);
      const flagged = (data.flagged_urls || []).length > 0;
      setLinkResult({ flagged, reasons });
      recordCheck();
      addEvidence({
        type: "Work platform link",
        subject: url,
        verdict: flagged ? "high" : "caution",
        reasons,
        details: data.details?.hosting?.checked ? `Hosted in ${data.details.hosting.country}` : "",
      });
    } catch (err) {
      setError(err.message || "Couldn't check this link right now.");
    } finally {
      setLoading(false);
    }
  }

  function saveToReport() {
    addEvidence({
      type: "Checklist: Task job scam",
      subject: `Reached step ${stage} of ${STEPS.length}: ${current.title}`,
      verdict: stage >= 3 ? "high" : "caution",
      reasons: done.slice().sort((a, b) => a - b).map((i) => `Step ${i + 1}: ${STEPS[i].title}`),
    });
    setSaved(true);
  }

  return (
    <section className="link-check task-check">
      <h2>Job or Task Offer: Where Are You in the Script?</h2>
      <p className="subtext">
        Task-job scams follow the same script every time. Check off what has happened so far, and
        we'll show you where you are and what they'll do next.
      </p>

      <ol className="stage-list">
        {STEPS.map((s, i) => (
          <li key={s.title} className={done.includes(i) ? "stage done" : "stage"}>
            <label className="stage-label">
              <input type="checkbox" checked={done.includes(i)} onChange={() => toggle(i)} />
              <span>
                <strong>Step {i + 1}. {s.title}</strong>
                <span className="stage-detail">{s.detail}</span>
              </span>
            </label>
          </li>
        ))}
      </ol>

      {stage === 0 ? (
        <div className="result risk-low" role="status">
          <h3>Nothing checked yet</h3>
          <p>If a stranger offers you easy work online, come back here before you sign up for anything.</p>
        </div>
      ) : (
        <div className={`result risk-${stage >= 3 ? "high" : "medium"}`} role="status">
          <h3>{stage >= 3 ? "⚠️ " : ""}You're at step {stage} of {STEPS.length}: this is the task-job scam</h3>
          <p><strong>What they'll do next:</strong> {current.next}</p>
          {!deposited ? (
            <p><strong>Stop now.</strong> Don't create an account, don't deposit anything, and stop replying. A real job never asks you to pay to work or to withdraw your pay.</p>
          ) : (
            <p><strong>Don't deposit anything else</strong>, even to "unlock" a withdrawal. Use the guide below to save the evidence and report it.</p>
          )}
          <button type="button" onClick={saveToReport} disabled={saved}>
            {saved ? "Added to your Detective Report" : "Add to my Detective Report"}
          </button>
        </div>
      )}

      <form onSubmit={checkLink} className="task-link">
        <label className="field-label" htmlFor="task-link">Check their work website or invite link</label>
        <input
          id="task-link"
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="Paste the invite link or website address"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <button type="submit" disabled={loading}>{loading ? "Checking..." : "Check website"}</button>
        <p className="subtext">{remainingChecks()} free checks remaining. Don't open the link yourself to check it.</p>
      </form>
      {error && <p className="error">{error}</p>}
      {linkResult && (
        <div className={`result risk-${linkResult.flagged ? "high" : "medium"}`}>
          <h3>{linkResult.flagged ? "⚠️ This looks like a task-scam platform" : "Be careful with this website"}</h3>
          {linkResult.reasons.length > 0 && <ul>{linkResult.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
          <p className="subtext">Saved to your Detective Report.</p>
        </div>
      )}

      <details className="inside-guide" open={deposited}>
        <summary>Already inside or already paid? Read this first</summary>
        <ol>
          <li><strong>Stop depositing.</strong> No deposit, fee or "tax" will unlock your money. Don't deposit just to keep the act going.</li>
          <li>
            <strong>Screenshot the evidence</strong> before they delete your account:
            <ul>
              <li>The website address and your account page with its balance</li>
              <li>The deposit instructions, especially any <strong>crypto wallet addresses</strong></li>
              <li>The "customer service" chat and the task or order history</li>
              <li>The recruiter's and trainer's phone numbers, usernames and messages</li>
              <li>Your own payment receipts (bank, Zelle, Cash App or crypto exchange)</li>
            </ul>
          </li>
          <li><strong>Run the clues through Investigate a Whole Message</strong> above. Use Read a screenshot for the chats. Every wallet, link and number is saved to your Detective Report.</li>
          <li><strong>Report it</strong> at ic3.gov (include the wallet addresses, which can sometimes be traced) and reportfraud.ftc.gov. Tell your bank or exchange right away.</li>
          <li><strong>Watch for "recovery" offers.</strong> Anyone who contacts you promising to get your money back for a fee is part of the scam.</li>
        </ol>
        <div className="button-row">
          <a href="https://www.ic3.gov/" target="_blank" rel="noopener noreferrer"><button type="button">Report to the FBI (IC3)</button></a>
          <a href="https://reportfraud.ftc.gov/" target="_blank" rel="noopener noreferrer"><button type="button">Report to the FTC</button></a>
          <a href="https://consumer.ftc.gov/all-scams/job-scams" target="_blank" rel="noopener noreferrer"><button type="button">Learn about job scams</button></a>
        </div>
      </details>
    </section>
  );
}

export default TaskScamCheck;
