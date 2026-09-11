import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { userService } from '@/services/user.service';
import { useToast } from '@/components/ui/Toast';
import type { CreateStaffRequest } from '@/types/user.types';

/**
 * Mirrors the server-side contract on `CreateStaffUserRequest`.
 *
 * Kept in step with it deliberately: the server is the authority and will
 * reject anything that slips through, but a rule enforced only there surfaces
 * as a generic 400 after the form has been filled in, which tells the person
 * filling it nothing useful.
 */
const schema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(25, 'Maximum 25 characters'),
  lastName: z.string().trim().min(1, 'Last name is required').max(25, 'Maximum 25 characters'),
  email: z.string().trim().min(6, 'Email is required').max(254).email('Enter a valid email address'),
  mobileNumber: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{6,20}$/, 'Enter a valid mobile number'),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .max(20, 'At most 20 characters')
    .regex(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>?/]/, 'Include at least one special character'),
  role: z.enum(['ADMIN', 'SUPER_ADMIN']),
});

type FormValues = z.infer<typeof schema>;

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
];

/**
 * Creates a staff account.
 *
 * <p>The account is created ready to use and no email is sent — the welcome
 * template greets a candidate and links to the candidate portal, which is the
 * wrong thing to send an administrator. So whoever fills this in is also the
 * person who has to pass on the password, and the form says so rather than
 * leaving them to find out when the new admin cannot log in.</p>
 */
export function CreateStaffModal({
  isOpen,
  onClose,
  onCreated,
}: Readonly<{
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful create, so the list can refresh. */
  onCreated: () => void;
}>) {
  const { showToast } = useToast();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      mobileNumber: '',
      password: '',
      role: 'ADMIN',
    },
  });

  const selectedRole = watch('role');

  const close = () => {
    reset();
    setShowPassword(false);
    onClose();
  };

  const onSubmit = async (values: FormValues) => {
    try {
      await userService.createStaff(values as CreateStaffRequest);
      showToast(`${values.email} created as ${selectedRole === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}`, 'success');
      onCreated();
      close();
    } catch {
      // The interceptor surfaces the server's message — a duplicate email or
      // mobile is the common case and its wording is better than anything
      // guessed here.
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="New staff account" size="md">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="First name" required error={errors.firstName?.message} {...register('firstName')} />
          <Input label="Last name" required error={errors.lastName?.message} {...register('lastName')} />
        </div>

        <Input
          type="email"
          label="Email"
          required
          placeholder="name@company.com"
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          label="Mobile number"
          required
          error={errors.mobileNumber?.message}
          {...register('mobileNumber')}
        />

        <Input
          type={showPassword ? 'text' : 'password'}
          label="Initial password"
          required
          error={errors.password?.message}
          helperText="You will need to pass this on — no email is sent for staff accounts."
          rightIcon={
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="text-[var(--textTertiary)] transition-colors hover:text-[var(--text)]"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          }
          {...register('password')}
        />

        <Select label="Role" required options={ROLE_OPTIONS} {...register('role')} />

        {/* Super admin is the highest privilege in the system and there is no
            "undo" beyond revoking the role afterwards, so it is called out
            before the button rather than explained after the fact. */}
        {selectedRole === 'SUPER_ADMIN' && (
          <div className="flex items-start gap-2 rounded-xl border border-[var(--warning)] bg-[var(--warning)]/5 px-4 py-3">
            <ShieldAlert size={16} className="mt-0.5 flex-shrink-0 text-[var(--warning)]" />
            <p className="text-sm text-[var(--text)]">
              A super admin has every permission in the system, including creating and removing
              other super admins.
            </p>
          </div>
        )}

        <div className="flex items-start gap-2 text-xs text-[var(--textTertiary)]">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <p>
            The account is active immediately. Only a super admin can create staff accounts or
            change anyone&rsquo;s role.
          </p>
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--borderMuted,var(--border))] pt-4">
          <Button type="button" variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            Create account
          </Button>
        </div>
      </form>
    </Modal>
  );
}
