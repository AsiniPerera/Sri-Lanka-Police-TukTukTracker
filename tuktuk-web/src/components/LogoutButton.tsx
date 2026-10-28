import { SignOutButton } from '@asgardeo/react';
import { clearLegacySession, useLegacyToken } from '../auth/legacySession';

interface Props {
  className?: string;
  children?: React.ReactNode;
}

/**
 * Signs the user out of whichever session is active.
 *
 * A legacy dev session has nothing to revoke at the IdP — dropping the token is
 * the whole logout. An Asgardeo session needs the SDK's redirect to end the
 * session server-side, so leaving it to <SignOutButton /> matters.
 */
export default function LogoutButton({ className = 'btn', children = 'Sign out' }: Props) {
  const legacyToken = useLegacyToken();

  if (legacyToken) {
    return (
      <button type="button" className={className} onClick={clearLegacySession}>
        {children}
      </button>
    );
  }

  return <SignOutButton className={className}>{children}</SignOutButton>;
}
