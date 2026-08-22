import { useState } from 'react';
import { 
  signInWithEmailAndPassword 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';

import { auth, db } from './firebase';
import { useAuditLog } from './useAuditLog';
import { resolveSuperAdminDocId } from './utils/superAdminDoc';
import ForgotPassword from './pages/ForgotPassword';

// Shadcn & UI Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Loader2, 
  AlertCircle, 
  ArrowRight, 
  Eye, 
  EyeOff, 
  ShieldCheck 
} from "lucide-react";

// Watermark Background Icons & Branding
import warnIcon from './assets/warnicon.png';
import triIcon from './assets/triicon.png';
import starIcon from './assets/staricon.png';

const VectorIcon = ({ src, alt, size }) => (
  <img 
    src={src} 
    alt={alt} 
    className={`${size} select-none object-contain`} 
    draggable="false" 
  />
);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // --- Login State ---
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Audit Log hook instantiation
  const { logLoginSuccess, logLoginFailed } = useAuditLog();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCheckboxChange = (checked) => {
    setFormData((prev) => ({
      ...prev,
      rememberMe: checked,
    }));
  };

  // 🔑 FIREBASE SUPERADMIN LOGIN HANDLER
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const emailTrimmed = formData.email.trim();

    if (!emailTrimmed || !EMAIL_REGEX.test(emailTrimmed)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!formData.password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);

    try {
      // 1. Authenticate with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, emailTrimmed, formData.password);
      const user = userCredential.user;

      // 2. Verify SuperAdmin Authorization in Firestore
      const docId = await resolveSuperAdminDocId(user);
      let isSuperAdmin = false;
      let superAdminData = null;

      if (docId) {
        const docSnap = await getDoc(doc(db, 'superadmin', docId));
        if (docSnap.exists()) {
          isSuperAdmin = true;
          superAdminData = docSnap.data();
        }
      }

      // Fallback check if document ID is custom instead of user UID
      if (!isSuperAdmin) {
        const q = query(collection(db, 'superadmin'), where('uid', '==', user.uid));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          isSuperAdmin = true;
          superAdminData = querySnap.docs[0].data();
        }
      }

      if (!isSuperAdmin) {
        await auth.signOut();
        setError('Access denied. Super Administrator privileges were not detected for this account.');
        await logLoginFailed(emailTrimmed, 'MISSING_SUPERADMIN_ROLE');
        setLoading(false);
        return;
      }

      // 3. Obtain ID token and store session
      const idToken = await user.getIdToken();
      localStorage.setItem('authToken', idToken);

      if (formData.rememberMe) {
        localStorage.setItem('adminToken', idToken);
      } else {
        sessionStorage.setItem('adminToken', idToken);
      }

      // 4. Log Successful Login Audit Event
      await logLoginSuccess({
        uid: user.uid,
        email: user.email,
        name: superAdminData?.name || user.displayName || user.email,
        rememberMe: formData.rememberMe,
      });

    } catch (err) {
      console.error('SuperAdmin login error:', err);
      let failureReason = 'UNKNOWN_ERROR';
      if (
        err.code === 'auth/user-not-found' || 
        err.code === 'auth/wrong-password' || 
        err.code === 'auth/invalid-credential'
      ) {
        failureReason = 'INVALID_CREDENTIALS';
        setError('Invalid email or password combination. Please check your credentials.');
      } else if (err.code === 'auth/too-many-requests') {
        failureReason = 'TOO_MANY_REQUESTS';
        setError('Too many failed attempts. Please wait a moment and try again.');
      } else {
        setError('Unable to authenticate at this time. Please try again or contact support.');
      }

      await logLoginFailed(emailTrimmed, failureReason, err.code);
      setLoading(false);
    }
  };

  // If user clicked "Forgot password?", render modular 3-step ForgotPassword flow
  if (showForgotPassword) {
    return <ForgotPassword onBackToLogin={() => setShowForgotPassword(false)} />;
  }

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center bg-[#0D47A1] relative overflow-hidden font-sans p-4 sm:p-6 text-slate-900">
      
      {/* Background Icon Watermarks (Preserved) */}
      <div className="absolute inset-0 w-full h-full pointer-events-none z-0 flex flex-col justify-between p-8 md:p-16">
        <div className="flex justify-between items-start w-full">
          <div className="opacity-20 transform -rotate-12 transition-transform hover:scale-105 duration-300">
            <VectorIcon src={warnIcon} alt="Warn pattern" size="w-32 h-24 md:w-44 md:h-32" />
          </div>
          <div className="opacity-30 pt-12 hidden sm:block animate-pulse duration-4000">
            <VectorIcon src={triIcon} alt="Triangle pattern" size="w-20 h-20 md:w-28 md:h-28" />
          </div>
          <div className="opacity-25 transform rotate-45">
            <VectorIcon src={starIcon} alt="Star pattern" size="w-24 h-24 md:w-36 md:h-36" />
          </div>
        </div>

        <div className="flex justify-between items-center w-full my-auto">
          <div className="opacity-30 transform translate-x-[-20px] md:translate-x-0">
            <VectorIcon src={triIcon} alt="Triangle pattern" size="w-28 h-28 md:w-40 md:h-40" />
          </div>
          <div className="w-1/3 hidden md:block" /> 
          <div className="opacity-20 transform translate-x-[20px] md:translate-x-0">
            <VectorIcon src={warnIcon} alt="Warn pattern" size="w-36 h-28 md:w-52 md:h-36" />
          </div>
        </div>

        <div className="flex justify-between items-end w-full">
          <div className="opacity-35 transform rotate-12">
            <VectorIcon src={starIcon} alt="Star pattern" size="w-28 h-28 md:w-44 md:h-44" />
          </div>
          <div className="opacity-20 pb-8 hidden md:block">
            <VectorIcon src={warnIcon} alt="Warn pattern" size="w-24 h-20" />
          </div>
          <div className="opacity-30 transform -rotate-45">
            <VectorIcon src={triIcon} alt="Triangle pattern" size="w-24 h-24 md:w-36 md:h-36" />
          </div>
        </div>
      </div>

      {/* Main Form Card */}
      <main className="w-full max-w-md bg-white text-slate-900 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.35)] rounded-2xl border border-slate-200 overflow-hidden flex flex-col z-10">
        
        {/* Brand Header */}
        <header className="px-8 pt-8 pb-5 flex items-center justify-between border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-0">
            <img 
              src="/logo1.png" 
              alt="AlertU Logo Icon" 
              className="h-12 w-auto object-contain shrink-0"
            />
            <img 
              src="/AlertU.png" 
              alt="AlertU Brand" 
              className="h-16 w-auto object-contain shrink-0"
            />
          </div>

          <span className="inline-flex items-center gap-1 font-bold uppercase tracking-wider text-[10px] px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200/60 shrink-0">
            <ShieldCheck className="h-3.5 w-3.5" />
            Super Admin
          </span>
        </header>

        {/* Content Area */}
        <div className="p-8">
          
          <div className="space-y-1.5 text-left mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Welcome back
            </h1>
            <p className="text-sm text-slate-500">
              Enter your credentials to access the super administrative dashboard.
            </p>
          </div>

          {/* Feedback Alert */}
          {error && (
            <Alert variant="destructive" className="mb-6 rounded-xl border-red-200 bg-red-50 text-red-900">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-xs font-medium leading-relaxed">
                {error}
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            
            <div className="space-y-1.5 text-left">
              <Label 
                htmlFor="email" 
                className="text-xs font-semibold text-slate-700 tracking-wide"
              >
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                name="email"
                required
                disabled={loading}
                placeholder="superadmin@alertu.gov"
                value={formData.email}
                onChange={handleChange}
                style={{ color: '#0f172a', backgroundColor: '#ffffff' }}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm !text-slate-900 text-slate-900 placeholder:text-slate-400 transition-all focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
              />
            </div>

            <div className="space-y-1.5 text-left">
              <Label 
                htmlFor="password" 
                className="text-xs font-semibold text-slate-700 tracking-wide"
              >
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  required
                  disabled={loading}
                  placeholder="••••••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  style={{ color: '#0f172a', backgroundColor: '#ffffff' }}
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-3.5 pr-10 text-sm !text-slate-900 text-slate-900 placeholder:text-slate-400 transition-all focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={loading}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 focus:outline-none transition-colors cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Row: Remember Me & Forgot Password */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="rememberMe"
                  checked={formData.rememberMe}
                  onCheckedChange={handleCheckboxChange}
                  disabled={loading}
                  className="rounded border-slate-300 data-[state=checked]:bg-blue-700 data-[state=checked]:border-blue-700"
                />
                <Label
                  htmlFor="rememberMe"
                  className="text-xs font-normal text-slate-600 select-none cursor-pointer"
                >
                  Remember this device
                </Label>
              </div>

              <button 
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-xs font-semibold text-blue-700 hover:text-blue-800 hover:underline transition-colors whitespace-nowrap bg-transparent border-0 p-0 cursor-pointer"
              >
                Forgot password?
              </button>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold text-sm transition-all shadow-sm hover:shadow active:scale-[0.99] cursor-pointer mt-2"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  <span>Signing in...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <span>Sign in</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </Button>
          </form>

        </div>

        {/* Footer info */}
        <footer className="px-8 py-4 border-t border-slate-100 bg-slate-50 flex flex-col items-center justify-center text-center">
          <p className="text-xs text-slate-400">
            &copy; {new Date().getFullYear()} AlertU Incident & Risk Management. All rights reserved.
          </p>
        </footer>

      </main>
    </div>
  );
}