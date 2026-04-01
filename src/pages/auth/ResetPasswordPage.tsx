import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/components/ui/Toast';
import { authService } from '@/services/auth.service';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';
import { resetPasswordSchema } from '@/config/validation';

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const resetMethod = localStorage.getItem('rightpath_resetMethod') as 'email' | 'mobile' | null;
  const resetValue = localStorage.getItem('rightpath_resetValue');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: ResetPasswordFormValues) => {
    if (!resetMethod || !resetValue) {
      showToast('Session expired. Please start the forgot password flow again.', 'error');
      navigate(ROUTES.PUBLIC.FORGOT_PASSWORD, { replace: true });
      return;
    }

    try {
      const payload = resetMethod === 'email'
        ? { email: resetValue, newPassword: data.newPassword }
        : { mobile: resetValue, newPassword: data.newPassword };

      await authService.updatePassword(payload);
      showToast('Password updated successfully', 'success');

      localStorage.removeItem('rightpath_resetMethod');
      localStorage.removeItem('rightpath_resetValue');

      navigate(ROUTES.PUBLIC.LOGIN, { replace: true });
    } catch {
      // Error toast auto-handled by interceptor
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md animate-fade-in-up">
        {/* Branded Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-brand shadow-lg mb-4">
            <KeyRound size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--text)] mb-2 font-heading">Reset password</h1>
          <p className="text-[var(--textSecondary)]">Enter your new password</p>
        </div>

        {/* Form Card */}
        <div className="bg-[var(--cardBg)] border border-[var(--cardBorder)] rounded-xl p-8 shadow-card">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
              error={errors.newPassword?.message}
              {...register('newPassword')}
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
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isSubmitting}
              className="w-full"
            >
              Update password
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
