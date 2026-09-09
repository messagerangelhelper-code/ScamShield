import os
from dotenv import load_dotenv
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="ScamShield API")

# Allow the frontend dev server (and your deployed domain) to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "https://scamshield.global",
        "*",  # TEMP: allow all origins until the frontend URL is confirmed, then narrow this back down
    ],
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


PUBLICAML_URL = "https://intelapi.publicaml.org/v1/enrich"

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
        "phrases": ["whatsapp", "text me directly", "call me instead", "email me at"],
        "weight": 15,
        "message": "Tries to move the conversation off the platform",
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


@app.post("/api/crypto-check")
async def check_crypto_address(payload: CryptoCheckRequest):
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
