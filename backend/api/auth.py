from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from models.user import User
from schemas.user import UserCreate, UserOut, Token, GoogleLoginIn
from services.auth import hash_password, verify_password, create_access_token, get_user_from_token

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    user = get_user_from_token(token, db)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return user

@router.post("/register", response_model=Token)
def register(data: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=data.email,
        name=data.name,
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return Token(access_token=create_access_token(user.id), token_type="bearer")

@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid credentials")
    return Token(access_token=create_access_token(user.id), token_type="bearer")

@router.get("/debug")
def debug_info(db: Session = Depends(get_db)):
    import httpx, time
    from services.firebase_verify import FIREBASE_LOOKUP_URL
    result = {}

    # 1. Test DB
    t0 = time.time()
    try:
        db.execute(__import__('sqlalchemy').text("SELECT 1"))
        result["db_ok"] = True
    except Exception as e:
        result["db_ok"] = False
        result["db_error"] = f"{type(e).__name__}: {e}"
    result["db_ms"] = round((time.time() - t0) * 1000)

    # 2. Test Firebase accounts:lookup POST
    t0 = time.time()
    try:
        r = httpx.post(FIREBASE_LOOKUP_URL, json={"idToken": "fake"}, timeout=8)
        result["firebase_status"] = r.status_code
        result["firebase_error_code"] = r.json().get("error", {}).get("message", "none")
    except Exception as e:
        result["firebase_error"] = f"{type(e).__name__}: {e}"
    result["firebase_ms"] = round((time.time() - t0) * 1000)

    # 3. Test user table query
    t0 = time.time()
    try:
        count = db.query(User).count()
        result["user_count"] = count
        result["db_query_ok"] = True
    except Exception as e:
        result["db_query_ok"] = False
        result["db_query_error"] = f"{type(e).__name__}: {e}"
    result["db_query_ms"] = round((time.time() - t0) * 1000)

    return result

@router.post("/google", response_model=Token)
def google_login(data: GoogleLoginIn, db: Session = Depends(get_db)):
    from services.firebase_verify import verify_firebase_token
    import uuid, logging
    logger = logging.getLogger(__name__)
    try:
        firebase_user = verify_firebase_token(data.id_token)
    except Exception as e:
        logger.error("Firebase token verification failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=401, detail=f"Token verify failed: {type(e).__name__}: {e}")
    email = firebase_user.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        display_name = firebase_user.get("name") or email.split("@")[0]
        user = User(
            email=email,
            name=display_name,
            hashed_password=hash_password(str(uuid.uuid4())),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return Token(access_token=create_access_token(user.id), token_type="bearer")

@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user

class HandicapUpdate(BaseModel):
    handicap: Optional[float] = None

@router.patch("/me/handicap")
def update_my_handicap(body: HandicapUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    user.handicap = body.handicap
    db.commit()
    db.refresh(user)
    return {"handicap": user.handicap}
