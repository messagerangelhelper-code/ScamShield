import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="ScamShield API")

# Allow the frontend dev server (and your deployed domain) to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "https://scamshield.global",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


class CheckRequest(BaseModel):
    text: str


class CryptoCheckRequest(BaseModel):
    address: str
    chain: str = "ethereum"  # ethereum, bitcoin, bnb, tron


PUBLICAML_URL = "https://intelapi.publicaml.org/v1/enrich"


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
        "phrases": ["gift card", "wire transfer", "western union", "cash app",
                    "zelle", "crypto", "bitcoin", "usdt"],
        "weight": 25,
        "message": "Requests an untraceable or irreversible payment method",
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
}


def analyze_text(text: str) -> dict:
    lowered = text.lower()
    score = 0
    flags = []

    for category, rule in RED_FLAGS.items():
        for phrase in rule["phrases"]:
            if phrase in lowered:
                score += rule["weight"]
                flags.append(rule["message"])
                break  # only count each category once

    score = min(score, 100)

    if score >= 50:
        level = "high"
    elif score >= 20:
        level = "medium"
    else:
        level = "low"

    return {"risk_score": score, "risk_level": level, "flags": flags}


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
