from datetime import datetime, timedelta, timezone
import bcrypt
import jwt as pyjwt

ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_DAYS = 30


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(user_id: str, secret: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return pyjwt.encode({"sub": user_id, "exp": expire, "type": "access"}, secret, algorithm="HS256")


def create_refresh_token(user_id: str, secret: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    return pyjwt.encode({"sub": user_id, "exp": expire, "type": "refresh"}, secret, algorithm="HS256")


def decode_token(token: str, secret: str) -> dict:
    return pyjwt.decode(token, secret, algorithms=["HS256"])
