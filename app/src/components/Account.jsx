import { useEffect, useState } from "react";
import { supabase, useAuth } from "../utils/auth";

const BRAND = "ScamShield";

function Account() {
  const { enabled, ready, user, recovering, setRecovering } = useAuth();
  const [mode, setMode] = useState("signin"); // signin | signup | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // A password-reset link lands here: jump to this box so the new-password form is easy to find.
  useEffect(() => {
    if (!recovering) return;
    const el = document.getElementById("account");
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
  }, [recovering]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (!enabled) return null; // network not switched on for this deployment yet

  async function submit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!email.trim()) return setError("Enter your email address.");
    if (mode !== "reset" && password.length < 8) return setError("Use a password with at least 8 characters.");
    setBusy(true);
    try {
      const redirect = window.location.origin + window.location.pathname;
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirect } });
        if (err) throw err;
        if (!data.session) setMessage("Almost done. Check your email and tap the link to confirm your account, then sign in here.");
      } else if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect });
        if (err) throw err;
        setMessage("If that email has an account, we've sent a link to set a new password.");
      }
      setPassword("");
    } catch (err) {
      const text = String(err?.message || "");
      if (/invalid login/i.test(text)) setError("That email and password don't match. Try again, or reset your password.");
      else if (/not confirmed/i.test(text)) setError("Confirm your email first. Check your inbox for the link we sent.");
      else if (/rate limit/i.test(text)) setError("Too many tries. Please wait a few minutes and try again.");
      else setError(text || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveNewPassword(e) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) return setError("Use a password with at least 8 characters.");
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (err) return setError(err.message);
    setRecovering(false);
    setNewPassword("");
    setMessage("Your new password is saved.");
  }

  return (
    <section className="link-check account-box" id="account"
      style={recovering ? { border: "3px solid #f2b705", background: "#fffbe8", borderRadius: 18, scrollMarginTop: 16 } : undefined}>
      {recovering && <p style={{ display: "inline-block", margin: "0 0 8px", background: "#f2b705", color: "#3a2a00", fontWeight: 900, borderRadius: 999, padding: "4px 12px" }}>👉 Set your new password here</p>}
      <h2>Your {BRAND} Account</h2>

      {!ready ? (
        <p className="subtext">Loading…</p>
      ) : recovering ? (
        <form onSubmit={saveNewPassword} className="account-form">
          <label className="field-label" htmlFor="acct-newpw">Choose a new password</label>
          <input id="acct-newpw" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <button type="submit" disabled={busy}>{busy ? "Saving..." : "Save new password"}</button>
        </form>
      ) : user ? (
        <div className="account-signed">
          <p>Signed in as <strong>{user.email}</strong>. You can share scam clues from your Detective Report with the {BRAND} network.</p>
          <button type="button" className="link-btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      ) : (
        <>
          <p className="subtext">
            A free account lets you share the scammer's phone numbers, websites, emails and wallets with
            the {BRAND} network, so everyone checking them gets warned. Your name and messages are never shared.
          </p>
          <div className="tab-row" role="group" aria-label="Account">
            <button type="button" className={mode === "signin" ? "tab-btn active" : "tab-btn"} aria-pressed={mode === "signin"} onClick={() => setMode("signin")}>Sign in</button>
            <button type="button" className={mode === "signup" ? "tab-btn active" : "tab-btn"} aria-pressed={mode === "signup"} onClick={() => setMode("signup")}>Create account</button>
          </div>
          <form onSubmit={submit} className="account-form">
            <label className="field-label" htmlFor="acct-email">Email</label>
            <input id="acct-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {mode !== "reset" && (
              <>
                <label className="field-label" htmlFor="acct-pw">Password</label>
                <input id="acct-pw" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
              </>
            )}
            <button type="submit" disabled={busy}>
              {busy ? "Please wait..." : mode === "signup" ? "Create free account" : mode === "signin" ? "Sign in" : "Send reset link"}
            </button>
            {mode === "signin" && <button type="button" className="link-btn" onClick={() => setMode("reset")}>Forgot your password?</button>}
            {mode === "reset" && <button type="button" className="link-btn" onClick={() => setMode("signin")}>Back to sign in</button>}
          </form>
        </>
      )}
      {message && <p className="subtext" role="status">{message}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

export default Account;
