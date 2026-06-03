from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from models.user import User
from schemas.user import UserCreate, UserOut, Token, GoogleLoginIn
from services.auth import hash_password, verify_password, create_access_token, get_user_from_token
import threading
import time as _time

router = APIRouter()

_auth_rl_lock = threading.Lock()
_auth_rl: dict = {}  # email -> [timestamps]

def _check_auth_rate_limit(email: str):
    now = _time.time()
    cutoff = now - 300  # 5-minute window
    with _auth_rl_lock:
        calls = [t for t in _auth_rl.get(email, []) if t > cutoff]
        if len(calls) >= 10:
            raise HTTPException(status_code=429, detail="Too many attempts. Please wait a few minutes.")
        calls.append(now)
        _auth_rl[email] = calls
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    user = get_user_from_token(token, db)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return user

@router.post("/register", response_model=Token)
def register(data: UserCreate, db: Session = Depends(get_db)):
    _check_auth_rate_limit(data.email.lower())
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
    _check_auth_rate_limit(form.username.lower())
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid credentials")
    return Token(access_token=create_access_token(user.id), token_type="bearer")


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

class NameUpdate(BaseModel):
    name: str

@router.patch("/me/name")
def update_my_name(body: NameUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    user.name = name
    db.commit()
    db.refresh(user)
    return {"name": user.name}
