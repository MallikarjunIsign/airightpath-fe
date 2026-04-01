import { z } from 'zod';

export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Please enter a valid email address');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/^[A-Z]/, 'Password must start with an uppercase letter')
  .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character');

export const mobileSchema = z
  .string()
  .regex(/^[0-9]{10}$/, 'Please enter a valid 10-digit mobile number');

export const resumeFileSchema = z
  .instanceof(File)
  .refine((file) => file.size <= 2 * 1024 * 1024, 'File size must be less than 2MB')
  .refine(
    (file) =>
      ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type),
    'Only PDF, DOC, and DOCX files are allowed'
  );

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z
  .object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: emailSchema,
    mobileNumber: mobileSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm password is required'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm password is required'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  contact: z.string().min(1, 'Email or mobile number is required'),
  otpMethod: z.enum(['email', 'mobile']),
});

export const resetPasswordSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm password is required'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const jobPostSchema = z.object({
  jobPrefix: z.string().min(1, 'Job prefix is required'),
  jobTitle: z.string().min(1, 'Job title is required'),
  companyName: z.string().min(1, 'Company name is required'),
  location: z.string().min(1, 'Location is required'),
  jobDescription: z.string().min(1, 'Job description is required').max(3000, 'Max 3000 characters'),
  keySkills: z.string().min(1, 'Skills are required'),
  experience: z.string().min(1, 'Experience is required'),
  education: z.string().min(1, 'Education is required'),
  salaryRange: z.string().optional(),
  jobType: z.string().min(1, 'Job type is required'),
  industry: z.string().optional(),
  department: z.string().optional(),
  role: z.string().optional(),
  numberOfOpenings: z.number().min(1, 'At least 1 opening required'),
  applicationDeadline: z.string().min(1, 'Deadline is required'),
});

export const jobApplicationSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: emailSchema,
  mobileNumber: mobileSchema,
  experience: z.string().min(1, 'Experience is required'),
  address: z.string().min(1, 'Address is required'),
  role: z.string().min(1, 'Role is required'),
});
