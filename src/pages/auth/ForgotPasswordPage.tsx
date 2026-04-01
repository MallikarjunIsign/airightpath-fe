import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Phone, Lock, Eye, EyeOff, ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/components/ui/Toast';
import { authService } from '@/services/auth.service';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';
import { forgotPasswordSchema, resetPasswordSchema } from '@/config/validation';

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

type Step = 'contact' | 'otp' | 'reset';

export function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('contact');
  const [contactValue, setContactValue] = useState('');
  const [otpMethod, setOtpMethod] = useState<'email' | 'mobile'>('email');
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const contactForm = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      contact: '',
      otpMethod: 'email',
    },
  });

  const resetForm = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  });

  const handleGenerateOtp = async (data: ForgotPasswordFormValues) => {
    try {
      await authService.generateOtp({
        type: data.otpMethod,
        value: data.contact,
      });
      setContactValue(data.contact);
      setOtpMethod(data.otpMethod);
      showToast(`OTP sent to your ${data.otpMethod}`, 'success');
      setStep('otp');
    } catch {
      // Error toast auto-handled by interceptor
    }
  };

  const handleValidateOtp = async () => {
    if (!otp || otp.length < 4) {
      showToast('Please enter a valid OTP', 'error');
      return;
    }

    setOtpLoading(true);
    try {
      await authService.validateOtp({
        otp,
        email: otpMethod === 'email' ? contactValue : null,
        mobile: otpMethod === 'mobile' ? contactValue : null,
      });
      showToast('OTP verified successfully', 'success');

      localStorage.setItem('rightpath_resetMethod', otpMethod);
      localStorage.setItem('rightpath_resetValue', contactValue);

      setStep('reset');
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setOtpLoading(false);
    }
  };

  const handleUpdatePassword = async (data: ResetPasswordFormValues) => {
    try {
      const payload = otpMethod === 'email'
        ? { email: contactValue, newPassword: data.newPassword }
        : { mobile: contactValue, newPassword: data.newPassword };

      await authService.updatePassword(payload);
      showToast('Password updated successfully', 'success');

      localStorage.removeItem('rightpath_resetMethod');
      localStorage.removeItem('rightpath_resetValue');

      navigate(ROUTES.PUBLIC.LOGIN, { replace: true });
    } catch {
      // Error toast auto-handled by interceptor
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case 'contact':
        return 'Forgot password?';
      case 'otp':
        return 'Verify OTP';
      case 'reset':
        return 'Set new password';
    }
  };

  const getStepDescription = () => {
    switch (step) {
      case 'contact':
        return 'Enter your email or mobile to receive a verification code';
      case 'otp':
        return `Enter the OTP sent to your ${otpMethod}`;
      case 'reset':
        return 'Create a new password for your account';
    }
  };

  const getStepIcon = () => {
    switch (step) {
      case 'contact':
        return <Mail size={28} />;
      case 'otp':
        return <ShieldCheck size={28} />;
      case 'reset':
        return <Lock size={28} />;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md animate-fade-in-up">
        {/* Branded Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-brand shadow-lg mb-4 text-white">
            {getStepIcon()}
          </div>
          <h1 className="text-3xl font-bold text-[var(--text)] mb-2 font-heading">{getStepTitle()}</h1>
          <p className="text-[var(--textSecondary)]">{getStepDescription()}</p>
        </div>

        {/* Step Indicators */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {(['contact', 'otp', 'reset'] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all duration-300 ${
                step === s
                  ? 'w-8 gradient-brand'
                  : i < ['contact', 'otp', 'reset'].indexOf(step)
                  ? 'w-8 bg-[var(--primary)] opacity-60'
                  : 'w-2 bg-[var(--border)]'
              }`}
            />
          ))}
        </div>

        {/* Form Card */}
        <div className="bg-[var(--cardBg)] border border-[var(--cardBorder)] rounded-xl p-8 shadow-card">
          {/* Step 1: Enter contact */}
          {step === 'contact' && (
            <form onSubmit={contactForm.handleSubmit(handleGenerateOtp)} className="space-y-6">
              <Input
                type="text"
                label="Email or Mobile Number"
                placeholder="you@example.com or 9876543210"
                leftIcon={<Mail size={18} />}
                error={contactForm.formState.errors.contact?.message}
                {...contactForm.register('contact')}
              />

              <div>
                <label className="block text-sm font-medium text-[var(--text)] mb-3">
                  Send OTP via
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer px-4 py-2.5 rounded-[10px] border border-[var(--border)] hover:border-[var(--primary)] transition-colors flex-1">
                    <input
                      type="radio"
                      value="email"
                      className="w-4 h-4 text-[var(--primary)] accent-[var(--primary)]"
                      {...contactForm.register('otpMethod')}
                    />
                    <Mail size={16} className="text-[var(--textSecondary)]" />
                    <span className="text-sm text-[var(--text)]">Email</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer px-4 py-2.5 rounded-[10px] border border-[var(--border)] hover:border-[var(--primary)] transition-colors flex-1">
                    <input
                      type="radio"
                      value="mobile"
                      className="w-4 h-4 text-[var(--primary)] accent-[var(--primary)]"
                      {...contactForm.register('otpMethod')}
                    />
                    <Phone size={16} className="text-[var(--textSecondary)]" />
                    <span className="text-sm text-[var(--text)]">Mobile</span>
                  </label>
                </div>
                {contactForm.formState.errors.otpMethod && (
                  <p className="mt-1.5 text-sm text-[var(--error)]">
                    {contactForm.formState.errors.otpMethod.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={contactForm.formState.isSubmitting}
                className="w-full"
              >
                Send OTP
              </Button>
            </form>
          )}

          {/* Step 2: Enter OTP */}
          {step === 'otp' && (
            <div className="space-y-6">
              <div className="flex justify-center mb-2">
                <div className="w-16 h-16 bg-[var(--primaryLight)] rounded-2xl flex items-center justify-center">
                  <ShieldCheck size={32} className="text-[var(--primary)]" />
                </div>
              </div>

              <Input
                type="text"
                label="Enter OTP"
                placeholder="Enter the verification code"
                leftIcon={<KeyRound size={18} />}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                maxLength={6}
              />

              <Button
                type="button"
                variant="primary"
                size="lg"
                isLoading={otpLoading}
                onClick={handleValidateOtp}
                className="w-full"
              >
                Verify OTP
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setStep('contact')}
                  className="text-sm text-[var(--textSecondary)] hover:text-[var(--text)] transition-colors"
                >
                  Didn't receive the code? Go back
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Set new password */}
          {step === 'reset' && (
            <form onSubmit={resetForm.handleSubmit(handleUpdatePassword)} className="space-y-6">
              <Input
                type={showPassword ? 'text' : 'password'}
                label="New Password"
                placeholder="Enter new password"
                leftIcon={<Lock size={18} />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[var(--textTertiary)] hover:text-[var(--text)] transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
                helperText="Must start with uppercase and contain a special character"
                error={resetForm.formState.errors.newPassword?.message}
                {...resetForm.register('newPassword')}
              />

              <Input
                type={showConfirmPassword ? 'text' : 'password'}
                label="Confirm Password"
                placeholder="Re-enter new password"
                leftIcon={<Lock size={18} />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="text-[var(--textTertiary)] hover:text-[var(--text)] transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
                error={resetForm.formState.errors.confirmPassword?.message}
                {...resetForm.register('confirmPassword')}
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={resetForm.formState.isSubmitting}
                className="w-full"
              >
                Update password
              </Button>
            </form>
          )}

          {/* Back to login */}
          <div className="mt-6">
            <Link
              to={ROUTES.PUBLIC.LOGIN}
              className="flex items-center justify-center gap-2 text-sm text-[var(--textSecondary)] hover:text-[var(--text)] transition-colors"
            >
              <ArrowLeft size={16} />
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
