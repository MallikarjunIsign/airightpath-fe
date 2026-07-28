import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Camera, Loader2, Lock, Save } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProfileImage } from '@/contexts/ProfileImageContext';
import { useToast } from '@/components/ui/Toast';
import { useRbac } from '@/hooks/useRbac';
import { userService } from '@/services/user.service';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { mobileSchema } from '@/config/validation';
import { ROUTES } from '@/config/routes';
import { MESSAGES } from '@/config/messages';
import { digitsOnly } from '@/utils/input.utils';
import type { UsersDto } from '@/types/user.types';

const profileSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email(),
  mobileNumber: mobileSchema,
  alternativeMobileNumber: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number starting with 6-9')
    .or(z.literal(''))
    .optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export function ProfilePage() {
  const { user } = useAuth();
  const { imageUrl, refreshImage } = useProfileImage();
  const { showToast } = useToast();
  const { hasAnyRole } = useRbac();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const changePasswordPath = hasAnyRole(['ADMIN', 'SUPER_ADMIN'])
    ? ROUTES.ADMIN.CHANGE_PASSWORD
    : ROUTES.CANDIDATE.CHANGE_PASSWORD;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
  });

  useEffect(() => {
    async function fetchProfile() {
      if (!user?.email) return;
      setLoading(true);
      try {
        const res = await userService.getByEmail(user.email);
        const data: UsersDto = res.data;
        reset({
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          mobileNumber: data.mobileNumber,
          alternativeMobileNumber: data.alternativeMobileNumber || '',
        });
      } catch {
        // Error toast auto-handled by interceptor
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [user?.email, reset, showToast]);

  const onSubmit = async (data: ProfileFormData) => {
    if (!user?.email) return;
    setSaving(true);
    try {
      await userService.update(user.email, {
        firstName: data.firstName,
        lastName: data.lastName,
        mobileNumber: data.mobileNumber,
        alternativeMobileNumber: data.alternativeMobileNumber || undefined,
      });
      showToast(MESSAGES.profile.updated, 'success');
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.email) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      showToast(MESSAGES.profile.imageTypeInvalid, 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast(MESSAGES.profile.imageTooLarge, 'error');
      return;
    }

    setUploadingPhoto(true);
    try {
      await userService.uploadProfileImage(user.email, file);
      await refreshImage();
      showToast(MESSAGES.profile.photoUpdated, 'success');
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-[var(--text)]">My Profile</h1>

      {/* Photo Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Photo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="relative">
              <button
                type="button"
                onClick={() => imageUrl && setShowImageViewer(true)}
                disabled={!imageUrl}
                title={imageUrl ? 'View profile photo' : undefined}
                className={`rounded-full ${imageUrl ? 'cursor-zoom-in' : 'cursor-default'}`}
              >
                <Avatar
                  src={imageUrl}
                  firstName={user?.firstName}
                  lastName={user?.lastName}
                  size="xl"
                  className="w-24 h-24 text-2xl border-2 border-[var(--border)]"
                />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[var(--primary)] text-white flex items-center justify-center hover:bg-[var(--primaryHover)] transition-colors"
              >
                {uploadingPhoto ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif"
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </div>
            <div>
              <p className="text-sm text-[var(--textSecondary)]">
                Upload a profile photo. Supported formats: JPEG, PNG, GIF. Max size: 5MB.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profile Form */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="First Name"
                {...register('firstName')}
                error={errors.firstName?.message}
              />
              <Input
                label="Last Name"
                {...register('lastName')}
                error={errors.lastName?.message}
              />
            </div>

            <Input
              label="Email"
              type="email"
              {...register('email')}
              disabled
              helperText="Email cannot be changed."
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Mobile Number"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                autoComplete="tel"
                placeholder="Enter 10-digit mobile number"
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
                label="Alternative Mobile Number"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                autoComplete="tel"
                placeholder="Optional"
                error={errors.alternativeMobileNumber?.message}
                {...register('alternativeMobileNumber')}
                onChange={(e) =>
                  setValue('alternativeMobileNumber', digitsOnly(e.target.value), {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
              />
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" isLoading={saving} leftIcon={<Save size={18} />}>
                Save Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Security / Change Password */}
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text)]">Password</p>
              <p className="text-sm text-[var(--textSecondary)]">
                Update your password to keep your account secure.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              leftIcon={<Lock size={18} />}
              onClick={() => navigate(changePasswordPath)}
            >
              Change password
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Profile image viewer */}
      {imageUrl && (
        <Modal
          isOpen={showImageViewer}
          onClose={() => setShowImageViewer(false)}
          title="Profile Photo"
          size="lg"
        >
          <div className="flex items-center justify-center">
            <img
              src={imageUrl}
              alt="Profile"
              className="max-h-[70vh] w-auto rounded-xl object-contain"
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
