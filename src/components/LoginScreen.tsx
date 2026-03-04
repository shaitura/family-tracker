import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { isAllowedEmail, saveSession, UserInfo } from '@/lib/auth';

interface JwtPayload {
  email: string;
  name: string;
  picture: string;
}

export default function LoginScreen({ onLogin }: { onLogin: (user: UserInfo) => void }) {
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

        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={(credentialResponse) => {
              if (!credentialResponse.credential) return;
              const decoded = jwtDecode<JwtPayload>(credentialResponse.credential);
              if (!isAllowedEmail(decoded.email)) {
                alert(`הכתובת ${decoded.email} אינה מורשית לגשת לאפליקציה.`);
                return;
              }
              const user: UserInfo = {
                email: decoded.email,
                name: decoded.name,
                picture: decoded.picture,
              };
              saveSession(user);
              onLogin(user);
            }}
            onError={() => alert('שגיאה בכניסה. נסה/י שוב.')}
            text="signin_with"
            shape="rectangular"
            width="260"
          />
        </div>

        <p className="text-white/30 text-xs mt-8">גישה דרך חשבון Google בלבד</p>
      </div>
    </div>
  );
}
