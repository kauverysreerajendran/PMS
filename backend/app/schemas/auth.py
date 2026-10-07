from pydantic import BaseModel


class LoginRequest(BaseModel):
    identifier: str
    password: str
    property_code: str | None = None


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    mobile: str | None = None
    role: str
    property_id: int


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    user: UserResponse

class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class LogoutRequest(BaseModel):
    refresh_token: str

class ForgotPasswordRequest(BaseModel):
    email: str


class ForgotPasswordResponse(BaseModel):
    message: str
    masked_email: str | None = None

    # DEV ONLY - remove when real email service is connected
    reset_token: str | None = None

class ResetPasswordRequest(BaseModel):
    reset_token: str
    new_password: str
    confirm_password: str


class ResetPasswordResponse(BaseModel):
    message: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


class ChangePasswordResponse(BaseModel):
    message: str