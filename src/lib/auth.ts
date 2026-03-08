import { User } from 'firebase/auth';

// ─── הכנס כאן את כתובות ה-Gmail המורשות ─────────────────────────────────────
export const ALLOWED_EMAILS = [
  'shaitura@gmail.com',
  'ortalas@gmail.com',
];
// ─────────────────────────────────────────────────────────────────────────────

export type UserInfo = {
  uid:     string;
  email:   string;
  name:    string;
  picture: string;
};

export function isAllowedEmail(email: string): boolean {
  return ALLOWED_EMAILS.map((e) => e.toLowerCase()).includes(email.toLowerCase());
}

export function toUserInfo(user: User): UserInfo {
  return {
    uid:     user.uid,
    email:   user.email    ?? '',
    name:    user.displayName ?? '',
    picture: user.photoURL ?? '',
  };
}
