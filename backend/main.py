import os
from dotenv import load_dotenv
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import firebase_admin
from firebase_admin import credentials, firestore
load_dotenv()

app = FastAPI(title="ScamShield API")

# Allow the frontend dev server (and your deployed domain) to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "https://scamshield.global",
        "https://www.scamshield.global",
        "https://scamshield-app-x89o.onrender.com",
    ],
    # Sister apps hosted on Render: ScamGuard Global and MyBillPilot
    allow_origin_regex=r"https://(scamguard-global|mybillpilot)[a-z0-9-]*\.onrender\.com",
    allow_methods=["*"],
    allow_headers=["*"],
)


class CheckRequest(BaseModel):
    text: str


class CryptoCheckRequest(BaseModel):
    address: str
    chain: str = "ethereum"  # ethereum, bitcoin, bnb, tron


class DecoyCardRequest(BaseModel):
    reason: str = "prepaid_card_scam"  # what triggered the request, for your own logs


class URLCheckRequest(BaseModel):
    urls: list[str]


class PhoneCheckRequest(BaseModel):
    number: str
    claimed: str = ""  # who the caller says they are, e.g. "my bank", "IRS"


class EmailCheckRequest(BaseModel):
    email: str
    claimed: str = ""  # who the sender says they are, e.g. "PayPal"


class InvestigateRequest(BaseModel):
    text: str
    sender: str = ""  # who sent it: a phone number or email, if known


class TrustedContactRequest(BaseModel):
    device_id: str
    contact_name: str
    contact_phone: str
    codeword: str


PUBLICAML_URL = "https://intelapi.publicaml.org/v1/enrich"

# --- Google Safe Browsing config ---
# Free tier: 10,000 requests/day. Get a key at:
# https://console.cloud.google.com/apis/library/safebrowsing.googleapis.com
GOOGLE_SAFE_BROWSING_API_KEY = os.environ.get("GOOGLE_SAFE_BROWSING_API_KEY", "REPLACE_WITH_REAL_KEY")
SAFE_BROWSING_URL = "https://safebrowsing.googleapis.com/v4/threatMatches:find"

# --- VirusTotal config ---
# Free tier: 4 requests/minute. Get a key at: https://www.virustotal.com/gui/join-us
VIRUSTOTAL_API_KEY = os.environ.get("VIRUSTOTAL_API_KEY", "REPLACE_WITH_REAL_KEY")
VIRUSTOTAL_URL = "https://www.virustotal.com/api/v3/urls"

# --- URLhaus config ---
# Free, no API key required. Community-driven malicious URL database
# run by abuse.ch. Docs: https://urlhaus-api.abuse.ch/
URLHAUS_URL = "https://urlhaus-api.abuse.ch/v1/url/"

# --- Decoy card provider config ---
# The real key lives in a local .env file (never committed) or your
# hosting provider's environment variable settings — never in this file.
CARD_PROVIDER_API_KEY = os.environ.get("LITHIC_API_KEY", "REPLACE_WITH_REAL_KEY")
CARD_PROVIDER_BASE_URL = "https://sandbox.lithic.com/v1"  # sandbox until approved


# --- Heuristic scam patterns ---
# No paid API needed for this first layer — pure keyword/pattern scoring.
RED_FLAGS = {
    "urgency": {
        "phrases": ["act now", "urgent", "limited time", "today only", "immediately"],
        "weight": 15,
        "message": "Uses urgency to pressure quick action",
    },
    "off_platform": {
        "phrases": ["whatsapp", "telegram", "on signal", "wechat", "line app", "kik me",
                    "text me directly", "text me on", "call me instead", "email me at",
                    "add me on", "message me on", "chat with me on", "contact me on",
                    "let's talk on", "lets talk on", "my private number", "my personal number",
                    "wa.me/", "t.me/"],
        "weight": 15,
        "message": "Tries to move the conversation to WhatsApp, Telegram or another private app, where the original platform's scam filters can't see it",
    },
    "payment_method": {
        "phrases": ["wire transfer", "western union", "cash app", "zelle",
                    "crypto", "bitcoin", "usdt"],
        "weight": 25,
        "message": "Requests an untraceable or irreversible payment method",
    },
    "prepaid_card_request": {
        "phrases": ["gift card", "prepaid visa", "prepaid card", "vanilla visa",
                    "steam card", "put money on a card", "load a card",
                    "load money onto a card", "google play card", "itunes card"],
        "weight": 30,
        "message": "Asks you to load money onto a gift card or prepaid card — a major red flag",
    },
    "too_good": {
        "phrases": ["guaranteed profit", "no risk", "double your money",
                    "free money", "you've won"],
        "weight": 20,
        "message": "Promises unrealistic returns or guarantees",
    },
    "helper_offer": {
        "phrases": ["i can help you cash out", "let me handle your account",
                    "send me your login", "share your password"],
        "weight": 30,
        "message": "Offers to 'help' access your account or funds directly",
    },
    "new_account_request": {
        "phrases": ["open a new bank account", "open a new account for this"],
        "weight": 30,
        "message": "Asks you to open a new account — a common fund-laundering tactic",
    },
    "insurance_fraud": {
        "phrases": ["pay your deductible now", "wire the deductible",
                    "policy will be cancelled unless you pay", "reactivate your medicare",
                    "confirm your medicare number", "guaranteed approval no medical exam",
                    "processing fee before we release your claim", "claims adjuster needs payment",
                    "send the deductible by gift card", "verify your social security to keep coverage"],
        "weight": 30,
        "message": "Matches a common insurance-fraud pattern — real insurers never require upfront payment to process a claim or ask you to pay a deductible directly to an agent",
    },
    "charity_scam": {
        "phrases": ["donate now to help victims", "urgent disaster relief donation",
                    "wire your donation", "send your donation by gift card",
                    "100% of your donation", "tax deductible donation today only",
                    "help the families affected", "disaster relief fund needs your help now"],
        "weight": 25,
        "message": "Matches a common charity-scam pattern — legitimate charities never pressure urgent donations or ask for gift cards/wire transfers",
    },
    "medical_scam": {
        "phrases": ["free genetic test", "free dna test", "free genetic testing",
                    "free cancer screening", "free cancer test", "free back brace",
                    "free knee brace", "free braces", "free medical equipment",
                    "free diabetic supplies", "free diabetes supplies", "free covid test",
                    "free heart test", "free cardiovascular test",
                    "medicare covers it at no cost", "just need your medicare number",
                    "give me your medicare number", "read me your medicare number",
                    "your medicare card is expiring", "new medicare card fee",
                    "your medicare benefits will be cancelled", "remote patient monitoring at no cost",
                    "just swab your cheek", "cheek swab"],
        "weight": 30,
        "message": "Matches a common medical / Medicare scam — offers of 'free' tests, braces or supplies that need your Medicare number are used to bill Medicare in your name",
    },
    "pharmacy_scam": {
        "phrases": ["no prescription needed", "no prescription required",
                    "without a prescription", "no doctor visit needed",
                    "cheap ozempic", "discount ozempic", "cheap semaglutide",
                    "cheap weight loss injections", "miracle cure", "cures diabetes",
                    "cure cancer naturally", "reverse your diabetes in",
                    "doctors don't want you to know", "100% natural cure"],
        "weight": 25,
        "message": "Matches a fake-pharmacy or miracle-cure pattern — real pharmacies require a valid prescription, and real treatments never promise a cure",
    },
    "medical_bill_scam": {
        "phrases": ["pay your medical bill by gift card", "hospital bill must be paid today",
                    "medical debt will be sent to collections today",
                    "pay your hospital bill now or", "outstanding medical balance pay immediately"],
        "weight": 25,
        "message": "Matches a fake medical bill or debt-collector pattern — real providers send itemized bills and never demand same-day payment by gift card or phone",
    },
    "delivery_toll_scam": {
        "phrases": ["package is on hold", "package on hold", "unable to deliver your package",
                    "redelivery", "re-delivery", "confirm your address", "update your address",
                    "delivery attempt failed", "unpaid toll", "toll balance", "outstanding toll",
                    "avoid late fees on your toll", "your parcel"],
        "weight": 30,
        "message": "Matches the fake delivery or unpaid-toll text scam — USPS, UPS, FedEx and toll agencies don't text links asking you to pay or confirm your address",
    },
    "task_scam": {
        "phrases": ["liking videos", "like videos", "like youtube videos", "rate products", "rating products",
                    "optimize apps", "app optimization", "daily commission", "complete tasks and earn",
                    "simple tasks", "recharge your account", "top up your account to unlock",
                    "earn $", "a day from home", "per day from home", "part-time job from home",
                    "i'll train you", "i will train you", "your trainer", "my trainer", "training account",
                    "invitation code", "invite code", "combination order", "combo order", "lucky order",
                    "premium order", "golden egg", "negative balance", "recharge to continue",
                    "deposit to continue", "complete the set", "complete all tasks to withdraw",
                    "restaurant bookings", "table reservations", "hotel reservations", "submit orders",
                    "boost ratings", "data optimization", "commission rate", "reset your account"],
        "weight": 30,
        "message": "Matches the \"task job\" scam: a recruiter hands you to a \"trainer,\" you get an invite code to a work website, easy tasks pay small amounts at first, then a \"combination order\" or negative balance makes you deposit money that you never get back",
    },
    "investment_group": {
        "phrases": ["vip group", "trading mentor", "crypto mentor", "investment club", "signals group",
                    "trading signals", "guaranteed returns", "withdraw your profits", "fee to withdraw",
                    "tax to withdraw", "unlock your withdrawal", "my uncle taught me", "trading platform my"],
        "weight": 30,
        "message": "Matches the fake investment-group scam (\"pig butchering\"): a friendly stranger or \"mentor\" shows fake profits, then the money can never be withdrawn",
    },
    "account_alert": {
        "phrases": ["your account is locked", "your account has been locked", "account has been suspended",
                    "account will be suspended", "unusual sign-in activity", "verify your identity",
                    "suspicious activity on your account", "your account has been compromised"],
        "weight": 20,
        "message": "Uses a fake account alert to scare you into acting — log in through the company's own app or website instead of any link",
    },
    "irs_impersonation": {
        "phrases": ["irs will arrest you", "pay your back taxes immediately",
                    "this is the irs calling", "your tax id has been suspended",
                    "irs warrant issued", "pay the irs with gift cards",
                    "final notice before legal action", "irs online account suspended",
                    "verify your tax refund by providing"],
        "weight": 30,
        "message": "Matches a real IRS-impersonation pattern — the IRS contacts by mail first, never demands immediate payment by phone, and never accepts gift cards",
    },
}


def analyze_text(text: str) -> dict:
    lowered = text.lower()
    score = 0
    flags = []
    trigger_decoy_card = False

    for category, rule in RED_FLAGS.items():
        for phrase in rule["phrases"]:
            if phrase in lowered:
                score += rule["weight"]
                flags.append(rule["message"])
                if category == "prepaid_card_request":
                    trigger_decoy_card = True
                break  # only count each category once

    score = min(score, 100)

    if score >= 50:
        level = "high"
    elif score >= 20:
        level = "medium"
    else:
        level = "low"

    return {
        "risk_score": score,
        "risk_level": level,
        "flags": flags,
        "trigger_decoy_card": trigger_decoy_card,
    }


@app.get("/")
def root():
    return {"status": "ScamShield API is running"}


@app.post("/api/check")
def check_text(payload: CheckRequest):
    return analyze_text(payload.text)


async def _publicaml_check(payload: CryptoCheckRequest):
    """
    Checks a crypto wallet address against PublicAML's free, keyless
    AML/scam-screening API before a user sends funds to it.
    Docs: https://publicaml.org/
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                PUBLICAML_URL,
                json={"addresses": [{"wallet_address": payload.address, "chain": payload.chain}]},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError:
        return {
            "error": "Could not reach the address-screening service. Try again shortly.",
            "address": payload.address,
        }

    entities = data.get("entities", [])
    if not entities:
        return {
            "address": payload.address,
            "risk_level": "unknown",
            "message": "No data found for this address — proceed with caution.",
        }

    entity = entities[0]
    score = entity.get("aml_score", 0)

    if score >= 70:
        level = "high"
    elif score >= 30:
        level = "medium"
    else:
        level = "low"

    return {
        "address": payload.address,
        "chain": entity.get("chain", payload.chain),
        "aml_score": score,
        "risk_level": level,
        "category": entity.get("category"),
        "label": entity.get("label"),
    }


@app.post("/api/crypto-check")
async def check_crypto_address(payload: CryptoCheckRequest):
    result = await _publicaml_check(payload)
    hit = await network_match("wallet", payload.address)
    if hit:
        result["network"] = hit
        result["risk_level"] = "high" if hit["reporters"] >= 2 else (
            "medium" if result.get("risk_level") in ("low", "unknown") else result.get("risk_level"))
        result["message"] = hit["reason"] + (" " + result["message"] if result.get("message") else "")
    return result


@app.get("/api/health/sources")
async def health_sources():
    """
    Open this in a browser to confirm every outside data source ScamShield
    (and ScamGuard Global) depends on is answering. Uses harmless test
    inputs only. Each source reports OK, NEEDS KEY or FAILED.
    """
    import asyncio

    async def check_rdap():
        result = await check_domain_age("https://example.com")
        if result.get("checked") and result.get("age_days", 0) > 1000:
            return {"name": "Website age (RDAP)", "status": "OK",
                    "detail": f"example.com is {result['age_days']} days old"}
        return {"name": "Website age (RDAP)", "status": "FAILED",
                "detail": result.get("reason", "Unexpected response")}

    async def check_urlhaus():
        key = (os.getenv("URLHAUS_AUTH_KEY") or "").strip()
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(URLHAUS_URL, data={"url": "https://example.com/"},
                                         headers={"Auth-Key": key} if key else {})
            if resp.status_code in (401, 403):
                return {"name": "URLhaus scam list", "status": "NEEDS KEY",
                        "detail": "URLhaus refused the request. Add a free URLHAUS_AUTH_KEY on Render."}
            resp.raise_for_status()
            qs = resp.json().get("query_status")
            if qs in ("ok", "no_results"):
                return {"name": "URLhaus scam list", "status": "OK", "detail": f"answered ({qs})"}
            return {"name": "URLhaus scam list", "status": "FAILED", "detail": f"unexpected answer: {qs}"}
        except Exception as e:
            return {"name": "URLhaus scam list", "status": "FAILED", "detail": type(e).__name__}

    async def check_publicaml():
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(PUBLICAML_URL, json={"addresses": [{
                    "wallet_address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
                    "chain": "ethereum"}]})
            if resp.status_code in (401, 403):
                return {"name": "Crypto wallet check (PublicAML)", "status": "NEEDS KEY",
                        "detail": f"refused with HTTP {resp.status_code}"}
            resp.raise_for_status()
            resp.json()
            return {"name": "Crypto wallet check (PublicAML)", "status": "OK", "detail": "answered"}
        except Exception as e:
            return {"name": "Crypto wallet check (PublicAML)", "status": "FAILED", "detail": type(e).__name__}

    def check_builtin():
        r = check_url_heuristics("http://paypal-verify-login.xyz")
        ok = r.get("suspicious") is True
        return {"name": "Built-in link analysis", "status": "OK" if ok else "FAILED",
                "detail": f"{r.get('score', 0)} warning signs on a known-bad test link"}

    async def check_ipinfo():
        if not (os.getenv("IPINFO_TOKEN") or "").strip():
            return {"name": "Hosting location (IPinfo)", "status": "NEEDS KEY",
                    "detail": "Add a free IPINFO_TOKEN on Render."}
        r = await lookup_hosting("https://8.8.8.8")
        if r.get("checked") and r.get("country_code"):
            return {"name": "Hosting location (IPinfo)", "status": "OK",
                    "detail": f"8.8.8.8 is in {r.get('country')} on {r.get('network')}"}
        return {"name": "Hosting location (IPinfo)", "status": "FAILED",
                "detail": r.get("reason", "Unexpected response")}

    def check_phone_lib():
        r = analyze_phone("+1 876 555 0134")
        ok = r.get("valid") and r.get("risk") == "high"
        return {"name": "Phone number check", "status": "OK" if ok else "FAILED",
                "detail": "flags a Jamaica one-ring number" if ok else r.get("error", "Unexpected result")}

    async def check_dns():
        r = await lookup_mail_servers("gmail.com")
        if r.get("checked") and r.get("has_mail"):
            return {"name": "Email domain check (DNS)", "status": "OK", "detail": "gmail.com accepts email"}
        return {"name": "Email domain check (DNS)", "status": "FAILED", "detail": r.get("reason", "Unexpected response")}

    async def check_network():
        if not network_enabled():
            return {"name": "Shared scam list (Supabase)", "status": "NEEDS KEY",
                    "detail": "Add SUPABASE_URL and SUPABASE_SERVICE_KEY on Render."}
        try:
            resp = await _rpc("network_stats", {}, timeout=6)
            if resp.status_code == 200:
                d = resp.json()
                d = d[0] if isinstance(d, list) and d else d
                return {"name": "Shared scam list (Supabase)", "status": "OK",
                        "detail": f"{(d or {}).get('indicators', 0)} clues from {(d or {}).get('reporters', 0)} reporters"
                                  + (f", {(d or {}).get('operations')} operations" if (d or {}).get('operations') is not None else "")}
            if resp.status_code in (401, 403):
                return {"name": "Shared scam list (Supabase)", "status": "NEEDS KEY", "detail": "Supabase refused the service key."}
            return {"name": "Shared scam list (Supabase)", "status": "FAILED",
                    "detail": f"HTTP {resp.status_code}. Was the setup SQL run?"}
        except Exception as e:
            return {"name": "Shared scam list (Supabase)", "status": "FAILED", "detail": type(e).__name__}

    results = list(await asyncio.gather(check_rdap(), check_urlhaus(), check_publicaml(), check_ipinfo(), check_dns(), check_network()))
    results.insert(0, check_phone_lib())
    results.insert(0, check_builtin())
    overall = "ALL OK" if all(r["status"] == "OK" for r in results) else "NEEDS ATTENTION"
    return {"overall": overall, "checks": results}


@app.post("/api/trusted-contact")
def save_trusted_contact(payload: TrustedContactRequest):
    if not db:
        return {"error": "Firebase is not configured on the server yet."}
    db.collection("trusted_contacts").document(payload.device_id).set({
        "contact_name": payload.contact_name,
        "contact_phone": payload.contact_phone,
        "codeword": payload.codeword,
    })
    return {"saved": True}


@app.get("/api/trusted-contact/{device_id}")
def get_trusted_contact(device_id: str):
    if not db:
        return {"error": "Firebase is not configured on the server yet."}
    doc = db.collection("trusted_contacts").document(device_id).get()
    if not doc.exists:
        return {"found": False}
    return {"found": True, **doc.to_dict()}


@app.post("/api/decoy-card")
async def request_decoy_card(payload: DecoyCardRequest):
    """
    Requests a single-use, near-zero-balance virtual card from the card
    provider to hand to a scammer instead of real funds. The provider
    (Lithic/Stripe Issuing/etc.) is the actual regulated issuer — ScamShield
    never holds card-issuing licensing itself, only calls their API.

    NOT LIVE YET: requires a real provider account, approval of this exact
    use case by their risk/compliance team, and a real API key in
    CARD_PROVIDER_API_KEY before this will return a usable card.
    """
    if CARD_PROVIDER_API_KEY == "REPLACE_WITH_REAL_KEY":
        return {
            "error": "Decoy card provider not yet configured. "
                     "This feature requires a live card-issuing partnership."
        }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{CARD_PROVIDER_BASE_URL}/cards",
                headers={"Authorization": f"Bearer {CARD_PROVIDER_API_KEY}"},
                json={
                    "type": "SINGLE_USE",
                    "spend_limit": 100,  # cents — effectively $1, adjust per provider minimums
                    "memo": f"ScamShield decoy - {payload.reason}",
                },
            )
            resp.raise_for_status()
            card = resp.json()
    except httpx.HTTPError:
        return {"error": "Could not reach the card provider. Try again shortly."}

    # Only return what the user needs to hand to the scammer —
    # never log or store the full card number/CVV server-side.
    return {
        "card_number": card.get("pan"),
        "expiry": card.get("exp_month", "") + "/" + card.get("exp_year", ""),
        "cvv": card.get("cvv"),
        "note": "This card has a near-zero balance and is being monitored. "
                "Any attempt to use it will be logged as evidence.",
    }


@app.post("/api/decoy-card/webhook")
async def decoy_card_webhook(payload: dict):
    """
    Receives authorization-attempt events from the card provider when
    someone tries to use a decoy card. Even a DECLINED attempt includes
    merchant name, location, and timestamp — direct evidence for an IC3
    report. Wire this URL into your provider's webhook settings once live.
    """
    # TODO: persist this to a database keyed by card ID, and/or
    # auto-populate the IC3Report evidence fields with merchant/location data.
    merchant = payload.get("merchant", {})
    return {
        "received": True,
        "merchant_name": merchant.get("descriptor"),
        "merchant_city": merchant.get("city"),
        "merchant_country": merchant.get("country"),
        "attempted_amount": payload.get("amount"),
        "status": payload.get("result"),  # e.g. "DECLINED"
    }


IPINFO_LITE_URL = "https://api.ipinfo.io/lite/{ip}"


async def lookup_hosting(url: str) -> dict:
    """
    Finds where a website's server actually is, using IPinfo Lite (free,
    commercial use allowed with attribution: "IP address data is powered
    by IPinfo"). Needs IPINFO_TOKEN set on Render; skipped otherwise.
    """
    import asyncio
    import ipaddress
    import socket
    from urllib.parse import urlparse

    token = (os.getenv("IPINFO_TOKEN") or "").strip()
    if not token:
        return {"checked": False, "reason": "not configured"}
    try:
        raw = url if "://" in url else "http://" + url
        host = (urlparse(raw).hostname or "").lower()
        if not host:
            return {"checked": False, "reason": "No website name in that link"}
        try:
            ip = str(ipaddress.ip_address(host))
        except ValueError:
            infos = await asyncio.get_running_loop().getaddrinfo(host, None, type=socket.SOCK_STREAM)
            v4 = [i[4][0] for i in infos if i[0] == socket.AF_INET]
            ip = (v4 or [infos[0][4][0]])[0]
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(IPINFO_LITE_URL.format(ip=ip), params={"token": token})
        if resp.status_code in (401, 403):
            return {"checked": False, "reason": "IPinfo token was refused"}
        resp.raise_for_status()
        d = resp.json()
        return {
            "checked": True,
            "ip": ip,
            "country": d.get("country"),
            "country_code": d.get("country_code"),
            "network": d.get("as_name"),
            "network_domain": d.get("as_domain"),
        }
    except socket.gaierror:
        return {"checked": False, "reason": "That website name doesn't exist"}
    except Exception:
        return {"checked": False, "reason": "Lookup failed"}


async def check_domain_age(url: str) -> dict:
    """
    Checks how recently a domain was registered using RDAP (the public,
    keyless WHOIS replacement). Domains registered in the last 30 days
    are a major red flag — scam sites are almost always brand new,
    while legitimate businesses' domains are typically months or years old.
    """
    from urllib.parse import urlparse
    from datetime import datetime, timezone

    try:
        raw = url if "://" in url else "http://" + url
        host = (urlparse(raw).hostname or "").lower()
        labels = [p for p in host.split(".") if p]
        if labels and all(p.isdigit() for p in labels):
            return {"checked": False, "reason": "Link uses an IP address, not a website name"}
        # RDAP only knows registered domains, not sub-domains like
        # "login.example.com", so reduce to the registered part.
        if len(labels) >= 3 and labels[-2] in ("co", "com", "org", "net", "gov", "ac", "edu"):
            domain = ".".join(labels[-3:])
        else:
            domain = ".".join(labels[-2:])
        if not domain:
            return {"checked": False, "reason": "No website name in that link"}

        # rdap.org answers with a redirect to the registry that holds the
        # domain (e.g. Verisign for .com), so redirects must be followed.
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(f"https://rdap.org/domain/{domain}")
            if resp.status_code != 200:
                return {"checked": False, "reason": "No registration data found"}
            data = resp.json()

        events = data.get("events", [])
        registered = next((e["eventDate"] for e in events if e.get("eventAction") == "registration"), None)
        if not registered:
            return {"checked": False, "reason": "Registration date unavailable"}

        reg_date = datetime.fromisoformat(registered.replace("Z", "+00:00"))
        age_days = (datetime.now(timezone.utc) - reg_date).days

        return {
            "checked": True,
            "domain": domain,
            "registered_on": registered,
            "age_days": age_days,
            "is_new_domain": age_days < 30,
        }
    except Exception:
        return {"checked": False, "reason": "Lookup failed"}


SUSPICIOUS_TLDS = {
    "zip", "mov", "top", "xyz", "click", "link", "icu", "cyou", "sbs", "rest",
    "gq", "tk", "ml", "cf", "ga", "work", "support", "country", "loan", "bond",
    "vip", "win", "bet", "cyou", "buzz",
}
URL_SHORTENERS = {
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly",
    "cutt.ly", "rb.gy", "shorturl.at", "tiny.cc", "rebrand.ly",
}
SCAM_KEYWORDS = (
    "login", "signin", "verify", "secure", "account", "update", "wallet",
    "confirm", "suspend", "unlock", "billing", "refund", "claim", "prize",
    "support", "security", "alert", "helpdesk", "service",
)
BRAND_NAMES = (
    "paypal", "amazon", "apple", "microsoft", "google", "netflix", "chase",
    "wellsfargo", "bankofamerica", "irs", "usps", "fedex", "ups", "coinbase",
    "venmo", "cashapp", "zelle", "medicare", "socialsecurity",
)


def check_url_heuristics(url: str) -> dict:
    """
    Keyless, offline checks on the shape of the link itself. Needs no
    account, API key, or third party. Returns reasons in plain English.
    """
    import re
    from urllib.parse import urlparse

    reasons = []
    raw = url.strip()
    parsed = urlparse(raw if "://" in raw else "http://" + raw)
    host = (parsed.hostname or "").lower()
    if not host:
        return {"score": 0, "reasons": [], "suspicious": False}

    labels = host.split(".")
    tld = labels[-1]
    base = ".".join(labels[-2:]) if len(labels) >= 2 else host
    main_label = labels[-2] if len(labels) >= 2 else host

    if re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", host):
        reasons.append("The link uses a raw IP address instead of a website name.")
    if parsed.scheme == "http":
        reasons.append("The link isn't encrypted (http, not https).")
    if "@" in parsed.netloc:
        reasons.append("The link contains an @ sign, a trick used to hide the real destination.")
    if "xn--" in host:
        reasons.append("The web address uses look-alike international characters (punycode).")
    if base in URL_SHORTENERS:
        reasons.append("This is a shortened link, so the real destination is hidden.")
    if tld in SUSPICIOUS_TLDS:
        reasons.append(f"The .{tld} ending is commonly used by scam sites.")
    if len(labels) > 4:
        reasons.append("The address has an unusually long chain of sub-domains.")
    if host.count("-") >= 3:
        reasons.append("The address has many hyphens, common in fake look-alike sites.")
    if len(raw) > 100:
        reasons.append("The link is unusually long.")

    for brand in BRAND_NAMES:
        if brand in host and main_label != brand:
            reasons.append(f"The address mentions '{brand}' but isn't the real {brand} website.")
            break
    else:
        # Look-alike spellings such as "amaz0n" or "paypa1"
        swapped = host.translate(str.maketrans({"0": "o", "1": "l", "3": "e", "5": "s", "4": "a", "7": "t"}))
        for brand in BRAND_NAMES:
            if brand in swapped and brand not in host:
                reasons.append(f"The address swaps letters for numbers to look like '{brand}'. That's a classic fake.")
                reasons.append(f"It isn't the real {brand} website.")
                break

    if any(k in host for k in SCAM_KEYWORDS) and any(b in host for b in BRAND_NAMES):
        reasons.append("The address mixes a well-known brand with words like 'verify' or 'login'.")

    # Invite-only sign-up links: how task-scam "work platforms" recruit people.
    full = (parsed.path + "?" + parsed.query + "#" + parsed.fragment).lower()
    signup_page = re.search(r"[/#](register|signup|sign-up|reg)\b", full)
    if re.search(r"invit\w*[_-]?(code|id)?=\w{3,}", full) or \
       (signup_page and re.search(r"(ref(errer|erral)?|promo|agent|code)[_-]?(code|id)?=\w{3,}", full)) or \
       re.search(r"#/(register|reg|signup)", full):
        reasons.append("This is a sign-up link with an invitation code. Task-scam \"work platforms\" recruit people exactly this way, so be very careful if a stranger or \"recruiter\" sent it.")

    return {"score": len(reasons), "reasons": reasons, "suspicious": len(reasons) >= 2}


@app.post("/api/url-check")
async def check_urls(payload: URLCheckRequest):
    """
    Checks URLs against multiple independent free/low-cost sources, since
    no single database catches everything — especially brand-new scam
    sites that haven't been reported anywhere yet:
      - Google Safe Browsing (malware, phishing, unwanted software)
      - VirusTotal (aggregates 70+ security engines' verdicts)
      - URLhaus (community-reported malicious URLs)
      - Domain age via RDAP (flags brand-new domains — a strong scam signal)

    Returns which sources are actually configured, and a combined verdict.
    A URL is flagged if ANY configured source flags it.
    """
    if not payload.urls:
        return {"configured": False, "flagged_urls": [], "sources_checked": []}

    url = payload.urls[0]
    sources_checked = []
    flagged_urls = set()
    details = {}

    # --- Domain age (RDAP) ---
    domain_age = await check_domain_age(url)
    sources_checked.append("Domain Age (RDAP)")
    if domain_age.get("is_new_domain"):
        flagged_urls.add(url)
    details["domain_age"] = domain_age

    # --- Built-in link checks (no account or key needed) ---
    heuristics = check_url_heuristics(url)
    sources_checked.append("Built-in link analysis")
    if heuristics["suspicious"]:
        flagged_urls.add(url)
    details["heuristics"] = heuristics

    # --- Hosting location (IPinfo Lite, optional) ---
    hosting = await lookup_hosting(url)
    if hosting.get("checked"):
        sources_checked.append("Hosting location (IPinfo)")
        pretends_brand = any(r.startswith("The address mentions") for r in heuristics["reasons"])
        if pretends_brand and hosting.get("country_code") and hosting["country_code"] != "US":
            heuristics["reasons"].append(
                f"It pretends to be a well-known company but is hosted in {hosting.get('country') or hosting['country_code']}."
            )
            flagged_urls.add(url)
    details["hosting"] = hosting

    # --- Google Safe Browsing (optional, only if a key is set) ---
    if GOOGLE_SAFE_BROWSING_API_KEY != "REPLACE_WITH_REAL_KEY":
        sources_checked.append("Google Safe Browsing")
        body = {
            "client": {"clientId": "scamshield", "clientVersion": "1.0.0"},
            "threatInfo": {
                "threatTypes": [
                    "MALWARE", "SOCIAL_ENGINEERING",
                    "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION",
                ],
                "platformTypes": ["ANY_PLATFORM"],
                "threatEntryTypes": ["URL"],
                "threatEntries": [{"url": u} for u in payload.urls],
            },
        }
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{SAFE_BROWSING_URL}?key={GOOGLE_SAFE_BROWSING_API_KEY}", json=body
                )
                resp.raise_for_status()
                matches = resp.json().get("matches", [])
                for m in matches:
                    flagged_urls.add(m["threat"]["url"])
                details["safe_browsing"] = {"flagged": len(matches) > 0}
        except httpx.HTTPError:
            details["safe_browsing"] = {"error": "unreachable"}

    # --- VirusTotal ---
    if VIRUSTOTAL_API_KEY != "REPLACE_WITH_REAL_KEY":
        sources_checked.append("VirusTotal")
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                submit_resp = await client.post(
                    VIRUSTOTAL_URL,
                    headers={"x-apikey": VIRUSTOTAL_API_KEY},
                    data={"url": url},
                )
                submit_resp.raise_for_status()
                analysis_id = submit_resp.json()["data"]["id"]

                result_resp = await client.get(
                    f"https://www.virustotal.com/api/v3/analyses/{analysis_id}",
                    headers={"x-apikey": VIRUSTOTAL_API_KEY},
                )
                result_resp.raise_for_status()
                stats = result_resp.json()["data"]["attributes"]["stats"]
                malicious = stats.get("malicious", 0)
                suspicious = stats.get("suspicious", 0)

                if malicious > 0 or suspicious > 0:
                    flagged_urls.add(url)
                details["virustotal"] = {
                    "malicious_votes": malicious,
                    "suspicious_votes": suspicious,
                }
        except (httpx.HTTPError, KeyError):
            details["virustotal"] = {"error": "unreachable or rate-limited"}

    # --- URLhaus ---
    # Optional: set URLHAUS_AUTH_KEY on Render if abuse.ch requires it.
    urlhaus_key = (os.getenv("URLHAUS_AUTH_KEY") or "").strip()
    try:
        headers = {"Auth-Key": urlhaus_key} if urlhaus_key else {}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(URLHAUS_URL, data={"url": url}, headers=headers)
            if resp.status_code in (401, 403):
                details["urlhaus"] = {"error": "needs key"}
            else:
                resp.raise_for_status()
                result = resp.json()
                sources_checked.append("URLhaus")
                if result.get("query_status") == "ok":
                    flagged_urls.add(url)
                details["urlhaus"] = {
                    "in_database": result.get("query_status") == "ok",
                    "threat": result.get("threat"),
                }
    except (httpx.HTTPError, ValueError):
        details["urlhaus"] = {"error": "unreachable"}

    # --- ScamShield network (shared scam list) ---
    hit = await network_match("url", url) or await network_match("domain", url)
    if hit:
        sources_checked.append("ScamShield network")
        heuristics["reasons"].append(hit["reason"])
        if hit["reporters"] >= 2:
            flagged_urls.add(url)
        details["network"] = hit

    return {
        "configured": len(sources_checked) > 0,
        "sources_checked": sources_checked,
        "flagged_urls": list(flagged_urls),
        "details": details,
    }


# ---------------------------------------------------------------------------
# Phone number check
# Uses the open-source "phonenumbers" package (worldwide numbering rules),
# which run entirely on our server — no account, key or outside lookup.
# ---------------------------------------------------------------------------

# Caribbean and Atlantic areas that share the US "+1" country code. Numbers
# here look like US numbers but are international — the classic "one ring"
# scam: they call once and hang up, hoping you call back and pay big
# international fees.
ONE_RING_REGIONS = {
    "AG", "AI", "BB", "BM", "BS", "DM", "DO", "GD", "JM", "KN", "KY",
    "LC", "MS", "SX", "TC", "TT", "VC", "VG",
}
GOV_WORDS = ("irs", "social security", "ssa", "medicare", "police", "sheriff", "fbi",
             "government", "court", "marshal", "immigration", "dhs", "treasury")
BANK_WORDS = ("bank", "chase", "wells", "citi", "capital one", "credit union", "paypal",
              "venmo", "zelle", "cash app", "fraud department", "card")
TECH_WORDS = ("microsoft", "apple", "amazon", "geek squad", "tech support", "norton", "mcafee")


def _claimed_kind(claimed: str) -> str:
    c = (claimed or "").lower()
    if any(w in c for w in GOV_WORDS):
        return "government"
    if any(w in c for w in BANK_WORDS):
        return "bank"
    if any(w in c for w in TECH_WORDS):
        return "tech"
    return ""


def analyze_phone(number: str, claimed: str = "") -> dict:
    try:
        import phonenumbers
        from phonenumbers import geocoder, carrier, PhoneNumberType
    except ImportError:
        return {"valid": False, "error": "Phone checking isn't installed on the server yet."}

    raw = (number or "").strip()
    if not raw:
        return {"valid": False, "error": "Enter a phone number."}

    high, caution = [], []
    try:
        n = phonenumbers.parse(raw, "US")
    except phonenumbers.NumberParseException:
        return {
            "valid": False, "risk": "high", "formatted": raw,
            "reasons": ["This isn't a real phone number format. Scammers often show fake numbers on caller ID."],
            "tips": [],
        }

    valid = phonenumbers.is_valid_number(n)
    region = phonenumbers.region_code_for_number(n) or ""
    place = geocoder.description_for_number(n, "en") or ""
    country = geocoder.country_name_for_number(n, "en") or region
    phone_company = carrier.name_for_number(n, "en") or ""
    ntype = phonenumbers.number_type(n)
    type_names = {
        PhoneNumberType.MOBILE: "Mobile phone",
        PhoneNumberType.FIXED_LINE: "Landline",
        PhoneNumberType.FIXED_LINE_OR_MOBILE: "Landline or mobile",
        PhoneNumberType.TOLL_FREE: "Toll-free number",
        PhoneNumberType.PREMIUM_RATE: "Premium-rate number (costs money to call)",
        PhoneNumberType.VOIP: "Internet phone number (VoIP)",
        PhoneNumberType.SHARED_COST: "Shared-cost number",
        PhoneNumberType.PERSONAL_NUMBER: "Personal forwarding number",
        PhoneNumberType.PAGER: "Pager",
        PhoneNumberType.UAN: "Company number",
    }
    line_type = type_names.get(ntype, "Unknown")
    kind = _claimed_kind(claimed)

    if not valid:
        high.append("This isn't a valid phone number anywhere in the world. Caller ID can be faked, and scammers often show made-up numbers.")
    else:
        if region in ONE_RING_REGIONS:
            high.append(
                f"This number is in {country}, not the US — even though it starts like a US number. "
                "Missed calls from these area codes are a known \"one ring\" scam: calling back can cost you expensive international fees."
            )
        elif region and region not in ("US", "CA"):
            caution.append(f"This is an international number from {country}.")
            if kind:
                high.append(f"A real US {'agency' if kind == 'government' else 'company'} won't call you from a number in {country}.")
        if ntype == PhoneNumberType.PREMIUM_RATE:
            high.append("This is a premium-rate number. Calling it back can put large charges on your phone bill.")
        if ntype == PhoneNumberType.VOIP:
            caution.append("This is an internet phone number. Anyone can get one in minutes, without giving their real name.")
        if ntype == PhoneNumberType.TOLL_FREE and kind == "bank":
            caution.append("Toll-free numbers are cheap and easy to rent. Don't trust it just because it looks official.")

    if kind == "government":
        high.append("Government agencies like the IRS, Social Security and Medicare don't call to demand payment or threaten arrest. That's always a scam.")
    elif kind == "bank":
        caution.append("Banks never ask for your password, PIN or a code sent to your phone. If in doubt, hang up and call the number on the back of your card.")
    elif kind == "tech":
        high.append("Microsoft, Apple and other tech companies don't call you about viruses or problems with your computer.")

    tips = [
        "Caller ID can be faked. Even a local number or a real company's number can be a scammer.",
        "Never call back a number from a voicemail or text. Look up the company's number yourself.",
    ]
    risk = "high" if high else ("caution" if caution else "low")
    return {
        "valid": valid,
        "formatted": phonenumbers.format_number(n, phonenumbers.PhoneNumberFormat.INTERNATIONAL),
        "country": country,
        "region_code": region,
        "location": place if place and place != country else "",
        "line_type": line_type,
        "phone_company": phone_company,
        "risk": risk,
        "reasons": high + caution,
        "tips": tips,
    }


@app.post("/api/phone-check")
async def check_phone(payload: PhoneCheckRequest):
    result = analyze_phone(payload.number[:40], payload.claimed[:80])
    if result.get("valid") is not None and result.get("formatted"):
        hit = await network_match("phone", result.get("formatted"))
        if hit:
            result["network"] = hit
            result["reasons"] = [hit["reason"]] + result.get("reasons", [])
            if hit["reporters"] >= 2:
                result["risk"] = "high"
            elif result.get("risk") == "low":
                result["risk"] = "caution"
    return result


# ---------------------------------------------------------------------------
# Email sender check
# Keyless: built-in rules, website age (RDAP) and a public DNS lookup
# (Cloudflare DNS-over-HTTPS) to see if the domain can even receive email.
# ---------------------------------------------------------------------------

FREE_EMAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com", "hotmail.com",
    "live.com", "msn.com", "aol.com", "icloud.com", "me.com", "mac.com", "proton.me",
    "protonmail.com", "gmx.com", "gmx.us", "mail.com", "yandex.com", "yandex.ru", "zoho.com",
    "att.net", "comcast.net", "verizon.net", "sbcglobal.net", "bellsouth.net", "cox.net",
    "charter.net", "earthlink.net", "inbox.com", "tutanota.com", "fastmail.com", "qq.com",
}
DISPOSABLE_EMAIL_DOMAINS = {
    "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "10minutemail.com",
    "temp-mail.org", "tempmail.com", "tempmail.net", "yopmail.com", "trashmail.com", "getnada.com",
    "dispostable.com", "maildrop.cc", "throwawaymail.com", "fakeinbox.com", "mintemail.com",
    "mohmal.com", "emailondeck.com", "burnermail.io", "tempail.com", "spamgourmet.com", "33mail.com",
    "mailnesia.com", "mytemp.email", "tempr.email", "discard.email", "inboxkitten.com", "minuteinbox.com",
}
DNS_JSON_URL = "https://cloudflare-dns.com/dns-query"


async def lookup_mail_servers(domain: str) -> dict:
    """Asks public DNS whether a domain is set up to receive email."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            headers = {"accept": "application/dns-json"}
            mx = await client.get(DNS_JSON_URL, params={"name": domain, "type": "MX"}, headers=headers)
            mx.raise_for_status()
            d = mx.json()
            if d.get("Status") == 3:  # NXDOMAIN: the domain doesn't exist
                return {"checked": True, "exists": False, "has_mail": False}
            if any(a.get("type") == 15 for a in d.get("Answer", []) or []):
                return {"checked": True, "exists": True, "has_mail": True}
            a = await client.get(DNS_JSON_URL, params={"name": domain, "type": "A"}, headers=headers)
            a.raise_for_status()
            has_a = any(x.get("type") == 1 for x in a.json().get("Answer", []) or [])
            return {"checked": True, "exists": True, "has_mail": has_a}
    except Exception:
        return {"checked": False, "reason": "DNS lookup failed"}


def _slug(text: str) -> str:
    import re
    return re.sub(r"[^a-z0-9]", "", (text or "").lower())


@app.post("/api/email-check")
async def check_email(payload: EmailCheckRequest):
    import re

    email = (payload.email or "").strip().strip("<>").lower()[:254]
    claimed = (payload.claimed or "").strip()[:80]
    m = re.fullmatch(r"([^@\s]+)@([a-z0-9.-]+\.[a-z]{2,})", email)
    if not m:
        return {"valid": False, "risk": "high", "email": email,
                "reasons": ["That isn't a complete email address. Copy the full address, like name@company.com."],
                "tips": []}
    local, domain = m.group(1), m.group(2)
    high, caution = [], []
    claimed_slug = _slug(claimed)
    domain_slug = _slug(domain.rsplit(".", 1)[0])
    is_free = domain in FREE_EMAIL_DOMAINS

    if domain in DISPOSABLE_EMAIL_DOMAINS:
        high.append(f"{domain} is a throwaway email service. Real businesses never use these.")

    if is_free:
        if len(claimed_slug) > 2:
            high.append(f"A real {claimed} would email you from their own company address, not a free {domain} account.")
        else:
            caution.append(f"This is a free {domain} account. Anyone can make one in a minute under any name.")
        for brand in BRAND_NAMES:
            if brand in _slug(local):
                high.append(f"The name before the @ uses '{brand}', but the email is a free {domain} account, not {brand}.")
                break
    else:
        heur = check_url_heuristics("https://" + domain)
        for r in heur["reasons"]:
            if "isn't encrypted" in r:
                continue
            high.append(r.replace("The address", "The email address").replace("The link", "The email address"))
        if claimed_slug and len(claimed_slug) > 2 and claimed_slug not in domain_slug and domain_slug not in claimed_slug:
            caution.append(f"They say they're {claimed}, but the email comes from {domain}. Check that {domain} really belongs to {claimed}.")

    age = {"checked": False}
    mail = {"checked": False}
    if not is_free and domain not in DISPOSABLE_EMAIL_DOMAINS:
        import asyncio
        age, mail = await asyncio.gather(check_domain_age("https://" + domain), lookup_mail_servers(domain))
        if age.get("checked"):
            if age["age_days"] < 30:
                high.append(f"The email's website name was created only {age['age_days']} days ago. Scammers use brand-new names.")
            elif age["age_days"] < 180:
                caution.append(f"The email's website name is fairly new ({age['age_days']} days old).")
        if mail.get("checked"):
            if not mail.get("exists"):
                high.append(f"{domain} doesn't exist. This email address is fake.")
            elif not mail.get("has_mail"):
                caution.append(f"{domain} isn't set up to receive email, so you can't reply to it. Real companies can receive replies.")

    hit = await network_match("email", email)
    if hit:
        (high if hit["reporters"] >= 2 else caution).insert(0, hit["reason"])

    tips = [
        "The sender name you see can say anything. Always look at the actual address after the @.",
        "Don't click links or open attachments in an email you weren't expecting. Go to the company's website yourself.",
    ]
    risk = "high" if high else ("caution" if caution else "low")
    return {
        "valid": True,
        "email": email,
        "domain": domain,
        "free_provider": is_free,
        "domain_age_days": age.get("age_days") if age.get("checked") else None,
        "risk": risk,
        "reasons": high + caution,
        "tips": tips,
        "sources_checked": ["Built-in email analysis"]
            + (["Website age (RDAP)"] if age.get("checked") else [])
            + (["Public DNS"] if mail.get("checked") else []),
    }


# ---------------------------------------------------------------------------
# Full investigation: pull every clue out of a message (phone numbers, links,
# email addresses, crypto wallets, payment names) and run each one through the
# matching check. Used by the app's "Investigate a Message" section and by the
# email forwarding inbox (inbox_worker.py).
# ---------------------------------------------------------------------------

import re as _re

_EMAIL_RE = _re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_URL_RE = _re.compile(
    r"(?:https?://[^\s<>\"')\]]+)"
    r"|(?:\bwww\.[^\s<>\"')\]]+)"
    r"|(?:\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|info|biz|us|co|io|xyz|top|click|link|online|site|shop|store|live|app|vip|icu|cyou|sbs|support|help|me|cc|ly|gl|gd|to)\b(?:/[^\s<>\"')\]]*)?)",
    _re.I,
)
_ETH_RE = _re.compile(r"\b0x[a-fA-F0-9]{40}\b")
_BTC_RE = _re.compile(r"\b(?:bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b")
_TRON_RE = _re.compile(r"\bT[1-9A-HJ-NP-Za-km-z]{33}\b")
_WA_CHAT_RE = _re.compile(r"(?:https?://)?(?:wa\.me/|api\.whatsapp\.com/send/?\?phone=)\+?(\d{7,15})", _re.I)
_WA_GROUP_RE = _re.compile(r"(?:https?://)?chat\.whatsapp\.com/[A-Za-z0-9]{6,}", _re.I)
_TG_GROUP_RE = _re.compile(r"(?:https?://)?(?:t|telegram)\.me/(?:\+|joinchat/)[A-Za-z0-9_-]{6,}", _re.I)
_TG_USER_RE = _re.compile(r"(?:https?://)?(?:t|telegram)\.me/(?!\+|joinchat/)([A-Za-z][A-Za-z0-9_]{3,31})", _re.I)
_TG_HANDLE_RE = _re.compile(r"(?:telegram|tg)\s*(?:id|handle|username|account)?\s*[:\-]?\s*@([A-Za-z][A-Za-z0-9_]{3,31})", _re.I)
_TG_HANDLE_AFTER_RE = _re.compile(r"@([A-Za-z][A-Za-z0-9_]{3,31})\s+(?:on|via|in|at)\s+telegram", _re.I)
_MSG_HOSTS = ("wa.me", "whatsapp.com", "t.me", "telegram.me")
_CASHTAG_RE = _re.compile(r"(?<![\w$])\$[A-Za-z][A-Za-z0-9_]{1,19}\b")
_PAY_APPS = {
    "zelle": "Zelle", "cash app": "Cash App", "cashapp": "Cash App", "venmo": "Venmo",
    "paypal friends": "PayPal Friends & Family", "western union": "Western Union",
    "moneygram": "MoneyGram", "wire transfer": "Wire transfer", "bitcoin atm": "Bitcoin ATM",
    "gift card": "Gift cards", "apple pay": "Apple Pay", "crypto": "Crypto",
}


def extract_clues(text: str, sender: str = "") -> dict:
    text = text or ""
    emails = []
    for e in _EMAIL_RE.findall(text):
        e = e.strip(".").lower()
        if e not in emails:
            emails.append(e)

    # Links, skipping the domain part of email addresses
    no_emails = _EMAIL_RE.sub(" ", text)
    # WhatsApp and Telegram links get their own checks (below), not the website check.
    messaging = []
    for m in _WA_CHAT_RE.finditer(text):
        messaging.append({"app": "WhatsApp", "kind": "chat", "link": m.group(0), "phone": "+" + m.group(1)})
    for m in _WA_GROUP_RE.finditer(text):
        messaging.append({"app": "WhatsApp", "kind": "group", "link": m.group(0)})
    for m in _TG_GROUP_RE.finditer(text):
        messaging.append({"app": "Telegram", "kind": "group", "link": m.group(0)})
    for m in _TG_USER_RE.finditer(text):
        messaging.append({"app": "Telegram", "kind": "account", "link": m.group(0), "username": "@" + m.group(1)})
    for m in list(_TG_HANDLE_RE.finditer(text)) + list(_TG_HANDLE_AFTER_RE.finditer(text)):
        if not any(x.get("username", "").lower() == "@" + m.group(1).lower() for x in messaging):
            messaging.append({"app": "Telegram", "kind": "account", "link": "@" + m.group(1), "username": "@" + m.group(1)})

    links = []
    for m in _URL_RE.findall(no_emails):
        u = m.rstrip(".,;:!?")
        if len(u) < 5 or u.lower() in (l.lower() for l in links):
            continue
        host = _re.sub(r"^https?://", "", u.lower()).split("/")[0]
        if host.startswith("www."):
            host = host[4:]
        if any(host == h or host.endswith("." + h) for h in _MSG_HOSTS):
            continue
        links.append(u)

    phones = []
    try:
        import phonenumbers
        for match in phonenumbers.PhoneNumberMatcher(text, "US"):
            f = phonenumbers.format_number(match.number, phonenumbers.PhoneNumberFormat.E164)
            if f not in phones:
                phones.append(f)
        # The number hidden inside a wa.me link gets the phone check too.
        for m in messaging:
            if m.get("phone"):
                try:
                    f = phonenumbers.format_number(phonenumbers.parse(m["phone"], None), phonenumbers.PhoneNumberFormat.E164)
                except Exception:
                    f = m["phone"]
                if f not in phones:
                    phones.append(f)
    except ImportError:
        pass

    wallets = []
    for chain, rx in (("ethereum", _ETH_RE), ("bitcoin", _BTC_RE), ("tron", _TRON_RE)):
        for w in rx.findall(text):
            if w not in (x["address"] for x in wallets):
                wallets.append({"address": w, "chain": chain})

    lowered = text.lower()
    cashtags = sorted(set(_CASHTAG_RE.findall(text)))
    pay_methods = sorted({label for k, label in _PAY_APPS.items() if k in lowered})
    brands = sorted({b for b in BRAND_NAMES if _re.search(rf"\b{b}\b", lowered)})

    sender = (sender or "").strip()
    if sender:
        if "@" in sender:
            s = sender.lower().strip("<>")
            if s in emails:
                emails.remove(s)
            emails.insert(0, s)
        else:
            try:
                import phonenumbers
                n = phonenumbers.parse(sender, "US")
                f = phonenumbers.format_number(n, phonenumbers.PhoneNumberFormat.E164)
                if f in phones:
                    phones.remove(f)
                phones.insert(0, f)
            except Exception:
                pass

    return {
        "phones": phones[:5], "links": links[:5], "emails": emails[:5], "wallets": wallets[:3],
        "cashtags": cashtags[:5], "payment_methods": pay_methods, "brands_mentioned": brands,
        "messaging_links": messaging[:5],
    }


def _verdict(level: str) -> str:
    return "high" if level == "high" else ("low" if level == "low" else "caution")


async def investigate_text(text: str, sender: str = "") -> dict:
    import asyncio

    text = (text or "")[:8000]
    clues = extract_clues(text, sender)
    analysis = analyze_text(text)
    findings = []

    msg_verdict = _verdict(analysis.get("risk_level", "low"))
    if msg_verdict == "low" and analysis.get("flags"):
        msg_verdict = "caution"  # any warning sign at all deserves a closer look
    findings.append({
        "type": "Message",
        "subject": " ".join(text.split())[:140] + ("…" if len(text) > 140 else ""),
        "verdict": msg_verdict,
        "reasons": analysis.get("flags", []),
        "details": "",
    })

    async def link_job(u):
        # Links written without http(s):// are checked as https, so they aren't
        # wrongly flagged as unencrypted.
        r = await check_urls(URLCheckRequest(urls=[u if "://" in u else "https://" + u]))
        flagged = bool(r.get("flagged_urls"))
        d = r.get("details", {})
        reasons = list(d.get("heuristics", {}).get("reasons", []))
        age = d.get("domain_age", {})
        if age.get("is_new_domain"):
            reasons.append(f"Website was registered only {age.get('age_days')} days ago.")
        if d.get("urlhaus", {}).get("in_database"):
            reasons.append("This link is on the URLhaus list of known malicious links.")
        host = d.get("hosting", {})
        return {"type": "Link", "subject": u, "verdict": "high" if flagged else "low", "reasons": reasons,
                "details": f"Hosted in {host.get('country')}" if host.get("checked") else ""}

    async def email_job(e):
        r = await check_email(EmailCheckRequest(email=e))
        return {"type": "Email address", "subject": e, "verdict": r.get("risk", "caution"),
                "reasons": r.get("reasons", []), "details": "Sender" if sender and e == sender.lower().strip("<>") else ""}

    async def wallet_job(w):
        r = await check_crypto_address(CryptoCheckRequest(address=w["address"], chain=w["chain"]))
        reasons = [x for x in [r.get("category") and f"Category: {r['category']}", r.get("label") and f"Known as: {r['label']}", r.get("message") or r.get("error")] if x]
        reasons.insert(0, "Anyone asking you to send crypto to a wallet is a major red flag.")
        lvl = r.get("risk_level", "unknown")
        return {"type": "Crypto wallet", "subject": w["address"], "verdict": "high" if lvl in ("high", "medium") else "caution",
                "reasons": reasons, "details": w["chain"]}

    for p in clues["phones"]:
        r = analyze_phone(p)
        hit = await network_match("phone", p)
        if hit:
            r["reasons"] = [hit["reason"]] + r.get("reasons", [])
            if hit["reporters"] >= 2:
                r["risk"] = "high"
            elif r.get("risk") == "low":
                r["risk"] = "caution"
        findings.append({"type": "Phone number", "subject": r.get("formatted", p), "verdict": r.get("risk", "caution"),
                         "reasons": r.get("reasons", []),
                         "details": " · ".join(x for x in [r.get("country"), r.get("location"), r.get("line_type") if r.get("line_type") != "Unknown" else ""] if x)})

    jobs = [link_job(u) for u in clues["links"][:3]] + [email_job(e) for e in clues["emails"][:3]] + [wallet_job(w) for w in clues["wallets"][:2]]
    for res in await asyncio.gather(*jobs, return_exceptions=True):
        if isinstance(res, dict):
            findings.append(res)

    for m in clues["messaging_links"]:
        key = ("telegram", m["username"]) if m.get("username") else ("url", m["link"])
        hit = await network_match(*key)
        if hit:
            m["network_reason"] = hit["reason"]
            if hit["reporters"] >= 2:
                m["kind_verdict"] = "high"
        if m["kind"] == "group":
            findings.append({
                "type": f"{m['app']} group invite", "subject": m["link"], "verdict": "high",
                "reasons": [
                    f"Invites you into a {m['app']} group. Crypto \"investment clubs\", \"task job\" groups and fake trading mentors recruit people this way.",
                    "Never send money or crypto because of advice from a group of strangers, even if other members say they made money.",
                ],
                "details": "",
            })
        elif m["kind"] == "chat":
            findings.append({
                "type": "WhatsApp chat link", "subject": m["link"], "verdict": "caution",
                "reasons": [
                    f"Opens a private WhatsApp chat with {m['phone']}. The phone number is checked separately above.",
                    "Moving a conversation to WhatsApp hides it from the original platform's scam filters and reports.",
                ],
                "details": "",
            })
        else:
            findings.append({
                "type": "Telegram account", "subject": m.get("username") or m["link"], "verdict": "caution",
                "reasons": [
                    "Asks you to contact a private Telegram account. Telegram usernames are free and anonymous, so anyone can pretend to be anyone.",
                    "Real banks, government agencies and big companies don't do customer service through personal Telegram accounts.",
                ],
                "details": "",
            })
        if m.get("network_reason"):
            findings[-1]["reasons"].insert(0, m["network_reason"])
            if m.get("kind_verdict"):
                findings[-1]["verdict"] = "high"

    if clues["payment_methods"] or clues["cashtags"]:
        findings.append({
            "type": "Payment request",
            "subject": ", ".join(clues["payment_methods"] + clues["cashtags"]),
            "verdict": "high" if any(m in clues["payment_methods"] for m in ("Gift cards", "Bitcoin ATM", "Wire transfer", "Western Union", "MoneyGram", "Crypto")) else "caution",
            "reasons": ["Scammers ask for payments that can't be reversed. Real companies and agencies don't take gift cards, crypto or wire transfers for bills or fines."],
            "details": "Save these payment names. They help the police trace the scammer.",
        })

    high = [f for f in findings if f["verdict"] == "high"]
    caution = [f for f in findings if f["verdict"] == "caution"]
    if high:
        verdict = "high"
        summary = f"{len(high)} of {len(findings)} clues show warning signs. This looks like a scam. Don't reply, click, call back or pay."
    elif caution:
        verdict = "caution"
        summary = f"{len(caution)} of {len(findings)} clues need a closer look. Verify through the company's official website or phone number before you trust it."
    else:
        verdict = "low"
        summary = f"None of the {len(findings)} clues showed warning signs. Stay careful: new scams aren't on any list yet."

    return {"verdict": verdict, "summary": summary, "clues": clues, "findings": findings}


@app.post("/api/investigate")
async def investigate(payload: InvestigateRequest):
    return await investigate_text(payload.text, payload.sender[:200])


# ---------------------------------------------------------------------------
# ScamShield network: the shared scam list.
# Signed-in users can share the scammer's clues from a Detective Report (phone
# numbers, websites, emails, wallets, Telegram names, group links). Every check
# then looks clues up here. Nothing about the person reporting is shared: only
# the scam clues, a category and (optionally) their state.
#
# Uses Supabase (Postgres) over its REST API with the service key, which stays
# on the server. Settings on Render (scamshield-api > Environment):
#   SUPABASE_URL          e.g. https://abcd1234.supabase.co
#   SUPABASE_SERVICE_KEY  the project's secret key (sb_secret_...) or legacy service_role key
# Without them, the network is simply switched off.
# ---------------------------------------------------------------------------

from fastapi import Header, HTTPException

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
SUPABASE_SERVICE_KEY = (os.getenv("SUPABASE_SERVICE_KEY") or "").strip()

# Big, trusted sites that can never be put on the shared list.
NEVER_LIST_DOMAINS = {
    "google.com", "youtube.com", "facebook.com", "instagram.com", "whatsapp.com", "telegram.org",
    "amazon.com", "apple.com", "icloud.com", "microsoft.com", "live.com", "outlook.com", "office.com",
    "paypal.com", "venmo.com", "cash.app", "zellepay.com", "chase.com", "bankofamerica.com",
    "wellsfargo.com", "citi.com", "capitalone.com", "usps.com", "ups.com", "fedex.com", "irs.gov",
    "ssa.gov", "medicare.gov", "ftc.gov", "ic3.gov", "fbi.gov", "netflix.com", "x.com", "twitter.com",
    "tiktok.com", "linkedin.com", "indeed.com", "craigslist.org", "ebay.com", "walmart.com",
    "target.com", "coinbase.com", "binance.com", "kraken.com", "github.com", "wikipedia.org",
    "yahoo.com", "gmail.com", "cashcowai.online", "onrender.com",
}
# Short links and chat-app links: the whole link is the clue, not the domain.
WHOLE_URL_DOMAINS = {"bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "rb.gy", "shorturl.at", "tiny.cc",
                     "rebrand.ly", "ow.ly", "buff.ly", "wa.me", "chat.whatsapp.com", "t.me", "telegram.me"}
NETWORK_CATEGORIES = {
    "task_job": "Task or job scam", "romance": "Romance or new friend", "investment": "Investment or crypto",
    "delivery_toll": "Fake delivery or toll", "account_alert": "Fake bank or account alert",
    "government": "Government impersonation", "tech_support": "Tech support", "rental_marketplace": "Rental or Marketplace",
    "other": "Other",
}
US_STATES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA",
    "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR",
    "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
}


def network_enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)


def _sb_headers() -> dict:
    # Works with both kinds of Supabase keys: the newer "secret key" (sb_secret_...),
    # which goes only in the apikey header, and the older service_role key.
    h = {"apikey": SUPABASE_SERVICE_KEY, "Content-Type": "application/json"}
    if not SUPABASE_SERVICE_KEY.startswith("sb_"):
        h["Authorization"] = f"Bearer {SUPABASE_SERVICE_KEY}"
    return h


def _registered_domain(host: str) -> str:
    labels = [p for p in host.lower().strip(".").split(".") if p]
    if labels and labels[0] == "www":
        labels = labels[1:]
    if len(labels) >= 3 and labels[-2] in ("co", "com", "org", "net", "gov", "ac", "edu"):
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


def normalize_indicator(kind: str, value: str):
    """Turns a clue into one standard form so reports from different people match.
    Returns (kind, value) or None when the clue can't or shouldn't be listed."""
    from urllib.parse import urlparse
    v = (value or "").strip()
    if not v:
        return None
    if kind == "phone":
        try:
            import phonenumbers
            n = phonenumbers.parse(v, "US")
            if not phonenumbers.is_possible_number(n):
                return None
            return ("phone", phonenumbers.format_number(n, phonenumbers.PhoneNumberFormat.E164))
        except Exception:
            return None
    if kind in ("domain", "url"):
        raw = v if "://" in v else "https://" + v
        u = urlparse(raw)
        host = (u.hostname or "").lower()
        if not host or "." not in host:
            return None
        dom = _registered_domain(host)
        bare = host[4:] if host.startswith("www.") else host
        if bare in WHOLE_URL_DOMAINS or dom in WHOLE_URL_DOMAINS:
            path = (u.path or "").rstrip("/")
            if not path:
                return None
            return ("url", f"https://{bare}{path}")
        if dom in NEVER_LIST_DOMAINS:
            return None
        return ("domain", dom)
    if kind == "email":
        v = v.lower().strip("<>")
        if "@" not in v:
            return None
        local, _, dom = v.rpartition("@")
        if dom in ("ftc.gov", "ic3.gov", "fbi.gov", "cashcowai.online"):
            return None
        return ("email", v)
    if kind == "wallet":
        return ("wallet", v.lower() if v.lower().startswith("0x") else v)
    if kind == "telegram":
        name = v.lstrip("@").lower()
        return ("telegram", "@" + name) if len(name) >= 4 else None
    if kind == "cashtag":
        name = v.lstrip("$").lower()
        return ("cashtag", "$" + name) if len(name) >= 2 else None
    return None


async def _rpc(name: str, args: dict, timeout: float = 5):
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(f"{SUPABASE_URL}/rest/v1/rpc/{name}", headers=_sb_headers(), json=args)
    return resp


_match_cache: dict = {}


async def network_match(kind: str, value: str):
    """Looks a clue up on the shared scam list. Returns None when it isn't there
    (or the network is off), else {reporters, first_seen, categories, reason}."""
    if not network_enabled():
        return None
    norm = normalize_indicator(kind, value)
    if not norm:
        return None
    import time
    cached = _match_cache.get(norm)
    if cached and time.time() - cached[0] < 120:
        return cached[1]
    hit = None
    try:
        resp = await _rpc("lookup_indicators", {"p_items": [{"kind": norm[0], "value": norm[1]}]}, timeout=4)
        if resp.status_code == 200:
            rows = resp.json() or []
            if rows and rows[0].get("reporter_count", 0) > 0:
                r = rows[0]
                from datetime import datetime
                since = ""
                try:
                    since = datetime.fromisoformat(str(r["first_seen"]).replace("Z", "+00:00")).strftime("%b %Y")
                except Exception:
                    pass
                n = int(r["reporter_count"])
                cats = [NETWORK_CATEGORIES.get(c, c) for c in (r.get("categories") or []) if c]
                who = "1 person" if n == 1 else f"{n} people"
                reason = f"Reported as a scam by {who} on our shared scam list" + (f" since {since}" if since else "") + \
                         (f" ({', '.join(cats[:2]).lower()})" if cats else "") + "."
                op = r.get("operation") or None
                strength = n
                if op and int(op.get("clues", 0)) > 1:
                    reason += " " + describe_operation(op)
                    strength = max(n, int(op.get("reporters", 0)))
                hit = {"reporters": strength, "own_reporters": n, "first_seen": r.get("first_seen"),
                       "categories": cats, "operation": op, "reason": reason}
    except Exception:
        hit = None
    _match_cache[norm] = (time.time(), hit)
    return hit


async def _user_from_token(authorization: str) -> dict:
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Sign in to share with the network.")
    async with httpx.AsyncClient(timeout=8) as client:
        resp = await client.get(f"{SUPABASE_URL}/auth/v1/user",
                                headers={"apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {token}"})
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Your sign-in has expired. Sign in again and retry.")
    user = resp.json()
    if not user.get("id"):
        raise HTTPException(status_code=401, detail="Sign in to share with the network.")
    return user


class NetworkItem(BaseModel):
    type: str
    subject: str
    verdict: str = "caution"


class NetworkReportRequest(BaseModel):
    case_id: str = ""
    category: str = "other"
    state: str = ""
    items: list[NetworkItem]


def indicators_from_items(items) -> list:
    """Pulls the scam clues out of Detective Report items. Only items that
    showed warning signs (or 'be careful') are used."""
    out = []
    for it in items[:40]:
        if it.verdict not in ("high", "caution"):
            continue
        t = it.type.lower()
        subj = it.subject[:3000]
        if t in ("phone number",):
            out.append(normalize_indicator("phone", subj))
        elif t in ("link", "qr code link", "work platform link"):
            out.append(normalize_indicator("url", subj))
        elif t in ("email sender", "email address"):
            out.append(normalize_indicator("email", subj))
        elif t == "crypto wallet":
            out.append(normalize_indicator("wallet", subj))
        elif t == "telegram account":
            out.append(normalize_indicator("telegram", subj))
        elif "group invite" in t or t == "whatsapp chat link":
            out.append(normalize_indicator("url", subj))
        elif t in ("message", "payment request"):
            c = extract_clues(subj)
            out += [normalize_indicator("phone", p) for p in c["phones"]]
            out += [normalize_indicator("url", u) for u in c["links"]]
            out += [normalize_indicator("email", e) for e in c["emails"]]
            out += [normalize_indicator("wallet", w["address"]) for w in c["wallets"]]
            out += [normalize_indicator("cashtag", x) for x in c["cashtags"]]
            for m in c["messaging_links"]:
                out.append(normalize_indicator("telegram", m["username"]) if m.get("username")
                           else normalize_indicator("url", m["link"]))
    seen, unique = set(), []
    for x in out:
        if x and x not in seen:
            seen.add(x)
            unique.append({"kind": x[0], "value": x[1]})
    return unique[:50]


@app.post("/api/network/report")
async def network_report(payload: NetworkReportRequest, authorization: str = Header(default="")):
    if not network_enabled():
        raise HTTPException(status_code=503, detail="The ScamShield network isn't switched on yet.")
    user = await _user_from_token(authorization)
    indicators = indicators_from_items(payload.items)
    if not indicators:
        return {"shared": 0, "message": "There were no scam clues to share (phone numbers, websites, emails, wallets or usernames)."}
    category = payload.category if payload.category in NETWORK_CATEGORIES else "other"
    state = payload.state.upper() if payload.state.upper() in US_STATES else None
    resp = await _rpc("submit_report", {
        "p_user": user["id"], "p_case": payload.case_id[:40], "p_category": category,
        "p_state": state, "p_indicators": indicators,
    }, timeout=10)
    if resp.status_code != 200:
        if "rate_limited" in resp.text:
            raise HTTPException(status_code=429, detail="You've shared a lot today. Please try again tomorrow.")
        raise HTTPException(status_code=502, detail="Couldn't share right now. Please try again in a minute.")
    _match_cache.clear()
    return {"shared": len(indicators), "message": f"Shared {len(indicators)} scam clue{'s' if len(indicators) != 1 else ''} with the network. Thank you. This warns the next person."}


@app.get("/api/network/stats")
async def network_stats():
    if not network_enabled():
        return {"enabled": False}
    try:
        resp = await _rpc("network_stats", {}, timeout=5)
        data = resp.json() if resp.status_code == 200 else {}
        if isinstance(data, list):
            data = data[0] if data else {}
        return {"enabled": True, **(data or {})}
    except Exception:
        return {"enabled": True}


# ---------------------------------------------------------------------------
# Connection engine: clues reported together are linked into "operations"
# (see supabase_engine.sql). These helpers describe them in plain English.
# ---------------------------------------------------------------------------

_KIND_WORDS = {
    "phone": ("phone number", "phone numbers"), "domain": ("website", "websites"), "url": ("link", "links"),
    "email": ("email address", "email addresses"), "wallet": ("crypto wallet", "crypto wallets"),
    "telegram": ("Telegram account", "Telegram accounts"), "cashtag": ("Cash App name", "Cash App names"),
}


def describe_operation(op: dict) -> str:
    parts = []
    for kind in ("domain", "url", "phone", "email", "wallet", "telegram", "cashtag"):
        n = int((op.get("by_kind") or {}).get(kind, 0))
        if n:
            one, many = _KIND_WORDS[kind]
            parts.append(f"{n} {one if n == 1 else many}")
    if not parts:
        listed = "other clues"
    elif len(parts) == 1:
        listed = parts[0]
    else:
        listed = ", ".join(parts[:-1]) + " and " + parts[-1]
    people = int(op.get("reporters", 0))
    states = int(op.get("states", 0))
    who = "1 person" if people == 1 else f"{people} people"
    where = f" in {states} states" if states > 1 else ""
    return f"It's linked to scam operation #{op.get('operation_id')}: {listed}, reported by {who}{where}."


ADMIN_EMAILS = {e.strip().lower() for e in (os.getenv("NETWORK_ADMIN_EMAILS") or "cashcowaiadmin@gmail.com").split(",") if e.strip()}


@app.get("/api/network/operations")
async def network_operations(authorization: str = Header(default=""), limit: int = 20):
    """The biggest scam operations found so far. Owner accounts only
    (NETWORK_ADMIN_EMAILS on Render, comma-separated)."""
    if not network_enabled():
        raise HTTPException(status_code=503, detail="The network isn't switched on yet.")
    user = await _user_from_token(authorization)
    if (user.get("email") or "").lower() not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Owner accounts only.")
    resp = await _rpc("top_operations", {"p_limit": max(1, min(limit, 100))}, timeout=10)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Couldn't load operations. Was supabase_engine.sql run?")
    ops = resp.json() or []
    for op in ops:
        op["summary"] = describe_operation(op).replace("It's linked to scam operation", "Operation")
        op["categories"] = [NETWORK_CATEGORIES.get(c, c) for c in (op.get("categories") or [])]
    return {"operations": ops}


# ---------------------------------------------------------------------------
# Community room: members-only posts and replies (see supabase_community.sql).
# Guardrails: sign-in required, display names only (never emails), links are
# made unclickable, card and Social Security numbers are refused, posts that
# look like "fund recovery" or move-to-WhatsApp pitches wait for the team,
# three flags hide a post, daily posting limits, and owner moderation.
# ---------------------------------------------------------------------------

COMMUNITY_TOPICS = {"tips": "Tips", "spotted": "Scam I spotted", "question": "Question", "feedback": "App feedback"}
_RESERVED_NAME_WORDS = ("scamshield", "scamguard", "cashcow", "admin", "moderator", "support", "official")
_NAME_RE = _re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _.\-]{1,22}[A-Za-z0-9]$")
_URL_RE = _re.compile(r"(?i)\b(?:https?://|www\.)[^\s<>\"']+|\b(?:[a-z0-9-]+\.)+[a-z]{2,24}(?:/[^\s<>\"']*)?")
_SSN_RE = _re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
_CARD_RE = _re.compile(r"\b(?:\d[ -]?){13,19}\b")
_HOLD_RE = _re.compile(
    r"(?i)(recover(?:y)?\s+(?:your|my|the|lost|stolen)?\s*(?:money|funds|crypto|bitcoin|assets)|fund[s]?\s+recovery|"
    r"recovery\s+(?:expert|agent|service|company|specialist|hacker)|(?:hire|contact)\s+(?:a|this|the)?\s*hacker|"
    r"(?:dm|text|message|whatsapp|telegram)\s+me\b|(?:contact|reach)\s+(?:him|her|them|me)\s+(?:on|via|through)\s+(?:whatsapp|telegram|signal)|"
    r"wa\.me/|t\.me/|guaranteed\s+(?:profit|returns?|income)|investment\s+(?:mentor|manager|opportunity))")


def _luhn_ok(digits: str) -> bool:
    total, alt = 0, False
    for ch in reversed(digits):
        d = int(ch)
        if alt:
            d *= 2
            if d > 9:
                d -= 9
        total += d
        alt = not alt
    return total % 10 == 0


def community_check_text(text: str) -> tuple[str, bool]:
    """Cleans a post or reply. Returns (safe_text, hold_for_review).
    Raises HTTPException when it contains a card or Social Security number."""
    t = (text or "").replace("\r\n", "\n").strip()
    t = _re.sub(r"\n{3,}", "\n\n", t)
    if _SSN_RE.search(t):
        raise HTTPException(status_code=400, detail="That looks like a Social Security number. Please remove it before posting. Never share it here.")
    for m in _CARD_RE.finditer(t):
        digits = _re.sub(r"\D", "", m.group(0))
        if 13 <= len(digits) <= 19 and _luhn_ok(digits):
            raise HTTPException(status_code=400, detail="That looks like a card number. Please remove it before posting. Never share it here.")
    hold = bool(_HOLD_RE.search(t))

    def defang(m):
        s = _re.sub(r"(?i)^http", "hxxp", m.group(0))
        if "://" in s:
            scheme, rest = s.split("://", 1)
            host, slash, path = rest.partition("/")
            return f"{scheme}://{host.replace('.', '[.]')}{slash}{path}"
        host, slash, path = s.partition("/")
        return host.replace(".", "[.]") + slash + path

    return _URL_RE.sub(defang, t), hold


def _community_on():
    if not network_enabled():
        raise HTTPException(status_code=503, detail="The community isn't switched on yet.")


def _is_admin(user: dict) -> bool:
    return (user.get("email") or "").lower() in ADMIN_EMAILS


def _community_error(resp, default: str):
    text = resp.text or ""
    for key, status, msg in (
        ("name_taken", 409, "That name is taken. Please pick another one."),
        ("not_member", 403, "Pick a display name to join the community first."),
        ("banned", 403, "Your account can't post in the community."),
        ("rate_limited", 429, "You've posted a lot today. Please try again tomorrow."),
        ("not_found", 404, "That post isn't available any more."),
    ):
        if key in text:
            raise HTTPException(status_code=status, detail=msg)
    raise HTTPException(status_code=502, detail=default)


async def _community_rpc(name: str, args: dict, default: str):
    resp = await _rpc(name, args, timeout=10)
    if resp.status_code not in (200, 204):
        _community_error(resp, default)
    return resp.json() if resp.content else None


@app.get("/api/community/me")
async def community_me(authorization: str = Header(default="")):
    _community_on()
    user = await _user_from_token(authorization)
    member = await _community_rpc("community_me", {"p_user": user["id"]}, "Couldn't open the community. Was supabase_community.sql run?")
    return {"member": member, "is_owner": _is_admin(user), "topics": COMMUNITY_TOPICS}


class CommunityJoin(BaseModel):
    display_name: str


@app.post("/api/community/join")
async def community_join(payload: CommunityJoin, authorization: str = Header(default="")):
    _community_on()
    user = await _user_from_token(authorization)
    name = _re.sub(r"\s+", " ", payload.display_name or "").strip()
    if not _NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Use 3 to 24 letters or numbers (spaces, dots, dashes and underscores are OK in the middle).")
    admin = _is_admin(user)
    squashed = _re.sub(r"[^a-z0-9]", "", name.lower())
    if not admin and any(w in squashed for w in _RESERVED_NAME_WORDS):
        raise HTTPException(status_code=400, detail="That name could be mistaken for our team. Please pick another one.")
    if "@" in name or _re.search(r"\d{7,}", name):
        raise HTTPException(status_code=400, detail="Don't use your email or phone number as your name.")
    member = await _community_rpc("community_join", {"p_user": user["id"], "p_name": name, "p_team": admin}, "Couldn't save your name. Please try again.")
    return {"member": member}


@app.get("/api/community/posts")
async def community_posts(topic: str = "", before: int = 0, authorization: str = Header(default="")):
    _community_on()
    user = await _user_from_token(authorization)
    posts = await _community_rpc("community_list", {
        "p_viewer": user["id"], "p_admin": _is_admin(user),
        "p_topic": topic if topic in COMMUNITY_TOPICS else None,
        "p_before": before if before > 0 else None, "p_limit": 20,
    }, "Couldn't load posts. Please try again.")
    return {"posts": posts or [], "more": len(posts or []) == 20}


@app.get("/api/community/posts/{post_id}")
async def community_thread(post_id: int, authorization: str = Header(default="")):
    _community_on()
    user = await _user_from_token(authorization)
    thread = await _community_rpc("community_thread", {"p_viewer": user["id"], "p_admin": _is_admin(user), "p_post": post_id},
                                  "Couldn't load that post. Please try again.")
    if not thread:
        raise HTTPException(status_code=404, detail="That post isn't available any more.")
    return thread


class CommunityPost(BaseModel):
    topic: str = "tips"
    title: str
    body: str


HELD_MESSAGE = ("Your post is waiting for a quick review by our team before others can see it. "
                "We check posts that mention recovering money, hackers, or moving to WhatsApp or Telegram, "
                "because scammers use those to target people who were already scammed.")


@app.post("/api/community/posts")
async def community_new_post(payload: CommunityPost, authorization: str = Header(default="")):
    _community_on()
    user = await _user_from_token(authorization)
    if payload.topic not in COMMUNITY_TOPICS:
        raise HTTPException(status_code=400, detail="Pick a topic.")
    title, hold1 = community_check_text(payload.title)
    body, hold2 = community_check_text(payload.body)
    if not 3 <= len(title) <= 120:
        raise HTTPException(status_code=400, detail="Give your post a title (up to 120 characters).")
    if not 10 <= len(body) <= 2000:
        raise HTTPException(status_code=400, detail="Write at least a sentence (up to 2,000 characters).")
    held = (hold1 or hold2) and not _is_admin(user)
    pid = await _community_rpc("community_post", {"p_user": user["id"], "p_topic": payload.topic, "p_title": title,
                                                  "p_body": body, "p_review": held}, "Couldn't post right now. Please try again.")
    return {"id": pid, "held": held, "message": HELD_MESSAGE if held else "Posted. Thanks for helping the community."}


class CommunityReply(BaseModel):
    body: str


@app.post("/api/community/posts/{post_id}/replies")
async def community_new_reply(post_id: int, payload: CommunityReply, authorization: str = Header(default="")):
    _community_on()
    user = await _user_from_token(authorization)
    body, hold = community_check_text(payload.body)
    if not 2 <= len(body) <= 1000:
        raise HTTPException(status_code=400, detail="Replies can be up to 1,000 characters.")
    held = hold and not _is_admin(user)
    rid = await _community_rpc("community_reply", {"p_user": user["id"], "p_post": post_id, "p_body": body, "p_review": held},
                               "Couldn't reply right now. Please try again.")
    return {"id": rid, "held": held, "message": HELD_MESSAGE.replace("post is", "reply is") if held else "Reply posted."}


class CommunityTarget(BaseModel):
    kind: str
    id: int
    value: bool = True


def _check_kind(kind: str):
    if kind not in ("post", "reply"):
        raise HTTPException(status_code=400, detail="Unknown item.")


@app.post("/api/community/flag")
async def community_flag(payload: CommunityTarget, authorization: str = Header(default="")):
    _community_on()
    _check_kind(payload.kind)
    user = await _user_from_token(authorization)
    await _community_rpc("community_flag", {"p_user": user["id"], "p_kind": payload.kind, "p_id": payload.id},
                         "Couldn't flag that right now.")
    return {"message": "Thanks. Our team will take a look."}


@app.post("/api/community/delete")
async def community_delete(payload: CommunityTarget, authorization: str = Header(default="")):
    _community_on()
    _check_kind(payload.kind)
    user = await _user_from_token(authorization)
    ok = await _community_rpc("community_delete", {"p_user": user["id"], "p_admin": _is_admin(user),
                                                   "p_kind": payload.kind, "p_id": payload.id}, "Couldn't delete that right now.")
    if not ok:
        raise HTTPException(status_code=403, detail="You can only delete your own posts.")
    return {"message": "Deleted."}


async def _owner(authorization: str) -> dict:
    _community_on()
    user = await _user_from_token(authorization)
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Owner accounts only.")
    return user


@app.post("/api/community/moderate")
async def community_moderate(payload: CommunityTarget, authorization: str = Header(default="")):
    """Owner: value=true hides the item, value=false shows it again."""
    _check_kind(payload.kind)
    await _owner(authorization)
    await _community_rpc("community_moderate", {"p_kind": payload.kind, "p_id": payload.id, "p_hidden": payload.value},
                         "Couldn't update that right now.")
    return {"message": "Hidden." if payload.value else "Visible again."}


@app.post("/api/community/ban")
async def community_ban(payload: CommunityTarget, authorization: str = Header(default="")):
    """Owner: stops (value=true) or allows (value=false) the author of a post or reply."""
    _check_kind(payload.kind)
    await _owner(authorization)
    await _community_rpc("community_ban", {"p_kind": payload.kind, "p_id": payload.id, "p_banned": payload.value},
                         "Couldn't update that member right now.")
    return {"message": "That member can no longer post, and their posts are hidden." if payload.value else "That member can post again."}


@app.get("/api/community/review")
async def community_review(authorization: str = Header(default="")):
    await _owner(authorization)
    return await _community_rpc("community_review_queue", {}, "Couldn't load the review list.")
