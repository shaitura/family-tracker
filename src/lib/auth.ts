export type UserInfo = {
  email: string;
  name: string;
  picture: string;
};

// ─── הכנס כאן את כתובות ה-Gmail המורשות ─────────────────────────────────────
const ALLOWED_EMAILS = [
  'YOUR_EMAIL@gmail.com',     // ← החלף במייל שלך
  'WIFE_EMAIL@gmail.com',     // ← החלף במייל של אשתך
];
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_KEY = 'ft_auth_session';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 ימים

export function isAllowedEmail(email: string): boolean {
  return ALLOWED_EMAILS.map((e) => e.toLowerCase()).includes(email.toLowerCase());
}

export function saveSession(user: UserInfo): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    user,
    expiresAt: Date.now() + SESSION_TTL,
  }));
}

export function getSession(): UserInfo | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const { user, expiresAt } = JSON.parse(raw);
    if (Date.now() > expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return user as UserInfo;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
