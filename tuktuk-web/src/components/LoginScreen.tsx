import { SignInButton } from '@asgardeo/react';
import { GOOGLE_CONNECTION, isGoogleLoginEnabled } from '../auth/config';
import { isLegacyLoginAvailable } from '../auth/legacySession';
import LegacyLoginForm from './LegacyLoginForm';

/**
 * Note what is NOT here: no username field, no password field, no onSubmit, no
 * "invalid credentials" branch, no forgot-password link, no token written to
 * localStorage. Asgardeo's hosted page owns all of it, which means credentials
 * never pass through this bundle at all.
 *
 * There is deliberately no <SignUpButton />. Officers are provisioned by HQ
 * (POST /users is restricted to ADMIN_HQ and PROVINCIAL_OFFICER); they do not
 * sign themselves up.
 */
interface Props {
  /** An `error`/`error_description` Asgardeo appended to the redirect, if any. */
  oauthError?: string | null;
  /** True when the SDK never finished initialising. */
  stalled?: boolean;
}

export default function LoginScreen({ oauthError, stalled }: Props) {
  return (
    <div className="login">
      <div className="login__card">
        <div className="login__badge" aria-hidden="true">
          🚖
        </div>
        <h1 className="login__title">TukTuk Tracker</h1>
        <p className="login__subtitle">
          Real-time three-wheeler tracking &amp; movement logging
        </p>

        {oauthError && (
          <div className="alert alert--error login__alert" role="alert">
            <strong>Asgardeo rejected the sign-in</strong>
            <span className="login__alertdetail">{oauthError}</span>
          </div>
        )}

        {stalled && !oauthError && (
          <div className="alert alert--warn login__alert" role="status">
            Asgardeo did not respond. Check{' '}
            <code>VITE_ASGARDEO_BASE_URL</code>, or use the password login below.
          </div>
        )}

        <SignInButton className="btn btn--primary btn--block">
          Sign in with Asgardeo
        </SignInButton>

        {isGoogleLoginEnabled && (
          <>
            <div className="login__divider">
              <span>or</span>
            </div>

            {/*
              `fidp` tells Asgardeo which federated identity provider to use, so the
              user skips the provider chooser and lands on Google's consent screen
              directly. Everything after that is identical to any other sign-in:
              the app still receives an Asgardeo-issued token, never a Google one.
            */}
            <SignInButton
              className="btn btn--google btn--block"
              signInOptions={{ fidp: GOOGLE_CONNECTION }}
            >
              <GoogleMark />
              Continue with Google
            </SignInButton>
          </>
        )}

        <p className="login__notice">
          Sri Lanka Police — authorised personnel only. Access is logged.
        </p>

        {isLegacyLoginAvailable && <LegacyLoginForm />}
      </div>
    </div>
  );
}

/** Google's four-colour mark, inline so the login page makes no third-party request. */
function GoogleMark() {
  return (
    <svg
      className="gmark"
      viewBox="0 0 18 18"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.94L3.97 7.28C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
