import os
import httpx

_api_key = os.getenv("FIREBASE_API_KEY")
if not _api_key:
    raise RuntimeError("FIREBASE_API_KEY environment variable is required")

FIREBASE_LOOKUP_URL = f"https://identitytoolkit.googleapis.com/v1/accounts:lookup?key={_api_key}"


def verify_firebase_token(id_token: str) -> dict:
    resp = httpx.post(FIREBASE_LOOKUP_URL, json={"idToken": id_token}, timeout=10)
    resp.raise_for_status()
    users = resp.json().get("users", [])
    if not users:
        raise ValueError("Token invalid")
    user = users[0]
    return {
        "email": user.get("email"),
        "name": user.get("displayName"),
        "uid": user.get("localId"),
    }
