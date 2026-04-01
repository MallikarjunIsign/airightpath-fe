import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Users, Award, Shield } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';
import { loginSchema } from '@/config/validation';

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: string })?.from;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    try {
      const { roles: loadedRoles } = await login({ email: data.email, password: data.password });
      showToast('Successfully logged in', 'success');

      if (from) {
        navigate(from, { replace: true });
        return;
      }

      if (loadedRoles.includes('ADMIN') || loadedRoles.includes('SUPER_ADMIN')) {
        navigate(ROUTES.ADMIN.DASHBOARD, { replace: true });
      } else {
        navigate(ROUTES.CANDIDATE.DASHBOARD, { replace: true });
      }
    } catch {
      // Error toast auto-handled by interceptor
    }
  };

  const stats = [
    { value: '10K+', label: 'Candidates Placed' },
    { value: '500+', label: 'Companies Trust Us' },
    { value: '95%', label: 'Success Rate' },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Brand */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
        <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(circle at 30% 40%, rgba(59, 130, 246, 0.3), transparent 60%), radial-gradient(circle at 70% 80%, rgba(6, 182, 212, 0.2), transparent 50%)' }} />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div>
            <div className="flex items-center gap-3 mb-16">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold gradient-brand shadow-lg">
                RP
              </div>
              <span className="text-white font-bold text-xl font-heading">RightPath</span>
            </div>
            <h1 className="text-4xl font-bold text-white mb-4 font-heading leading-tight">
              Find the Right Path<br />to Your Career
            </h1>
            <p className="text-slate-400 text-lg max-w-md">
              AI-powered recruitment platform connecting top talent with the right opportunities.
            </p>
          </div>

          {/* Floating stats */}
          <div className="flex gap-4 mt-8">
            {stats.map((stat) => (
              <div key={stat.label} className="glass rounded-xl px-5 py-4 flex-1">
                <p className="text-2xl font-bold text-white font-heading">{stat.value}</p>
                <p className="text-sm text-slate-400 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Feature highlights */}
          <div className="flex gap-6 mt-8">
            {[
              { icon: <Users size={18} />, text: 'Smart Matching' },
              { icon: <Award size={18} />, text: 'AI Assessments' },
              { icon: <Shield size={18} />, text: 'Proctored Exams' },
            ].map((f) => (
              <div key={f.text} className="flex items-center gap-2 text-slate-400 text-sm">
                <span className="text-cyan-400">{f.icon}</span>
                {f.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center bg-[var(--background)] px-6 py-12">
        <div className="w-full max-w-md animate-fade-in-up">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl gradient-brand shadow-lg mb-4">
              <span className="text-white text-xl font-bold">RP</span>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-[var(--text)] mb-2 font-heading">Welcome back</h1>
            <p className="text-[var(--textSecondary)]">Sign in to your RightPath account</p>
          </div>

          <div className="bg-[var(--cardBg)] border border-[var(--cardBorder)] rounded-xl p-8 shadow-card">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <Input
                type="email"
                label="Email"
                placeholder="you@example.com"
                leftIcon={<Mail size={18} />}
                error={errors.email?.message}
                {...register('email')}
              />

              <div>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  label="Password"
                  placeholder="Enter your password"
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
                  error={errors.password?.message}
                  {...register('password')}
                />
              </div>

              <div className="flex items-center justify-end">
                <Link
                  to={ROUTES.PUBLIC.FORGOT_PASSWORD}
                  className="text-sm text-[var(--primary)] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isSubmitting}
                className="w-full"
                rightIcon={<ArrowRight size={18} />}
              >
                Sign in
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-[var(--textSecondary)]">
                Don't have an account?{' '}
                <Link
                  to={ROUTES.PUBLIC.REGISTER}
                  className="text-[var(--primary)] hover:underline font-medium"
                >
                  Sign up
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
