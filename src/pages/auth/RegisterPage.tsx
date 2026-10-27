import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, User, Phone, ArrowRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { extractApiError } from '@/services/api.service';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/config/messages';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { ROUTES } from '@/config/routes';
import { registerSchema } from '@/config/validation';
import { digitsOnly } from '@/utils/input.utils';

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { register: authRegister } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      mobileNumber: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: RegisterFormValues) => {
    try {
      await authRegister({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        mobileNumber: data.mobileNumber,
        password: data.password,
      });
      showToast(MESSAGES.auth.registerSuccess, 'success');
      navigate(ROUTES.PUBLIC.LOGIN, { replace: true });
    } catch (err) {
      // The toast itself is handled by the interceptor, but it can only say
      // "these details are taken" — one code covers both a duplicate email and
      // a duplicate mobile. The server's own wording is the only thing that
      // says which, so use it to mark the field the candidate has to change.
      const { code, serverMessage } = extractApiError(err);
      if (code !== 'USER_ALREADY_EXISTS') return;

      const said = (serverMessage ?? '').toLowerCase();
      if (said.includes('mobile') || said.includes('phone')) {
        setError('mobileNumber', { message: MESSAGES.auth.mobileTaken });
        setFocus('mobileNumber');
      } else if (said.includes('email')) {
        setError('email', { message: MESSAGES.auth.emailTaken });
        setFocus('email');
      }
      // Anything else keeps the interceptor's neutral toast — better than
      // guessing a field and pointing at the wrong one.
    }
  };

  const steps = [
    'Create your free account',
    'Build your professional profile',
    'Take AI-powered assessments',
    'Get matched with top companies',
  ];

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Brand */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
        <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(circle at 30% 40%, rgba(59, 130, 246, 0.3), transparent 60%), radial-gradient(circle at 70% 80%, rgba(6, 182, 212, 0.2), transparent 50%)' }} />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div>
            <div className="flex items-center mb-16">
              <Logo className="h-10 w-auto bg-white rounded-xl px-3 py-2 shadow-lg" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-4 font-heading leading-tight">
              Start Your Journey<br />With RightPath
            </h1>
            <p className="text-slate-400 text-lg max-w-md">
              Join thousands of candidates who've found their perfect career through our platform.
            </p>
          </div>

          {/* Step progress */}
          <div className="space-y-4 mt-8">
            <p className="text-sm text-slate-500 uppercase tracking-wider font-medium">How it works</p>
            {steps.map((stepText, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full gradient-brand flex items-center justify-center text-white text-xs font-bold shadow-sm">
                  {i + 1}
                </div>
                <span className="text-slate-300 text-sm">{stepText}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center bg-[var(--background)] px-6 py-12">
        <div className="w-full max-w-md animate-fade-in-up">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <Logo className="h-10 w-auto" />
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-[var(--text)] mb-2 font-heading">Create an account</h1>
            <p className="text-[var(--textSecondary)]">Join RightPath to get started</p>
          </div>

          <div className="bg-[var(--cardBg)] border border-[var(--cardBorder)] rounded-xl p-8 shadow-card">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  type="text"
                  label="First Name"
                  placeholder="John"
                  leftIcon={<User size={18} />}
                  error={errors.firstName?.message}
                  {...register('firstName')}
                />

                <Input
                  type="text"
                  label="Last Name"
                  placeholder="Doe"
                  leftIcon={<User size={18} />}
                  error={errors.lastName?.message}
                  {...register('lastName')}
                />
              </div>

              <Input
                type="email"
                label="Email"
                placeholder="you@example.com"
                leftIcon={<Mail size={18} />}
                error={errors.email?.message}
                {...register('email')}
              />

              <Input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                autoComplete="tel"
                label="Mobile Number"
                placeholder="9876543210"
                leftIcon={<Phone size={18} />}
                error={errors.mobileNumber?.message}
                {...register('mobileNumber')}
                onChange={(e) =>
                  setValue('mobileNumber', digitsOnly(e.target.value), {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
              />

              <Input
                type={showPassword ? 'text' : 'password'}
                label="Password"
                placeholder="Create a strong password"
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
                error={errors.password?.message}
                {...register('password')}
              />

              <Input
                type={showConfirmPassword ? 'text' : 'password'}
                label="Confirm Password"
                placeholder="Re-enter your password"
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
                error={errors.confirmPassword?.message}
                {...register('confirmPassword')}
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isSubmitting}
                className="w-full"
                rightIcon={<ArrowRight size={18} />}
              >
                Create account
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-[var(--textSecondary)]">
                Already have an account?{' '}
                <Link
                  to={ROUTES.PUBLIC.LOGIN}
                  className="text-[var(--primary)] hover:underline font-medium"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
