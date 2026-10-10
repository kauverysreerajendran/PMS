import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveSession } from '../lib/auth';
import { lastHotel } from '../lib/property';

import {
  BedDouble,
  CalendarCheck2,
  Users,
  BarChart3,
  Building2,
  Mail,
  LockKeyhole,
  Eye,
  EyeOff,
  ArrowRight,
  X,
  KeyRound,
  CheckCircle2
} from 'lucide-react';

const features = [
  ['Room', 'Management', BedDouble],
  ['Bookings &', 'Reservations', CalendarCheck2],
  ['Guest', 'Management', Users],
  ['Reports &', 'Analytics', BarChart3]
] as const;

type ForgotStep = 'email' | 'reset' | 'success';

export default function LoginPage() {
  const [knownHotel] = useState(lastHotel);
  const navigate = useNavigate();

  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Forgot password modal
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] =
    useState<ForgotStep>('email');

  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] =
    useState('');

  const [forgotError, setForgotError] = useState('');
  const [forgotLoading, setForgotLoading] =
    useState(false);

  const handleLogin = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    setError('');

    try {
      const response = await fetch(
        'http://127.0.0.1:8000/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            identifier: email.trim(),
            password: password
          })
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(
          response.status === 401
            ? 'Invalid username or password'
            : (typeof data.detail === 'string' ? data.detail : 'Unable to log in. Please try again.')
        );
        return;
      }

      if (!data.access_token || !data.refresh_token || !data.user?.username) {
        setError('Unable to complete login. Please try again.');
        return;
      }

      saveSession(data, remember);

      setError('');

      navigate('/dashboard', {
        replace: true
      });
    } catch (error) {
      console.error('Login error:', error);

      setError(
        'Unable to connect to the server. Please try again.'
      );
    }
  };

  const openForgotPassword = () => {
    setForgotEmail(email.trim());
    setForgotStep('email');
    setResetToken('');
    setNewPassword('');
    setConfirmPassword('');
    setForgotError('');
    setForgotOpen(true);
  };

  const closeForgotPassword = () => {
    if (forgotLoading) {
      return;
    }

    setForgotOpen(false);
    setForgotStep('email');
    setForgotError('');
    setResetToken('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleForgotPassword = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    setForgotError('');
    setForgotLoading(true);

    try {
      const response = await fetch(
        'http://127.0.0.1:8000/forgot-password',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: forgotEmail.trim()
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setForgotError(
          data.detail ||
            'Unable to process your request.'
        );
        return;
      }

      if (!data.reset_token) {
        setForgotError(
          'Reset token was not returned by the server.'
        );
        return;
      }

      setResetToken(data.reset_token);
      setForgotStep('reset');
    } catch (error) {
      console.error(
        'Forgot password error:',
        error
      );

      setForgotError(
        'Unable to connect to the server. Please try again.'
      );
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPassword = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    setForgotError('');

    if (newPassword !== confirmPassword) {
      setForgotError(
        'New password and confirm password do not match.'
      );
      return;
    }

    setForgotLoading(true);

    try {
      const response = await fetch(
        'http://127.0.0.1:8000/reset-password',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            reset_token: resetToken,
            new_password: newPassword,
            confirm_password: confirmPassword
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setForgotError(
          data.detail ||
            'Unable to reset your password.'
        );
        return;
      }

      setPassword('');
      setForgotStep('success');
    } catch (error) {
      console.error(
        'Reset password error:',
        error
      );

      setForgotError(
        'Unable to connect to the server. Please try again.'
      );
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <main className="screen">

      {/* ================= LEFT SIDE ================= */}

      <section className="hero">

        <div className="shade" />

        <div className="brand">

          <div className="brandIcon">
            {knownHotel?.logo_url ? <img src={knownHotel.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 8 }} /> : <Building2 />}
          </div>

          <div>
            <strong>
              {knownHotel?.name || 'Hotel Management'}
            </strong>

            <small>{knownHotel ? 'HOTEL MANAGEMENT' : 'SYSTEM'}</small>
          </div>

        </div>

        <div className="copy">

          <h1>
            Simplify Your Hotel
            <br />
            <em>Operations</em>
          </h1>

          <p>
            Manage rooms, guests, bookings and more
            <br />
            — all in one place.
          </p>

          <div className="features">

            {features.map(([a, b, Icon]) => (
              <div
                className="feature"
                key={a}
              >

                <div className="fIcon">
                  <Icon />
                </div>

                <small>
                  {a}
                  <br />
                  {b}
                </small>

              </div>
            ))}

          </div>

        </div>

      </section>

      {/* ================= RIGHT SIDE ================= */}

      <section className="loginSide">

        <div className="welcome">
          Welcome Back
          <i />
        </div>

        <div className="card">

          <div className="roundIcon">
            <Building2 />
          </div>

          <h2>Hotel Management System</h2>

          <h3>LOGIN TO YOUR ACCOUNT</h3>

          <form onSubmit={handleLogin}>

            <label htmlFor="email">
              Email or Username
            </label>

            <div className="input">

              <Mail />

              <input
                id="email"
                type="text"
                placeholder="Enter your email or username"
                value={email}
                required
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                autoComplete="username"
              />

            </div>

            <label htmlFor="password">
              Password
            </label>

            <div className="input">

              <LockKeyhole />

              <input
                id="password"
                type={show ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                required
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                autoComplete="current-password"
              />

              <button
                type="button"
                className="eye"
                onClick={() =>
                  setShow((current) => !current)
                }
                aria-label={
                  show
                    ? 'Hide password'
                    : 'Show password'
                }
              >

                {show ? <EyeOff /> : <Eye />}

              </button>

            </div>

            {error && (
              <div
                style={{
                  color: '#dc2626',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginTop: '8px'
                }}
              >
                {error}
              </div>
            )}

            <div className="options">

              <label className="check">

                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) =>
                    setRemember(e.target.checked)
                  }
                />

                <span />

                Remember me

              </label>

              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  openForgotPassword();
                }}
              >
                Forgot password?
              </a>

            </div>

            <button
              className="login"
              type="submit"
            >
              Login
              <ArrowRight />
            </button>

          </form>

          <div className="or">
            <span />
            OR
            <span />
          </div>

          <button
            className="google"
            type="button"
          >
            <b>G</b>
            Continue with Google
          </button>

          <footer>
            © {new Date().getFullYear()} Hotel Management System. All rights reserved.
          </footer>

        </div>

      </section>


      {/* ================= FORGOT PASSWORD MODAL ================= */}

      {forgotOpen && (
        <div
          className="forgotOverlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              closeForgotPassword();
            }
          }}
        >
          <div className="forgotModal">

            {forgotStep !== 'success' && (
              <button
                type="button"
                className="forgotClose"
                onClick={closeForgotPassword}
                aria-label="Close"
              >
                <X />
              </button>
            )}

            {forgotStep === 'email' && (
              <>
                <div className="forgotIcon">
                  <KeyRound />
                </div>

                <h2>Forgot Password?</h2>

                <p className="forgotDescription">
                  Enter your registered email address
                  to reset your password.
                </p>

                <form
                  className="forgotForm"
                  onSubmit={handleForgotPassword}
                >
                  <label htmlFor="forgotEmail">
                    Email Address
                  </label>

                  <div className="forgotInput">
                    <Mail />

                    <input
                      id="forgotEmail"
                      type="email"
                      value={forgotEmail}
                      placeholder="Enter your email"
                      required
                      autoFocus
                      onChange={(e) => {
                        setForgotEmail(
                          e.target.value
                        );
                        setForgotError('');
                      }}
                    />
                  </div>

                  {forgotError && (
                    <div className="forgotError">
                      {forgotError}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="forgotPrimary"
                    disabled={forgotLoading}
                  >
                    {forgotLoading
                      ? 'Please wait...'
                      : 'Continue'}

                    {!forgotLoading && (
                      <ArrowRight />
                    )}
                  </button>
                </form>

                <button
                  type="button"
                  className="forgotBack"
                  onClick={closeForgotPassword}
                >
                  Back to Login
                </button>
              </>
            )}


            {forgotStep === 'reset' && (
              <>
                <div className="forgotIcon">
                  <LockKeyhole />
                </div>

                <h2>Create New Password</h2>

                <p className="forgotDescription">
                  Create a secure new password for
                  your account.
                </p>

                <form
                  className="forgotForm"
                  onSubmit={handleResetPassword}
                >
                  <label htmlFor="newPassword">
                    New Password
                  </label>

                  <div className="forgotInput">
                    <LockKeyhole />

                    <input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      placeholder="Enter new password"
                      required
                      onChange={(e) => {
                        setNewPassword(
                          e.target.value
                        );
                        setForgotError('');
                      }}
                    />
                  </div>

                  <label htmlFor="confirmPassword">
                    Confirm Password
                  </label>

                  <div className="forgotInput">
                    <LockKeyhole />

                    <input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      placeholder="Confirm new password"
                      required
                      onChange={(e) => {
                        setConfirmPassword(
                          e.target.value
                        );
                        setForgotError('');
                      }}
                    />
                  </div>

                  <div className="passwordHint">
                    Use at least 8 characters with
                    uppercase, lowercase and a number.
                  </div>

                  {forgotError && (
                    <div className="forgotError">
                      {forgotError}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="forgotPrimary"
                    disabled={forgotLoading}
                  >
                    {forgotLoading
                      ? 'Resetting...'
                      : 'Reset Password'}

                    {!forgotLoading && (
                      <ArrowRight />
                    )}
                  </button>
                </form>
              </>
            )}


            {forgotStep === 'success' && (
              <div className="forgotSuccess">

                <div className="forgotSuccessIcon">
                  <CheckCircle2 />
                </div>

                <h2>Password Reset!</h2>

                <p>
                  Your password has been changed
                  successfully. You can now log in
                  using your new password.
                </p>

                <button
                  type="button"
                  className="forgotPrimary"
                  onClick={closeForgotPassword}
                >
                  Back to Login
                  <ArrowRight />
                </button>

              </div>
            )}

          </div>
        </div>
      )}

    </main>
  );
}
