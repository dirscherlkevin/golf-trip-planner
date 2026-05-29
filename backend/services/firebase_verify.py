import os
import json
import logging

logger = logging.getLogger(__name__)

_app = None

def _init():
    global _app
    if _app is not None:
        return
    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT")
    if not service_account_json:
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT env var not set")
    import firebase_admin
    from firebase_admin import credentials
    cred = credentials.Certificate(json.loads(service_account_json))
    _app = firebase_admin.initialize_app(cred)


def verify_firebase_token(id_token: str) -> dict:
    """Verify a Firebase ID token. Returns decoded payload with email, name, etc."""
    _init()
    from firebase_admin import auth
    decoded = auth.verify_id_token(id_token)
    return decoded
