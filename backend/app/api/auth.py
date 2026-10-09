from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, create_refresh_token, create_password_reset_token, hash_password, hash_password_reset_token, hash_refresh_token, verify_password, hash_password, verify_password
from app.db.database import get_db
from app.models.user import LoginHistory, PasswordReset, Property, User, UserSession
from app.core.dependencies import get_current_user, get_front_office_manager
from app.schemas.auth import LoginRequest, LoginResponse, LogoutRequest, RefreshRequest, RefreshResponse, ForgotPasswordRequest, ForgotPasswordResponse, ResetPasswordRequest, ResetPasswordResponse, ChangePasswordRequest, ChangePasswordResponse

from datetime import datetime, timedelta, timezone

from app.core.config import settings

router = APIRouter(tags=["Authentication"])

@router.get("/front-office-staff")
async def list_front_office_staff(current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.property_id == current_user.property_id, User.role.in_(["front_office_manager", "front_desk_agent"])).order_by(User.username))
    return [{"id": u.id, "username": u.username, "email": u.email, "mobile": u.mobile, "role": u.role, "property_id": u.property_id, "is_active": u.is_active, "is_locked": u.is_locked} for u in result.scalars().all()]

MAX_FAILED_ATTEMPTS = 5


@router.post(
    "/login",
    response_model=LoginResponse,
)
async def login(
    data: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    identifier = data.identifier.strip()

    # Find user using username, email, or mobile
    result = await db.execute(
        select(User).where(
            or_(
                User.username == identifier,
                User.email == identifier.lower(),
                User.mobile == identifier,
            )
        )
    )

    user = result.scalar_one_or_none()

    # User doesn't exist
    if user is None:
        db.add(
            LoginHistory(
                user_id=None,
                identifier=identifier,
                success=False,
            )
        )

        await db.commit()

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username/email/mobile or password",
        )

    # Disabled account
    if not user.is_active:
        db.add(
            LoginHistory(
                user_id=user.id,
                identifier=identifier,
                success=False,
            )
        )

        await db.commit()

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    # Locked account
    if user.is_locked:
        db.add(
            LoginHistory(
                user_id=user.id,
                identifier=identifier,
                success=False,
            )
        )

        await db.commit()

        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account is locked",
        )

    # Check password
    if not verify_password(
        data.password,
        user.password_hash,
    ):
        user.failed_login_attempts += 1

        if user.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
            user.is_locked = True

        db.add(
            LoginHistory(
                user_id=user.id,
                identifier=identifier,
                success=False,
            )
        )

        await db.commit()

        if user.is_locked:
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail="Account locked after too many failed login attempts",
            )

        remaining = (
            MAX_FAILED_ATTEMPTS
            - user.failed_login_attempts
        )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid password. {remaining} attempts remaining.",
        )

    # Validate property (an owner may sign in before creating a hotel)
    property_obj = None
    if user.property_id is not None:
        property_result = await db.execute(
            select(Property).where(
                Property.id == user.property_id
            )
        )
        property_obj = property_result.scalar_one_or_none()

    owner_without_hotel = user.role == "owner" and user.property_id is None

    if not owner_without_hotel and (property_obj is None or not property_obj.is_active):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Property is unavailable",
        )

    # If property code was supplied, validate it
    if data.property_code:
        if (
            property_obj is None
            or property_obj.property_code.lower()
            != data.property_code.strip().lower()
        ):
            db.add(
                LoginHistory(
                    user_id=user.id,
                    identifier=identifier,
                    success=False,
                )
            )

            await db.commit()

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid property code",
            )

    # Successful login
    user.failed_login_attempts = 0
    user.is_locked = False

    db.add(
        LoginHistory(
            user_id=user.id,
            identifier=identifier,
            success=True,
        )
    )

    access_token = create_access_token(
        user_id=user.id,
        role=user.role,
        property_id=user.property_id,
    )

    refresh_token = create_refresh_token()

    refresh_expires_at = (
        datetime.now(timezone.utc).replace(tzinfo=None)
        + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )

    session = UserSession(
        user_id=user.id,
        refresh_token_hash=hash_refresh_token(refresh_token),
        expires_at=refresh_expires_at,
        revoked=False,
    )

    db.add(session)

    await db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "mobile": user.mobile,
            "role": user.role,
            "property_id": user.property_id,
        },
    }

@router.get("/me")
async def get_my_profile(
    current_user: User = Depends(get_current_user),
):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "mobile": current_user.mobile,
        "role": current_user.role,
        "property_id": current_user.property_id,
        "is_active": current_user.is_active,
    }

@router.post(
    "/refresh",
    response_model=RefreshResponse,
)
async def refresh_access_token(
    data: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    token_hash = hash_refresh_token(data.refresh_token)

    result = await db.execute(
        select(UserSession).where(
            UserSession.refresh_token_hash == token_hash,
            UserSession.revoked == False,
        )
    )

    session = result.scalar_one_or_none()

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    if session.expires_at <= now:
        session.revoked = True
        await db.commit()

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired",
        )

    user_result = await db.execute(
        select(User).where(
            User.id == session.user_id
        )
    )

    user = user_result.scalar_one_or_none()

    if user is None or not user.is_active:
        session.revoked = True
        await db.commit()

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User is unavailable",
        )

    if user.is_locked:
        session.revoked = True
        await db.commit()

        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account is locked",
        )

    # Create new access token
    new_access_token = create_access_token(
        user_id=user.id,
        role=user.role,
        property_id=user.property_id,
    )

    # Rotate refresh token
    new_refresh_token = create_refresh_token()

    session.refresh_token_hash = hash_refresh_token(
        new_refresh_token
    )

    session.expires_at = (
        now
        + timedelta(
            days=settings.REFRESH_TOKEN_EXPIRE_DAYS
        )
    )

    await db.commit()

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
    }

@router.post("/logout")
async def logout(
    data: LogoutRequest,
    db: AsyncSession = Depends(get_db),
):
    token_hash = hash_refresh_token(
        data.refresh_token
    )

    result = await db.execute(
        select(UserSession).where(
            UserSession.refresh_token_hash == token_hash
        )
    )

    session = result.scalar_one_or_none()

    if session is not None:
        session.revoked = True
        await db.commit()

    return {
        "message": "Logged out successfully"
    }

@router.post(
    "/forgot-password",
    response_model=ForgotPasswordResponse,
)
async def forgot_password(
    data: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    email = data.email.strip().lower()

    result = await db.execute(
        select(User).where(
            User.email == email
        )
    )

    user = result.scalar_one_or_none()

    # Same generic response should eventually be used whether
    # or not the account exists, to prevent account enumeration.
    generic_message = (
        "If an account exists for this email, "
        "password reset instructions have been generated."
    )

    if user is None:
        return {
            "message": generic_message,
            "masked_email": None,
            "reset_token": None,
        }

    # Invalidate any previous unused reset tokens
    old_tokens_result = await db.execute(
        select(PasswordReset).where(
            PasswordReset.user_id == user.id,
            PasswordReset.used == False,
        )
    )

    old_tokens = old_tokens_result.scalars().all()

    for old_token in old_tokens:
        old_token.used = True

    # Generate secure one-time reset token
    reset_token = create_password_reset_token()

    token_hash = hash_password_reset_token(
        reset_token
    )

    expires_at = (
        datetime.now(timezone.utc).replace(tzinfo=None)
        + timedelta(minutes=15)
    )

    password_reset = PasswordReset(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
        used=False,
    )

    db.add(password_reset)

    await db.commit()

    # Mask email for display
    local_part, domain = user.email.split("@", 1)

    if len(local_part) <= 2:
        masked_local = local_part[0] + "*"
    else:
        masked_local = (
            local_part[0]
            + ("*" * (len(local_part) - 2))
            + local_part[-1]
        )

    masked_email = f"{masked_local}@{domain}"

    return {
        "message": generic_message,
        "masked_email": masked_email,

        # DEVELOPMENT ONLY.
        # In production this token will be sent by email,
        # never returned from the API.
        "reset_token": reset_token,
    }

@router.post(
    "/reset-password",
    response_model=ResetPasswordResponse,
)
async def reset_password(
    data: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    # Password confirmation
    if data.new_password != data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match",
        )

    # Basic password policy
    if len(data.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long",
        )

    if not any(char.isupper() for char in data.new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one uppercase letter",
        )

    if not any(char.islower() for char in data.new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one lowercase letter",
        )

    if not any(char.isdigit() for char in data.new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one number",
        )

    token_hash = hash_password_reset_token(
        data.reset_token
    )

    result = await db.execute(
        select(PasswordReset).where(
            PasswordReset.token_hash == token_hash,
            PasswordReset.used == False,
        )
    )

    reset_record = result.scalar_one_or_none()

    if reset_record is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or already used reset token",
        )

    now = datetime.now(timezone.utc).replace(
        tzinfo=None
    )

    if reset_record.expires_at <= now:
        reset_record.used = True
        await db.commit()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired",
        )

    user_result = await db.execute(
        select(User).where(
            User.id == reset_record.user_id
        )
    )

    user = user_result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to reset password",
        )

    # Don't allow the current password again
    if verify_password(
        data.new_password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password cannot be the same as the current password",
        )

    # Update password
    user.password_hash = hash_password(
        data.new_password
    )

    # Mark reset token as consumed
    reset_record.used = True

    # Reset lockout state
    user.failed_login_attempts = 0
    user.is_locked = False

    # Revoke every existing login session for this user
    sessions_result = await db.execute(
        select(UserSession).where(
            UserSession.user_id == user.id,
            UserSession.revoked == False,
        )
    )

    active_sessions = sessions_result.scalars().all()

    for session in active_sessions:
        session.revoked = True

    await db.commit()

    return {
        "message": "Password reset successfully. Please login with your new password."
    }

@router.post(
    "/change-password",
    response_model=ChangePasswordResponse,
)
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check current password
    if not verify_password(
        data.current_password,
        current_user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    # New password and confirmation must match
    if data.new_password != data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New passwords do not match",
        )

    # Don't allow same password
    if verify_password(
        data.new_password,
        current_user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password cannot be the same as the current password",
        )

    # Password policy
    if len(data.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long",
        )

    if not any(
        char.isupper()
        for char in data.new_password
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one uppercase letter",
        )

    if not any(
        char.islower()
        for char in data.new_password
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one lowercase letter",
        )

    if not any(
        char.isdigit()
        for char in data.new_password
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one number",
        )

    # Update password
    current_user.password_hash = hash_password(
        data.new_password
    )

    # Reset lockout counters
    current_user.failed_login_attempts = 0
    current_user.is_locked = False

    # Revoke all refresh-token sessions
    result = await db.execute(
        select(UserSession).where(
            UserSession.user_id == current_user.id,
            UserSession.revoked == False,
        )
    )

    active_sessions = result.scalars().all()

    for session in active_sessions:
        session.revoked = True

    await db.commit()

    return {
        "message": (
            "Password changed successfully. "
            "Please login again."
        )
    }
