import asyncio
import hashlib
import hmac
import json
from pathlib import Path

from fastapi import Header, HTTPException, Request
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from .config import get_settings

_firebase_initialized = False
_google_req = google_requests.Request()


def _init_firebase_admin() -> bool:
    global _firebase_initialized
    if _firebase_initialized:
        return True
    s = get_settings()
    raw = s.firebase_credentials_path.strip()
    if not raw:
        return False

    import firebase_admin
    from firebase_admin import credentials

    if not firebase_admin._apps:
        if raw.startswith("{"):
            cred = credentials.Certificate(json.loads(raw))
        elif Path(raw).is_file():
            cred = credentials.Certificate(raw)
        else:
            return False
        opts = {"projectId": s.firebase_project_id} if s.firebase_project_id else None
        firebase_admin.initialize_app(cred, opts)
    _firebase_initialized = True
    return True


async def require_auth(authorization: str | None = Header(default=None)) -> dict:
    s = get_settings()
    if s.auth_disabled:
        return {"uid": "dev-user", "auth": "disabled"}
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    token = authorization.split(" ", 1)[1]
    if _init_firebase_admin():
        from firebase_admin import auth

        try:
            return await asyncio.to_thread(auth.verify_id_token, token)
        except Exception as exc:
            raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from exc

    if s.firebase_project_id:
        try:
            return await asyncio.to_thread(
                id_token.verify_firebase_token, token, _google_req, audience=s.firebase_project_id
            )
        except Exception as exc:
            raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from exc

    raise HTTPException(status_code=500, detail="Firebase auth not configured (set FIREBASE_PROJECT_ID)")


def verify_webhook_signature(payload: bytes, signature_header: str | None, secret: str) -> bool:
    if not secret:
        return True
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)


async def verify_github_webhook(request: Request, x_hub_signature_256: str | None = Header(default=None)) -> bytes:
    body = await request.body()
    secret = get_settings().github_webhook_secret
    if not verify_webhook_signature(body, x_hub_signature_256, secret):
        raise HTTPException(status_code=401, detail="Invalid GitHub webhook signature")
    return body
