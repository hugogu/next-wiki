type UserDisplayNameSource = {
  displayName: string | null;
  email: string;
} | null | undefined;

/** Use the explicit profile name, then the non-domain part of the account email. */
export function getUserDisplayName(user: UserDisplayNameSource): string | null {
  const displayName = user?.displayName?.trim();
  if (displayName) return displayName;

  const email = user?.email.trim();
  if (!email) return null;
  const separator = email.lastIndexOf('@');
  const username = separator > 0 ? email.slice(0, separator) : email;
  return username || null;
}
