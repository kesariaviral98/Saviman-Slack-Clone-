// ─────────────────────────────────────────────────────────────────────────────
// GoogleSignInButton — renders the Google One-Tap / standard OAuth button.
//
// Uses @react-oauth/google's useGoogleLogin hook with the authorization-code
// flow via the pre-built GoogleLogin component that shows the official button.
// When the user approves, the credential (ID token) is sent to our backend at
// POST /auth/oauth/google to be verified and exchange for session tokens.
// ─────────────────────────────────────────────────────────────────────────────

import { GoogleLogin } from '@react-oauth/google';
import { config } from '@/lib/config';

/**
 * @param {object}   props
 * @param {function} props.onSuccess  — called with the signed-in user object
 * @param {function} props.onError    — called with an Error
 * @param {string}   [props.text]     — button text override: 'signin_with' | 'signup_with' | 'continue_with'
 */
export default function GoogleSignInButton({ onSuccess, onError, text = 'signin_with' }) {
  // If no Google Client ID is configured, render nothing — prevents the ugly
  // "idpiframe_initialization_failed" error in the console during local dev.
  if (!config.googleClientId) return null;

  return (
    <div className="w-full flex justify-center">
      <GoogleLogin
        onSuccess={onSuccess}
        onError={() => onError?.(new Error('Google sign-in failed. Please try again.'))}
        text={text}
        shape="rectangular"
        theme="outline"
        size="large"
        width={320}
        useOneTap={false}
      />
    </div>
  );
}
