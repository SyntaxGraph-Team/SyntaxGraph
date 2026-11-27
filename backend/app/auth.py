import hashlib
import hmac
from fastapi import Header, HTTPException, Request
from .config import get_settings

_firebase_initialized = False


def _init_firebase() -> bool:
    global _firebase_initialized
    if _firebase_initialized:
        return True
    s = get_settings()
    if not s.firebase_credentials_path and not s.firebase_project_id:
        return False
    import firebase_admin
    from firebase_admin import credentials

    if not firebase_admin._apps:
        cred = credentials.Certificate(s.firebase_credentials_path) if s.firebase_credentials_path else None
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
    if not _init_firebase():
        raise HTTPException(status_code=500, detail="Firebase credentials not configured")
    from firebase_admin import auth

    token = authorization.split(" ", 1)[1]
    try:
        return auth.verify_id_token(token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from exc


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
