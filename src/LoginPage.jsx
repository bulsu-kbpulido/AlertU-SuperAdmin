import { useState } from 'react';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
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

// 🔑 Import client Firebase initialization
import { auth, db } from './firebase'; 

import userIcon from './assets/usericon.svg';
import passIcon from './assets/passicon.svg';
import logIcon from './assets/logicon.svg';
import warnIcon from './assets/warnicon.png';
import triIcon from './assets/triicon.png';
import starIcon from './assets/staricon.png';
import Logo from './assets/logo1.png';

// 🌐 Dynamic Backend URL Resolution for API calls
const API_BASE_URL = (
  import.meta.env.VITE_API_URL || 'https://alertu-server.onrender.com'
).replace(/\/+$/, '').replace(/\/api$/i, '');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const textStyles = {
  brand: "text-[#0D47A1] text-[30px] font-black italic font-inter leading-[32px] tracking-tight",
  role: "text-[#474747] text-[20px] font-gilroy-blackItalic leading-[20px]",
  label: "text-[#474747] text-[14px] font-medium font-inter leading-[20px]",
  placeholder: "text-[#6B7280] text-[16px] font-normal font-inter",
  forgot: "text-[#1671C0] text-[12px] font-semibold font-inter leading-[16px]",
  submit: "text-[#F1F5F9] text-[16px] font-bold font-inter leading-[24px]",
  footerText: "text-[#94A3B8] text-[14px] font-normal font-inter leading-[20px]",
  footerLink: "text-[#1671C0] text-[14px] font-semibold font-inter leading-[20px]",
};

const VectorIcon = ({ src, alt, size }) => (
  <img 
    src={src} 
    alt={alt} 
    className={`${size} select-none object-contain`} 
    draggable="false" 
  />
);

const LoginPage = () => {
  const [view, setView] = useState('login'); // 'login', 'forgot-request', 'forgot-verify'

  // --- Login State ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailValid = EMAIL_REGEX.test(email.trim());
  const passwordFilled = password.length > 0;
  const isFormValid = emailValid && passwordFilled;

  // --- Super Admin Forgot Password State ---
  const [resetEmail, setResetEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [resetError, setResetError] = useState('');
  const [resetSuccessMsg, setResetSuccessMsg] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isVerifyingReset, setIsVerifyingReset] = useState(false);

  const resetEmailValid = EMAIL_REGEX.test(resetEmail.trim());

  // 🔑 FIREBASE LOGIN HANDLER
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!emailValid) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!passwordFilled) {
      setError('Please enter your password.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Authenticate with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;

      // 2. Verify SuperAdmin Authorization in Firestore
      let superAdminDoc = await getDoc(doc(db, 'superadmin', user.uid));
      let isSuperAdmin = superAdminDoc.exists();

      // Fallback check if document ID is custom instead of user UID
      if (!isSuperAdmin) {
        const q = query(collection(db, 'superadmin'), where('uid', '==', user.uid));
        const querySnap = await getDocs(q);
        isSuperAdmin = !querySnap.empty;
      }

      if (!isSuperAdmin) {
        // Sign out unauthorized user
        await auth.signOut();
        setError('Access denied. You do not have Super Admin privileges.');
        setIsSubmitting(false);
        return;
      }

      // 3. Obtain ID token and store session
      const idToken = await user.getIdToken();
      
      if (rememberMe) {
        localStorage.setItem('adminToken', idToken);
      } else {
        sessionStorage.setItem('adminToken', idToken);
      }

      // 4. Redirect to Dashboard
      window.location.href = '/admin/dashboard';

    } catch (err) {
      console.error('Login error:', err);
      if (
        err.code === 'auth/user-not-found' || 
        err.code === 'auth/wrong-password' || 
        err.code === 'auth/invalid-credential'
      ) {
        setError('Incorrect email or password.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later.');
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
      setIsSubmitting(false);
    }
  };

  // --- Reset View Navigators ---
  const openForgotPassword = () => {
    setResetEmail(email);
    setOtp('');
    setNewPassword('');
    setConfirmPassword('');
    setResetError('');
    setResetSuccessMsg('');
    setView('forgot-request');
  };

  const backToLogin = () => {
    setView('login');
    setResetError('');
    setResetSuccessMsg('');
  };

  // 🔑 STEP 1: REQUEST SUPER ADMIN OTP
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setResetError('');

    if (!resetEmailValid) {
      setResetError('Please enter a valid email address.');
      return;
    }

    setIsSendingReset(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/send-superadmin-reset-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to send verification code.');
      }

      setView('forgot-verify');
    } catch (err) {
      console.error('Super Admin OTP request error:', err);
      setResetError(err.message || 'Failed to send OTP code. Please check your email and try again.');
    } finally {
      setIsSendingReset(false);
    }
  };

  // 🔑 STEP 2: VERIFY OTP & RESET PASSWORD
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetError('');

    if (!otp.trim()) {
      setResetError('Please enter the verification code.');
      return;
    }
    if (newPassword.length < 6) {
      setResetError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match.');
      return;
    }

    setIsVerifyingReset(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/reset-superadmin-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetEmail.trim(),
          otp: otp.trim(),
          newPassword: newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to reset password.');
      }

      setResetSuccessMsg('Password successfully updated! Redirecting to login...');
      setTimeout(() => {
        backToLogin();
      }, 2000);

    } catch (err) {
      console.error('Super Admin password update error:', err);
      setResetError(err.message || 'Failed to update password. Please verify your OTP code and try again.');
    } finally {
      setIsVerifyingReset(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center bg-[#0D47A1] relative overflow-hidden font-inter p-4 md:p-0">
      
      {/* Background Icon Watermarks */}
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

      <main className="w-full max-w-[460px] bg-white shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] rounded-xl border border-slate-200 overflow-hidden flex flex-col z-10 lg:scale-[1.05]">
        
        <header className="self-stretch pt-10 pb-6 flex flex-col items-center border-b border-slate-100">
          <div className="pb-2 flex flex-col items-start gap-2">
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-start shadow-md rounded-md overflow-hidden bg-[#F1F5F9]">
                <VectorIcon src={Logo} alt="Alert U Logo" size="w-[79px] h-[79px]" />
              </div>
              <div className="flex flex-col items-start">
                <h1 className={textStyles.brand}>Alert U</h1>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-start mt-2">
            <h2 className={textStyles.role}>
              {view !== 'login' ? 'Reset Password' : 'Super-Admin'}
            </h2>
          </div>
        </header>

        {/* STEP 1: REQUEST OTP */}
        {view === 'forgot-request' && (
          <form className="self-stretch px-8 pb-10 flex flex-col gap-8" onSubmit={handleRequestOtp} noValidate>
            <div className="flex flex-col gap-6 pt-6">
              <button
                type="button"
                onClick={backToLogin}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 cursor-pointer self-start"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </button>

              <p className={textStyles.placeholder}>
                Enter your Super Admin email address to receive a 6-digit verification code.
              </p>

              {resetError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                  <p className="text-sm font-medium text-red-600">{resetError}</p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label htmlFor="reset-email" className={textStyles.label}>Email Address <span className="text-red-500">*</span></label>
                <div className="relative flex flex-col items-start">
                  <input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    placeholder="superadmin@alertu.com"
                    className={`w-full py-3.5 pl-11 pr-4 rounded-lg border focus:ring-2 focus:ring-[#1671C0] focus:border-[#1671C0] outline-none ${textStyles.placeholder} ${
                      resetEmail && !resetEmailValid ? 'border-red-400' : 'border-[#111A21]'
                    }`}
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
                    <VectorIcon src={userIcon} alt="User" size="w-full h-full" />
                  </div>
                </div>
                {resetEmail && !resetEmailValid && <p className="text-xs text-red-500">Enter a valid email address.</p>}
              </div>

              <div className="relative flex flex-col items-start">
                <button
                  type="submit"
                  disabled={isSendingReset || !resetEmailValid}
                  className="w-full py-3.5 px-4 bg-[#1671C0] rounded-lg shadow-md hover:bg-[#0D47A1] focus:ring-4 focus:ring-[#1671C0]/30 transition-colors flex justify-center items-center gap-2.5 z-10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className={textStyles.submit}>{isSendingReset ? 'Sending Code...' : 'Send Verification Code'}</span>
                </button>
                <div className="absolute inset-0 rounded-lg shadow-[0px_4px_6px_-4px_rgba(22,113,192,0.20),_0px_10px_15px_-3px_rgba(22,113,192,0.20)]" />
              </div>
            </div>
          </form>
        )}

        {/* STEP 2: VERIFY OTP AND SET NEW PASSWORD */}
        {view === 'forgot-verify' && (
          <form className="self-stretch px-8 pb-10 flex flex-col gap-6" onSubmit={handleResetPassword} noValidate>
            <div className="flex flex-col gap-5 pt-6">
              <button
                type="button"
                onClick={() => setView('forgot-request')}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 cursor-pointer self-start"
              >
                <ArrowLeft className="w-4 h-4" />
                Change Email Address
              </button>

              <p className={textStyles.placeholder}>
                We sent a 6-digit code to <strong className="text-slate-800">{resetEmail}</strong>.
              </p>

              {resetError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                  <p className="text-sm font-medium text-red-600">{resetError}</p>
                </div>
              )}

              {resetSuccessMsg && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
                  <p className="text-sm font-medium text-emerald-700">{resetSuccessMsg}</p>
                </div>
              )}

              {/* OTP Field */}
              <div className="flex flex-col gap-2">
                <label htmlFor="otp" className={textStyles.label}>Verification Code <span className="text-red-500">*</span></label>
                <input
                  id="otp"
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  required
                  className="w-full py-3.5 px-4 rounded-lg border border-[#111A21] text-center tracking-[8px] text-xl font-bold focus:ring-2 focus:ring-[#1671C0] focus:border-[#1671C0] outline-none"
                />
              </div>

              {/* New Password Field */}
              <div className="flex flex-col gap-2">
                <label htmlFor="new-password" className={textStyles.label}>New Password <span className="text-red-500">*</span></label>
                <div className="relative flex flex-col items-start">
                  <input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className={`w-full py-3.5 pl-11 pr-11 rounded-lg border border-[#111A21] focus:ring-2 focus:ring-[#1671C0] focus:border-[#1671C0] outline-none ${textStyles.placeholder}`}
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
                    <VectorIcon src={passIcon} alt="Password" size="w-full h-full" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password Field */}
              <div className="flex flex-col gap-2">
                <label htmlFor="confirm-password" className={textStyles.label}>Confirm New Password <span className="text-red-500">*</span></label>
                <div className="relative flex flex-col items-start">
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className={`w-full py-3.5 pl-11 pr-11 rounded-lg border border-[#111A21] focus:ring-2 focus:ring-[#1671C0] focus:border-[#1671C0] outline-none ${textStyles.placeholder}`}
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
                    <VectorIcon src={passIcon} alt="Password" size="w-full h-full" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="relative flex flex-col items-start pt-2">
                <button
                  type="submit"
                  disabled={isVerifyingReset || !otp.trim() || !newPassword || !confirmPassword}
                  className="w-full py-3.5 px-4 bg-[#1671C0] rounded-lg shadow-md hover:bg-[#0D47A1] focus:ring-4 focus:ring-[#1671C0]/30 transition-colors flex justify-center items-center gap-2.5 z-10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className={textStyles.submit}>{isVerifyingReset ? 'Updating Password...' : 'Reset Password'}</span>
                </button>
                <div className="absolute inset-0 rounded-lg shadow-[0px_4px_6px_-4px_rgba(22,113,192,0.20),_0px_10px_15px_-3px_rgba(22,113,192,0.20)]" />
              </div>
            </div>
          </form>
        )}

        {/* LOGIN FORM */}
        {view === 'login' && (
          <form className="self-stretch px-8 pb-10 flex flex-col gap-8" onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-6 pt-6">

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                  <p className="text-sm font-medium text-red-600">{error}</p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label htmlFor="username" className={textStyles.label}>Email Address <span className="text-red-500">*</span></label>
                <div className="relative flex flex-col items-start">
                  <input
                    id="username"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="admin@alertu.com"
                    className={`w-full py-3.5 pl-11 pr-4 rounded-lg border focus:ring-2 focus:ring-[#1671C0] focus:border-[#1671C0] outline-none ${textStyles.placeholder} ${
                      email && !emailValid ? 'border-red-400' : 'border-[#111A21]'
                    }`}
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
                    <VectorIcon src={userIcon} alt="User" size="w-full h-full" />
                  </div>
                </div>
                {email && !emailValid && <p className="text-xs text-red-500">Enter a valid email address.</p>}
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="password" className={textStyles.label}>Password <span className="text-red-500">*</span></label>
                <div className="relative flex flex-col items-start">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className={`w-full py-3.5 pl-11 pr-11 rounded-lg border border-[#111A21] focus:ring-2 focus:ring-[#1671C0] focus:border-[#1671C0] outline-none ${textStyles.placeholder}`}
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
                    <VectorIcon src={passIcon} alt="Password" size="w-full h-full" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center self-stretch">
                <div className="flex items-center gap-2">
                  <input
                    id="remember"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-[#111A21] text-[#1671C0] focus:ring-[#1671C0]"
                  />
                  <label htmlFor="remember" className={textStyles.label}>Remember this device</label>
                </div>
                <button type="button" onClick={openForgotPassword} className={`${textStyles.forgot} cursor-pointer`}>Forgot Password?</button>
              </div>

              <div className="relative flex flex-col items-start">
                <button
                  type="submit"
                  disabled={isSubmitting || !isFormValid}
                  className="w-full py-3.5 px-4 bg-[#1671C0] rounded-lg shadow-md hover:bg-[#0D47A1] focus:ring-4 focus:ring-[#1671C0]/30 transition-colors flex justify-center items-center gap-2.5 z-10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className={textStyles.submit}>{isSubmitting ? 'Signing In...' : 'Sign In'}</span>
                  {!isSubmitting && <VectorIcon src={logIcon} alt="Login" size="w-[16px] h-[16px]" />}
                </button>
                <div className="absolute inset-0 rounded-lg shadow-[0px_4px_6px_-4px_rgba(22,113,192,0.20),_0px_10px_15px_-3px_rgba(22,113,192,0.20)]" />
              </div>
            </div>

            <footer className="self-stretch pt-6 border-t border-slate-200 flex flex-col gap-4 text-center">
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                <p className={textStyles.footerText}>Authorized personnel only.</p>
              </div>
            </footer>
          </form>
        )}
      </main>
    </div>
  );
};

export default LoginPage;