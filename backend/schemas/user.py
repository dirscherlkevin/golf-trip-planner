from pydantic import BaseModel, EmailStr
from typing import Optional

class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str

class UserOut(BaseModel):
    id: int
    email: str
    name: str
    handicap: Optional[float] = None

    model_config = {"from_attributes": True}

class Token(BaseModel):
    access_token: str
    token_type: str

class GoogleLoginIn(BaseModel):
    id_token: str
