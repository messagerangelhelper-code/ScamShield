import { useCallback, useEffect, useState } from "react";
import { useAuth, currentToken } from "../utils/auth";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const BRAND = "ScamGuard Global";

const TOPICS = { tips: "Tips", spotted: "Scam I spotted", question: "Question", feedback: "App feedback" };

const RULES = [
  "Be kind. Many people here just lost money or trust.",
  "Never post your own card, bank, Social Security or password details.",
  "Never ask anyone to message you on WhatsApp, Telegram or by text.",
  "No offers to \"recover\" money. Real help comes from your bank, the FTC and IC3.gov, and it's free.",
  "To warn everyone about a scammer's number, website or wallet, share it from your Detective Report.",
];

function ago(iso) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  if (s < 604800) return `${Math.floor(s / 86400)} day${s < 172800 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await currentToken()}`, ...(options.headers || {}) },
  });
  let data = {};
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error(data.detail || "Something went wrong. Please try again.");
  return data;
}

function Author({ name, team }) {
  return (
    <span className="cm-author">
      {name}{team && <span className="cm-team">{BRAND} team</span>}
    </span>
  );
}

function Status({ item }) {
  if (item.needs_review) return <span className="cm-badge">Waiting for review</span>;
  if (item.hidden) return <span className="cm-badge">Hidden</span>;
  return null;
}

function CommunityRoom() {
  const { enabled, ready, user } = useAuth();
  const [me, setMe] = useState(undefined); // undefined = loading, null = not joined
  const [owner, setOwner] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);

  const [topic, setTopic] = useState("");
  const [posts, setPosts] = useState([]);
  const [more, setMore] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [thread, setThread] = useState(null);

  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ topic: "tips", title: "", body: "" });
  const [reply, setReply] = useState("");
  const [review, setReview] = useState(null);

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) { setMe(undefined); return undefined; }
    let cancelled = false;
    api("/api/community/me")
      .then((d) => { if (!cancelled) { setMe(d.member || null); setOwner(!!d.is_owner); setLoadError(""); } })
      .catch((e) => { if (!cancelled) { setMe(null); setLoadError(e.message); } });
    return () => { cancelled = true; };
  }, [user]);

  const loadPosts = useCallback(async (append = false, before = 0) => {
    try {
      const q = new URLSearchParams();
      if (topic) q.set("topic", topic);
      if (before) q.set("before", String(before));
      const d = await api(`/api/community/posts?${q}`);
      setPosts((old) => (append ? [...old, ...d.posts] : d.posts));
      setMore(d.more);
    } catch (e) {
      setError(e.message);
    }
  }, [topic]);

  useEffect(() => {
    if (me) loadPosts();
  }, [me, loadPosts]);

  const loadThread = useCallback(async (id) => {
    try {
      setThread(await api(`/api/community/posts/${id}`));
    } catch (e) {
      setError(e.message);
      setOpenId(null);
    }
  }, []);

  useEffect(() => {
    if (openId) { setThread(null); loadThread(openId); }
  }, [openId, loadThread]);

  if (!enabled) return null;

  function clearMessages() { setNote(""); setError(""); }

  async function run(fn) {
    clearMessages();
    setBusy(true);
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const join = (e) => {
    e.preventDefault();
    if (!agree) return setError("Please agree to the community rules first.");
    return run(async () => {
      const d = await api("/api/community/join", { method: "POST", body: JSON.stringify({ display_name: name }) });
      setMe(d.member);
    });
  };

  const submitPost = (e) => {
    e.preventDefault();
    return run(async () => {
      const d = await api("/api/community/posts", { method: "POST", body: JSON.stringify(draft) });
      setDraft({ topic: draft.topic, title: "", body: "" });
      setComposing(false);
      setNote(d.message);
      await loadPosts();
    });
  };

  const submitReply = (e) => {
    e.preventDefault();
    return run(async () => {
      const d = await api(`/api/community/posts/${openId}/replies`, { method: "POST", body: JSON.stringify({ body: reply }) });
      setReply("");
      setNote(d.message);
      await loadThread(openId);
    });
  };

  const act = (path, kind, id, value, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return undefined;
    return run(async () => {
      const d = await api(path, { method: "POST", body: JSON.stringify({ kind, id, value }) });
      setNote(d.message);
      if (path.endsWith("/delete") && kind === "post") { setOpenId(null); setThread(null); }
      else if (openId) await loadThread(openId);
      if (review) setReview(await api("/api/community/review"));
      await loadPosts();
    });
  };

  const openReview = () => run(async () => { setReview(await api("/api/community/review")); });

  function ItemActions({ kind, item }) {
    return (
      <div className="cm-actions">
        {!item.mine && !item.flagged && !owner && (
          <button type="button" className="link-btn" disabled={busy}
            onClick={() => act("/api/community/flag", kind, item.id, true, "Flag this for our team to review? Three flags hide it until we check it.")}>
            Flag
          </button>
        )}
        {item.flagged && <span className="cm-muted">Flagged</span>}
        {(item.mine || owner) && (
          <button type="button" className="link-btn" disabled={busy}
            onClick={() => act("/api/community/delete", kind, item.id, true, `Delete this ${kind}? This can't be undone.`)}>
            Delete
          </button>
        )}
        {owner && (
          <>
            <button type="button" className="link-btn" disabled={busy}
              onClick={() => act("/api/community/moderate", kind, item.id, !item.hidden)}>
              {item.hidden ? "Show" : "Hide"}
            </button>
            {!item.mine && !item.team && (
              <button type="button" className="link-btn" disabled={busy}
                onClick={() => act("/api/community/ban", kind, item.id, true, "Stop this member from posting and hide everything they posted?")}>
                Ban author
              </button>
            )}
            {item.flags > 0 && <span className="cm-muted">{item.flags} flag{item.flags === 1 ? "" : "s"}</span>}
          </>
        )}
      </div>
    );
  }

  let content;
  if (!ready) {
    content = <p className="subtext">Loading…</p>;
  } else if (!user) {
    content = (
      <>
        <p className="subtext">
          A private, members-only room to share tips, warn each other about scams you've spotted, ask questions and
          tell us how the app is working for you.
        </p>
        <a className="cm-cta" href="#account">Sign in or create a free account to join</a>
      </>
    );
  } else if (me === undefined) {
    content = <p className="subtext">Loading…</p>;
  } else if (loadError) {
    content = <p className="error">{loadError}</p>;
  } else if (!me) {
    content = (
      <form onSubmit={join} className="cm-form">
        <p className="subtext">Pick a display name. Other members see this name, never your email.</p>
        <h3 className="cm-rules-title">Community rules</h3>
        <ul className="cm-rules">{RULES.map((r) => <li key={r}>{r}</li>)}</ul>
        <label className="field-label" htmlFor="cm-name">Display name</label>
        <input id="cm-name" value={name} maxLength={24} placeholder="e.g. Careful Carol" onChange={(e) => setName(e.target.value)} />
        <label className="check-item">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>I'll follow the community rules.</span>
        </label>
        <button type="submit" disabled={busy || !name.trim()}>{busy ? "Joining..." : "Join the community"}</button>
      </form>
    );
  } else if (me.banned) {
    content = <p className="subtext">Your account can't post in the community. You can still use every tool in the app.</p>;
  } else if (review) {
    content = (
      <div className="cm-review">
        <button type="button" className="link-btn" onClick={() => setReview(null)}>← Back to the community</button>
        <h3>Waiting for review</h3>
        {review.posts.length + review.replies.length === 0 && <p className="subtext">Nothing to review right now.</p>}
        {[...review.posts.map((p) => ({ ...p, kind: "post" })), ...review.replies.map((r) => ({ ...r, kind: "reply" }))].map((it) => (
          <div key={`${it.kind}-${it.id}`} className="cm-card">
            <div className="cm-meta"><span>{it.kind === "post" ? "Post" : "Reply"} by <strong>{it.author}</strong> · {ago(it.created_at)}</span>
              {it.flags > 0 && <span className="cm-badge">{it.flags} flag{it.flags === 1 ? "" : "s"}</span>}</div>
            {it.title && <strong>{it.title}</strong>}
            <p className="cm-body">{it.body}</p>
            <div className="cm-actions">
              <button type="button" disabled={busy} onClick={() => act("/api/community/moderate", it.kind, it.id, false)}>Approve</button>
              <button type="button" className="link-btn" disabled={busy}
                onClick={() => act("/api/community/delete", it.kind, it.id, true, "Delete this for good?")}>Delete</button>
              <button type="button" className="link-btn" disabled={busy}
                onClick={() => act("/api/community/ban", it.kind, it.id, true, "Stop this member from posting and hide everything they posted?")}>Ban author</button>
            </div>
          </div>
        ))}
      </div>
    );
  } else if (openId) {
    content = (
      <div className="cm-thread">
        <button type="button" className="link-btn" onClick={() => { setOpenId(null); setThread(null); clearMessages(); }}>← All posts</button>
        {!thread ? <p className="subtext">Loading…</p> : (
          <>
            <article className="cm-card cm-main">
              <div className="cm-meta"><span className="cm-topic">{TOPICS[thread.post.topic]}</span><Status item={thread.post} /></div>
              <h3>{thread.post.title}</h3>
              <div className="cm-meta"><Author name={thread.post.author} team={thread.post.team} /><span>{ago(thread.post.created_at)}</span></div>
              <p className="cm-body">{thread.post.body}</p>
              <ItemActions kind="post" item={thread.post} />
            </article>
            <h4 className="cm-replies-title">{thread.replies.length} {thread.replies.length === 1 ? "reply" : "replies"}</h4>
            {thread.replies.map((r) => (
              <div key={r.id} className="cm-card cm-reply">
                <div className="cm-meta"><Author name={r.author} team={r.team} /><span>{ago(r.created_at)}</span><Status item={r} /></div>
                <p className="cm-body">{r.body}</p>
                <ItemActions kind="reply" item={r} />
              </div>
            ))}
            {!thread.post.hidden && (
              <form onSubmit={submitReply} className="cm-form">
                <label className="field-label" htmlFor="cm-reply">Your reply</label>
                <textarea id="cm-reply" rows={3} maxLength={1000} value={reply} onChange={(e) => setReply(e.target.value)} />
                <button type="submit" disabled={busy || reply.trim().length < 2}>{busy ? "Posting..." : "Reply"}</button>
              </form>
            )}
          </>
        )}
      </div>
    );
  } else {
    content = (
      <>
        <p className="subtext">Signed in as <strong>{me.display_name}</strong>. Links in posts are shown as plain text so no one can be tricked into tapping them.</p>
        <div className="cm-toolbar">
          {!composing && <button type="button" onClick={() => { clearMessages(); setComposing(true); }}>New post</button>}
          {owner && <button type="button" className="link-btn" onClick={openReview}>Review list</button>}
        </div>
        {composing && (
          <form onSubmit={submitPost} className="cm-form cm-card">
            <label className="field-label" htmlFor="cm-topic">Topic</label>
            <select id="cm-topic" value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })}>
              {Object.entries(TOPICS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label className="field-label" htmlFor="cm-title">Title</label>
            <input id="cm-title" maxLength={120} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <label className="field-label" htmlFor="cm-body">What do you want to share?</label>
            <textarea id="cm-body" rows={5} maxLength={2000} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            <p className="cm-muted">Don't include your own card, bank or Social Security numbers.</p>
            <div className="button-row">
              <button type="submit" disabled={busy || draft.title.trim().length < 3 || draft.body.trim().length < 10}>{busy ? "Posting..." : "Post"}</button>
              <button type="button" className="link-btn" onClick={() => setComposing(false)}>Cancel</button>
            </div>
          </form>
        )}
        <div className="tab-row cm-tabs" role="group" aria-label="Topics">
          {[["", "All"], ...Object.entries(TOPICS)].map(([k, v]) => (
            <button key={k || "all"} type="button" className={topic === k ? "tab-btn active" : "tab-btn"} aria-pressed={topic === k}
              onClick={() => setTopic(k)}>{v}</button>
          ))}
        </div>
        {posts.length === 0 ? (
          <p className="empty-case">No posts here yet. Be the first to share a tip.</p>
        ) : (
          <ul className="cm-list">
            {posts.map((p) => (
              <li key={p.id}>
                <button type="button" className="cm-card cm-item" onClick={() => { clearMessages(); setOpenId(p.id); }}>
                  <span className="cm-meta"><span className="cm-topic">{TOPICS[p.topic]}</span><Status item={p} /></span>
                  <strong className="cm-title">{p.title}</strong>
                  <span className="cm-preview">{p.preview}{p.preview.length >= 180 ? "…" : ""}</span>
                  <span className="cm-meta">
                    <Author name={p.author} team={p.team} />
                    <span>{ago(p.created_at)}</span>
                    <span>{p.replies} {p.replies === 1 ? "reply" : "replies"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {more && <button type="button" className="link-btn" onClick={() => loadPosts(true, posts[posts.length - 1].id)}>Show older posts</button>}
      </>
    );
  }

  return (
    <section className="link-check community-room" id="community">
      <h2>{BRAND} Community</h2>
      {note && <p className="cm-note" role="status">{note}</p>}
      {error && <p className="error">{error}</p>}
      {content}
    </section>
  );
}

export default CommunityRoom;
