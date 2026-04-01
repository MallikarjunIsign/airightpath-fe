import { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { authService } from '@/services/auth.service';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { changePasswordSchema } from '@/config/validation';

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

export function ChangePasswordPage() {
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { user } = useAuth();
  const { showToast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      oldPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: ChangePasswordFormValues) => {
    if (!user?.email) {
      showToast('Unable to identify your account. Please log in again.', 'error');
      return;
    }

    try {
      await authService.changePassword({
        email: user.email,
        oldPassword: data.oldPassword,
        newPassword: data.newPassword,
        confirmPassword: data.confirmPassword,
      });
      showToast('Password changed successfully', 'success');
      reset();
    } catch {
      // Error toast auto-handled by interceptor
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md">
        {/* Branded Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[var(--primary)] rounded-2xl mb-4">
            <span className="text-white text-2xl font-bold">RP</span>
          </div>
          <h1 className="text-3xl font-bold text-[var(--text)] mb-2">Change password</h1>
          <p className="text-[var(--textSecondary)]">Update your account password</p>
        </div>

        {/* Form Card */}
        <div className="bg-[var(--cardBg)] border border-[var(--cardBorder)] rounded-lg p-8 shadow-lg">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <Input
              type={showOldPassword ? 'text' : 'password'}
              label="Current Password"
              placeholder="Enter current password"
              leftIcon={<Lock size={18} />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowOldPassword(!showOldPassword)}
                  className="text-[var(--textTertiary)] hover:text-[var(--text)] transition-colors"
                >
                  {showOldPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              }
              error={errors.oldPassword?.message}
              {...register('oldPassword')}
            />

            <Input
              type={showNewPassword ? 'text' : 'password'}
              label="New Password"
              placeholder="Enter new password"
              leftIcon={<Lock size={18} />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="text-[var(--textTertiary)] hover:text-[var(--text)] transition-colors"
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              }
              helperText="Must start with uppercase and contain a special character"
              error={errors.newPassword?.message}
              {...register('newPassword')}
            />

            <Input
              type={showConfirmPassword ? 'text' : 'password'}
              label="Confirm New Password"
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
              Change password
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
