from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str

class UserOut(BaseModel):
    id: int
    email: str
    name: str

    model_config = {"from_attributes": True}

class Token(BaseModel):
    access_token: str
    token_type: str
