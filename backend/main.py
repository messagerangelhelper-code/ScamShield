{
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


@app.post("/api/url-check")
async def check_urls(payload: URLCheckRequest):
    """
    Checks URLs against three independent free/low-cost sources, since no
    single database catches everything — especially brand-new scam sites
    that haven't been reported anywhere yet:
      - Google Safe Browsing (malware, phishing, unwanted software)
      - VirusTotal (aggregates 70+ security engines' verdicts)
      - PhishTank (community-reported phishing, often faster on new scams)

    Returns which sources are actually configured, and a combined verdict.
    A URL is flagged if ANY configured source flags it.
    """
    if not payload.urls:
        return {"configured": False, "flagged_urls": [], "sources_checked": []}

    url = payload.urls[0]  # primary URL for VirusTotal/PhishTank single-URL checks
    sources_checked = []
    flagged_urls = set()
    details = {}

    # --- Google Safe Browsing ---
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
                # Submit the URL for analysis
                submit_resp = await client.post(
                    VIRUSTOTAL_URL,
                    headers={"x-apikey": VIRUSTOTAL_API_KEY},
                    data={"url": url},
                )
                submit_resp.raise_for_status()
                analysis_id = submit_resp.json()["data"]["id"]

                # Fetch the analysis result
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

    # --- PhishTank ---
    sources_checked.append("PhishTank")  # works without a key, just lower rate limit
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            form_data = {"url": url, "format": "json"}
            if PHISHTANK_API_KEY:
                form_data["app_key"] = PHISHTANK_API_KEY
            resp = await client.post(PHISHTANK_URL, data=form_data)
            resp.raise_for_status()
            result = resp.json().get("results", {})
            if result.get("in_database") and result.get("valid"):
                flagged_urls.add(url)
            details["phishtank"] = {"in_database": result.get("in_database", False)}
    except httpx.HTTPError:
        details["phishtank"] = {"error": "unreachable"}

    return {
        "configured": len(sources_checked) > 0,
        "sources_checked": sources_checked,
        "flagged_urls": list(flagged_urls),
        "details": details,
    }
