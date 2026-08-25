import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Loader2, 
  AlertCircle, 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle2, 
  KeyRound, 
  Mail, 
  ShieldCheck,
  Eye,
  EyeOff
} from "lucide-react";
import warnIcon from '../assets/warnicon.png';
import triIcon from '../assets/triicon.png';
import starIcon from '../assets/staricon.png';
import { BASE_URL } from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const VectorIcon = ({ src, alt, size }) => (
  <img 
    src={src} 
    alt={alt} 
    className={`${size} select-none object-contain`} 
    draggable="false" 
  />
);

export default function ForgotPassword({ onBackToLogin }) {
  // 🏷️ Dynamic Document Title
  useDocumentTitle('Forgot Password – AlertU');

  // Step 1: Send OTP, Step 2: Verify & Reset, Step 3: Success
  const [step, setStep] = useState(1);

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Password Visibility Toggles
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');

  // Resend Timer State
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Safely parse JSON or text error responses
  const parseResponse = async (response) => {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    const rawText = await response.text();
    return { error: rawText || `Server error (${response.status})` };
  };

  // Helper fetch wrapper that automatically retries if server is waking up (502/503/504)
  const fetchWithAutoRetry = async (url, options, maxRetries = 3) => {
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      try {
        const response = await fetch(url, options);
        if ([502, 503, 504].includes(response.status)) {
          if (attempt < maxRetries) {
            setLoadingStatus(`Waking up server (Attempt ${attempt}/${maxRetries-1})...`);
            await new Promise((resolve) => setTimeout(resolve, 4000));
            continue;
          }
          throw new Error('Backend server is starting up. Please wait a few seconds and click submit again.');
        }
        return response;
      } catch (err) {
        if (attempt >= maxRetries) throw err;
        setLoadingStatus(`Retrying connection (${attempt}/${maxRetries-1})...`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  };

  // Handle Step 1: Send OTP
  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!email || !email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);
    setLoadingStatus('Sending code...');

    try {
      const response = await fetchWithAutoRetry(`${BASE_URL}/auth/send-superadmin-reset-otp`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await parseResponse(response);

      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || 'Failed to send verification code.');
      }

      setSuccessMsg('A 6-digit verification code has been sent to your email.');
      setStep(2);
      setResendCooldown(60); // 60s cooldown
    } catch (err) {
      console.error('Send OTP Error:', err);
      if (err.name === 'TypeError' && err.message.includes('Fetch')) {
        setError('Network error: Unable to reach backend server.');
      } else {
        setError(err.message || 'Unable to connect to server. Please try again.');
      }
    } finally {
      setLoading(false);
      setLoadingStatus('');
    }
  };

  // Handle Step 2: Reset Password with OTP
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!otp || otp.trim().length !== 6) {
      setError('Please enter the full 6-digit verification code.');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);
    setLoadingStatus('Updating password...');

    try {
      const response = await fetchWithAutoRetry(`${BASE_URL}/auth/reset-superadmin-password`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          email: email.trim(),
          otp: otp.trim(),
          newPassword,
        }),
      });

      const data = await parseResponse(response);

      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || 'Failed to reset password.');
      }

      setStep(3);
    } catch (err) {
      console.error('Reset Password Error:', err);
      if (err.name === 'TypeError' && err.message.includes('Fetch')) {
        setError('Network error: Unable to reach backend server.');
      } else {
        setError(err.message || 'Verification failed. Please check your OTP and try again.');
      }
    } finally {
      setLoading(false);
      setLoadingStatus('');
    }
  };

  // Resend OTP trigger
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || loading) return;
    setError('');
    setSuccessMsg('');
    setLoading(true);
    setLoadingStatus('Resending code...');

    try {
      const response = await fetchWithAutoRetry(`${BASE_URL}/auth/send-superadmin-reset-otp`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await parseResponse(response);

      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || 'Failed to resend code.');
      }

      setSuccessMsg('A new verification code has been sent.');
      setResendCooldown(60);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingStatus('');
    }
  };

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

      {/* Main Card */}
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
          
          {/* Back to Login Link */}
          <button
            type="button"
            onClick={onBackToLogin}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors mb-6 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to sign in</span>
          </button>

          {/* STEP 1: REQUEST OTP */}
          {step === 1 && (
            <>
              <div className="space-y-1.5 text-left mb-6">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 mb-1">
                  <Mail className="h-5 w-5" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Forgot password?
                </h1>
                <p className="text-sm text-slate-500">
                  Enter your registered super administrator email address to receive a 6-digit verification code.
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

              <form onSubmit={handleSendOtp} className="space-y-4">
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
                    required
                    disabled={loading}
                    placeholder="superadmin@alertu.gov"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ color: '#0f172a', backgroundColor: '#ffffff' }}
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm !text-slate-900 text-slate-900 placeholder:text-slate-400 transition-all focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold text-sm transition-all shadow-sm hover:shadow active:scale-[0.99] mt-2 cursor-pointer"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      <span>{loadingStatus || 'Sending code...'}</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <span>Send Verification Code</span>
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  )}
                </Button>
              </form>
            </>
          )}

          {/* STEP 2: VERIFY OTP & NEW PASSWORD */}
          {step === 2 && (
            <>
              <div className="space-y-1.5 text-left mb-6">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 mb-1">
                  <KeyRound className="h-5 w-5" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Reset password
                </h1>
                <p className="text-sm text-slate-500">
                  Enter the 6-digit code sent to <strong className="text-slate-700">{email}</strong> along with your new password.
                </p>
              </div>

              {/* Success Alert */}
              {successMsg && (
                <Alert className="mb-6 rounded-xl border-emerald-200 bg-emerald-50 text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <AlertDescription className="text-xs font-medium leading-relaxed">
                    {successMsg}
                  </AlertDescription>
                </Alert>
              )}

              {/* Feedback Error Alert */}
              {error && (
                <Alert variant="destructive" className="mb-6 rounded-xl border-red-200 bg-red-50 text-red-900">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-xs font-medium leading-relaxed">
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleResetPassword} className="space-y-4">
                {/* OTP Input */}
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center justify-between">
                    <Label 
                      htmlFor="otp" 
                      className="text-xs font-semibold text-slate-700 tracking-wide"
                    >
                      6-Digit Verification Code
                    </Label>
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={resendCooldown > 0 || loading}
                      className="text-xs font-semibold text-blue-700 hover:text-blue-800 disabled:text-slate-400 hover:underline transition-colors cursor-pointer"
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                    </button>
                  </div>
                  <Input
                    id="otp"
                    type="text"
                    maxLength={6}
                    required
                    disabled={loading}
                    placeholder="123456"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    style={{ color: '#0f172a', backgroundColor: '#ffffff' }}
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-center tracking-[0.4em] font-mono font-bold text-base !text-slate-900 text-slate-900 placeholder:text-slate-400 transition-all focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
                  />
                </div>

                {/* New Password Input */}
                <div className="space-y-1.5 text-left">
                  <Label 
                    htmlFor="newPassword" 
                    className="text-xs font-semibold text-slate-700 tracking-wide"
                  >
                    New Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      required
                      disabled={loading}
                      placeholder="••••••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      style={{ color: '#0f172a', backgroundColor: '#ffffff' }}
                      className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-3.5 pr-10 text-sm !text-slate-900 text-slate-900 placeholder:text-slate-400 transition-all focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition-colors focus:outline-none cursor-pointer"
                      tabIndex="-1"
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Confirm New Password Input */}
                <div className="space-y-1.5 text-left">
                  <Label 
                    htmlFor="confirmPassword" 
                    className="text-xs font-semibold text-slate-700 tracking-wide"
                  >
                    Confirm New Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      disabled={loading}
                      placeholder="••••••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      style={{ color: '#0f172a', backgroundColor: '#ffffff' }}
                      className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-3.5 pr-10 text-sm !text-slate-900 text-slate-900 placeholder:text-slate-400 transition-all focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition-colors focus:outline-none cursor-pointer"
                      tabIndex="-1"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold text-sm transition-all shadow-sm hover:shadow active:scale-[0.99] mt-2 cursor-pointer"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      <span>{loadingStatus || 'Updating password...'}</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <span>Reset Password</span>
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                  )}
                </Button>
              </form>
            </>
          )}

          {/* STEP 3: SUCCESS CONFIRMATION */}
          {step === 3 && (
            <div className="text-center space-y-6 py-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Password reset complete
                </h1>
                <p className="text-sm text-slate-500">
                  Your Super Admin password has been successfully updated. You can now log into your account using your new credentials.
                </p>
              </div>

              <Button
                type="button"
                onClick={onBackToLogin}
                className="w-full h-11 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold text-sm transition-all shadow-sm hover:shadow active:scale-[0.99] cursor-pointer"
              >
                Return to sign in
              </Button>
            </div>
          )}

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
