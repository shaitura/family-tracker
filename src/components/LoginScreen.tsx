import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { isAllowedEmail } from '@/lib/auth';

export default function LoginScreen() {
  async function handleLogin() {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (!isAllowedEmail(result.user.email ?? '')) {
        await auth.signOut();
        alert('חשבון זה אינו מורשה לגשת לאפליקציה.');
      }
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        alert('שגיאה בכניסה. נסה/י שוב.');
      }
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900"
      dir="rtl"
    >
      <div className="bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl p-10 w-full max-w-sm text-center border border-white/20">
        {/* Logo */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30 mx-auto mb-5">
          <span className="text-white font-black text-xl">FT</span>
        </div>

        <h1 className="text-2xl font-bold text-white mb-1">Family Tracker</h1>
        <p className="text-white/50 text-sm mb-8">כניסה מוגבלת לבני המשפחה</p>

        <button
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-3 bg-white text-gray-700 font-medium px-6 py-3 rounded-xl hover:bg-gray-50 active:scale-95 transition-all shadow-md"
        >
          {/* Google logo */}
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.9 29.3 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6-6C34.5 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.3-.2-2.7-.4-4z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.1 8.1 2.9l6-6C34.5 5.1 29.5 3 24 3c-7.6 0-14.2 4-17.7 9.7z"/>
            <path fill="#4CAF50" d="M24 45c5.2 0 9.9-1.8 13.6-4.7l-6.3-5.2C29.4 36.6 26.8 37 24 37c-5.2 0-9.6-3-11.4-7.4l-6.6 5C9.7 41 16.4 45 24 45z"/>
            <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.6-2.6 4.8-4.9 6.3l6.3 5.2C40.3 36.1 44 30.5 44 24c0-1.3-.2-2.7-.4-4z"/>
          </svg>
          כניסה עם Google
        </button>

        <p className="text-white/30 text-xs mt-8">גישה דרך חשבון Google בלבד</p>
      </div>
    </div>
  );
}
