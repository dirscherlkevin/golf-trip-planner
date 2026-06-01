"""
Verify Firebase ID tokens using PyJWT + Google's public x509 certificates.
Keys are fetched once at startup and cached, so token verification is purely local
with no per-request outbound HTTP calls (which caused timeouts on Render free tier).
"""
import os
import time
import logging
import httpx
import jwt
from cryptography.x509 import load_pem_x509_certificate
from cryptography.hazmat.backends import default_backend

logger = logging.getLogger(__name__)

FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "golftrip-af5aa")
GOOGLE_CERTS_URL = (
    "https://www.googleapis.com/robot/v1/metadata/x509/"
    "securetoken@system.gserviceaccount.com"
)

_cache = {"certs": {}, "expires_at": 0}


def _fetch_certs(force: bool = False) -> dict:
    """Fetch Google's public x509 certs, using cache when fresh."""
    now = time.time()
    if not force and _cache["certs"] and now < _cache["expires_at"]:
        return _cache["certs"]

    logger.info("Fetching Firebase public keys from Google...")
    resp = httpx.get(GOOGLE_CERTS_URL, timeout=10)
    resp.raise_for_status()

    _cache["certs"] = resp.json()
    # Cache for 1 hour regardless of response headers (Google sets 6+ hours normally)
    _cache["expires_at"] = now + 3600
    logger.info("Firebase public keys cached (%d keys)", len(_cache["certs"]))
    return _cache["certs"]


def prefetch_certs():
    """Call at startup to warm the cache before any user requests arrive."""
    try:
        _fetch_certs(force=True)
    except Exception as e:
        logger.warning("Could not prefetch Firebase certs: %s — will retry on first auth", e)


def verify_firebase_token(id_token: str) -> dict:
    """Verify a Firebase ID token. Returns decoded payload with email, name, etc."""
    # Decode header to get key ID without verifying (safe — just reads header)
    try:
        header = jwt.get_unverified_header(id_token)
    except jwt.DecodeError as e:
        raise ValueError(f"Invalid token format: {e}") from e

    kid = header.get("kid")
    if not kid:
        raise ValueError("Token missing 'kid' header")

    certs = _fetch_certs()

    # If kid not in cache, certs may have rotated — force refresh once
    if kid not in certs:
        certs = _fetch_certs(force=True)
    if kid not in certs:
        raise ValueError(f"Unknown key id: {kid}")

    # Convert PEM x509 cert → public key
    cert_pem = certs[kid].encode("utf-8")
    cert = load_pem_x509_certificate(cert_pem, default_backend())
    public_key = cert.public_key()

    # Verify signature, expiry, audience, and issuer
    decoded = jwt.decode(
        id_token,
        public_key,
        algorithms=["RS256"],
        audience=FIREBASE_PROJECT_ID,
        issuer=f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}",
    )
    return decoded
