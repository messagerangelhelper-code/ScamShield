"""
ScamShield email forwarding inbox.

People forward a suspicious email to your ScamShield Gmail address. This
script reads new messages over IMAP, runs the same full investigation the app
uses (every phone number, link, email address and crypto wallet in it), and
emails the verdict back to whoever forwarded it.

Runs on Render as a Cron Job every few minutes:
    python inbox_worker.py --once

Settings (Render > the cron job > Environment), all using a Gmail account you
own and an app password (no third-party service, nothing else to sign up for):
    INBOX_EMAIL          the Gmail address people forward to
    INBOX_APP_PASSWORD   that Gmail account's 16-character app password
    INBOX_BRAND          name used in replies (default "ScamShield")
    INBOX_APP_URL        link to the app in replies (default cashcowai.online)
    INBOX_MONTHLY_LIMIT  free checks per sender per month (default 3, same as the app)
"""

import asyncio
import email
import imaplib
import logging
import os
import re
import smtplib
import sys
from datetime import date
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, parseaddr

from main import investigate_text

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("inbox")

INBOX_EMAIL = (os.getenv("INBOX_EMAIL") or "").strip()
INBOX_APP_PASSWORD = (os.getenv("INBOX_APP_PASSWORD") or "").replace(" ", "").strip()
BRAND = (os.getenv("INBOX_BRAND") or "ScamShield").strip()
APP_URL = (os.getenv("INBOX_APP_URL") or "https://cashcowai.online").strip()
MONTHLY_LIMIT = int(os.getenv("INBOX_MONTHLY_LIMIT") or "3")
MAX_PER_RUN = 25

FORWARD_MARKERS = re.compile(
    r"(-{2,}\s*Forwarded message\s*-{2,}|Begin forwarded message:|-{2,}\s*Original Message\s*-{2,}|^From:\s.+$)",
    re.I | re.M,
)
FWD_FROM_RE = re.compile(r"^\s*>?\s*From:\s*(.+)$", re.I | re.M)
SKIP_SENDERS = re.compile(r"(mailer-daemon|postmaster|no-?reply|do-?not-?reply|notifications?@)", re.I)

VERDICT_TITLE = {
    "high": "WARNING: This looks like a scam",
    "caution": "Be careful: some things need a closer look",
    "low": "No warning signs found",
}
FINDING_LABEL = {"high": "Warning signs", "caution": "Be careful", "low": "Looks OK"}


def html_to_text(html: str) -> str:
    html = re.sub(r"(?is)<(script|style).*?</\1>", " ", html)
    html = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>|</li>", "\n", html)
    html = re.sub(r"<[^>]+>", " ", html)
    for a, b in (("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&#39;", "'")):
        html = html.replace(a, b)
    return re.sub(r"[ \t]+", " ", html)


def body_text(msg) -> str:
    """Plain text of an email (prefers text/plain, falls back to stripped HTML)."""
    plain, html = [], []
    for part in msg.walk() if msg.is_multipart() else [msg]:
        if part.get_content_maintype() == "multipart" or part.get_filename():
            continue
        ctype = part.get_content_type()
        if ctype not in ("text/plain", "text/html"):
            continue
        try:
            payload = part.get_payload(decode=True) or b""
            text = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
        except Exception:
            continue
        (plain if ctype == "text/plain" else html).append(text)
    if plain:
        return "\n".join(plain)
    return html_to_text("\n".join(html))


def original_message(msg):
    """
    Works out what was forwarded and who originally sent it.
    Handles "forward as attachment" (.eml inside) and normal inline forwards.
    Returns (text, original_sender).
    """
    for part in msg.walk():
        if part.get_content_type() == "message/rfc822":
            inner = part.get_payload(0) if part.is_multipart() else email.message_from_bytes(part.get_payload(decode=True) or b"")
            sender = parseaddr(inner.get("From", ""))[1]
            subject = inner.get("Subject", "")
            return f"Subject: {subject}\n{body_text(inner)}", sender

    text = body_text(msg)
    sender = ""
    marker = FORWARD_MARKERS.search(text)
    if marker:
        tail = text[marker.start():]
        m = FWD_FROM_RE.search(tail)
        if m:
            sender = parseaddr(m.group(1).strip())[1]
            if not sender:
                found = re.search(r"[\w.+-]+@[\w.-]+\.\w+", m.group(1))
                sender = found.group(0) if found else ""
        # Drop the forwarded header lines (From/Date/To/Subject) from what gets analyzed.
        text = "\n".join(
            ln for ln in tail.splitlines()
            if not re.match(r"^\s*>?\s*(from|sent|date|to|cc|subject):", ln, re.I)
            and not FORWARD_MARKERS.fullmatch(ln.strip())
        ).strip()
    subject = re.sub(r"^\s*(fwd?|fw)\s*:\s*", "", msg.get("Subject", ""), flags=re.I)
    return f"Subject: {subject}\n{text}", sender


def defang(s: str) -> str:
    """Stops email programs from turning scam links into clickable links."""
    s = re.sub(r"(?i)\bhttps?://", lambda m: m.group(0).lower().replace("http", "hxxp"), s)
    s = re.sub(r"(?i)\bwww\.", "www[.]", s)
    return re.sub(r"(?i)\.(com|net|org|info|biz|us|co|io|xyz|top|click|link|online|site|shop|store|live|app|vip|icu|support|help|me|ly)\b", r"[.]\1", s)


def build_reply(result: dict, original_sender: str) -> str:
    lines = [
        VERDICT_TITLE.get(result["verdict"], VERDICT_TITLE["caution"]),
        "",
        result["summary"],
        "",
    ]
    if original_sender:
        lines += [f"Original sender: {defang(original_sender)}", ""]
    lines.append("WHAT WE CHECKED")
    for n, f in enumerate(result["findings"], 1):
        lines.append(f"{n}. {f['type']}: {defang(f['subject'])}  [{FINDING_LABEL.get(f['verdict'], '')}]")
        if f.get("details"):
            lines.append(f"   {defang(f['details'])}")
        for r in f.get("reasons", [])[:4]:
            lines.append(f"   - {defang(r)}")
    lines += [
        "",
        "WHAT TO DO",
        "- Don't click links, open attachments, reply or call numbers in the original message.",
        "- Contact the company using its official website or the number on your card or bill.",
        "- Report scams at reportfraud.ftc.gov. If you lost money, also report at ic3.gov.",
        "",
        f"Check more links, numbers, emails and photos in the {BRAND} app: {APP_URL}",
        f"This is an automatic reply from {BRAND}. Links and email addresses above were",
        "made unclickable on purpose so you can't open them by accident.",
    ]
    return "\n".join(lines)


def send_reply(to_addr: str, orig, text: str, subject_prefix: str = "Scam check"):
    reply = EmailMessage()
    subject = orig.get("Subject", "") or "your message"
    reply["Subject"] = f"{subject_prefix}: {subject}"[:200]
    reply["From"] = formataddr((BRAND, INBOX_EMAIL))
    reply["To"] = to_addr
    reply["Message-ID"] = make_msgid()
    reply["Auto-Submitted"] = "auto-replied"
    if orig.get("Message-ID"):
        reply["In-Reply-To"] = orig["Message-ID"]
        reply["References"] = orig["Message-ID"]
    reply.set_content(text)
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=20) as smtp:
        smtp.login(INBOX_EMAIL, INBOX_APP_PASSWORD)
        smtp.send_message(reply)


def should_skip(msg, from_addr: str) -> str:
    if not from_addr or from_addr.lower() == INBOX_EMAIL.lower():
        return "no sender or our own address"
    if SKIP_SENDERS.search(from_addr):
        return "automated sender"
    if (msg.get("Auto-Submitted", "no").lower() != "no") or msg.get("X-Autoreply") or msg.get("X-Autorespond"):
        return "auto-reply"
    if (msg.get("Precedence", "").lower() in ("bulk", "list", "junk")) or msg.get("List-Id"):
        return "mailing list"
    return ""


def checks_this_month(imap, from_addr: str) -> int:
    since = date.today().replace(day=1).strftime("%d-%b-%Y")
    safe = from_addr.replace('"', "")
    status, data = imap.search(None, "SEEN", "SINCE", since, "FROM", f'"{safe}"')
    return len(data[0].split()) if status == "OK" and data and data[0] else 0


def process_inbox() -> int:
    if not INBOX_EMAIL or not INBOX_APP_PASSWORD:
        log.error("INBOX_EMAIL and INBOX_APP_PASSWORD must be set.")
        return 0
    handled = 0
    imap = imaplib.IMAP4_SSL("imap.gmail.com", 993)
    try:
        imap.login(INBOX_EMAIL, INBOX_APP_PASSWORD)
        imap.select("INBOX")
        status, data = imap.search(None, "UNSEEN")
        ids = data[0].split()[:MAX_PER_RUN] if status == "OK" and data and data[0] else []
        log.info("New messages: %d", len(ids))
        for mid in ids:
            status, parts = imap.fetch(mid, "(BODY.PEEK[])")
            if status != "OK" or not parts or not isinstance(parts[0], tuple):
                continue
            msg = email.message_from_bytes(parts[0][1])
            from_addr = parseaddr(msg.get("Reply-To") or msg.get("From", ""))[1]
            reason = should_skip(msg, from_addr)
            used = checks_this_month(imap, from_addr) if not reason else 0
            if not reason and used >= MONTHLY_LIMIT:
                # Tell them once per month; after that, skip quietly.
                if used == MONTHLY_LIMIT:
                    try:
                        send_reply(from_addr, msg,
                                   f"You've used your {MONTHLY_LIMIT} free email checks this month. "
                                   f"They refresh on the 1st.\n\n"
                                   f"Want unlimited checks? Upgrade to {BRAND} Premium: {APP_URL}\n\n"
                                   f"Until then: don't click links, reply or pay. Contact the company "
                                   f"through its official website or the number on your card or bill.",
                                   subject_prefix="Free checks used up")
                    except Exception as e:
                        log.warning("Limit reply failed: %s", type(e).__name__)
                reason = "monthly limit"
            if reason:
                log.info("Skipped one message (%s)", reason)
                imap.store(mid, "+FLAGS", "\\Seen")
                continue
            try:
                text, original_sender = original_message(msg)
                result = asyncio.run(investigate_text(text, original_sender))
                send_reply(from_addr, msg, build_reply(result, original_sender))
                imap.store(mid, "+FLAGS", "\\Seen")
                handled += 1
                log.info("Answered one message: verdict=%s, findings=%d", result["verdict"], len(result["findings"]))
            except Exception as e:
                # First failure: flag it and leave it unread so the next run retries.
                # Second failure: mark it read so it can't get stuck forever.
                log.exception("Failed to handle a message: %s", type(e).__name__)
                st, fl = imap.fetch(mid, "(FLAGS)")
                flags = b" ".join(x if isinstance(x, bytes) else b"" for x in (fl or []))
                imap.store(mid, "+FLAGS", "\\Seen" if b"\\Flagged" in flags else "\\Flagged")
    finally:
        try:
            imap.logout()
        except Exception:
            pass
    return handled


if __name__ == "__main__":
    if "--once" in sys.argv:
        process_inbox()
    else:
        print("Usage: python inbox_worker.py --once")
