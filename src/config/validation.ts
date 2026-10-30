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

/** A first or last name: letters, spaces, apostrophes, hyphens and full stops, starting with a letter. */
const nameRule = /^\p{L}[\p{L}\p{M}\s'.-]*$/u;
const NAME_MESSAGE = 'Use letters only (no numbers or symbols)';
export const firstNameSchema = z.string().trim().min(1, 'First name is required').regex(nameRule, NAME_MESSAGE);
export const lastNameSchema = z.string().trim().min(1, 'Last name is required').regex(nameRule, NAME_MESSAGE);

export const mobileSchema = z
  .string()
  .min(1, 'Mobile number is required')
  // Indian mobile format: 10 digits starting 6-9 (rejects 0000000000, 1111111111, etc.)
  .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number starting with 6-9');

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
    firstName: firstNameSchema,
    lastName: lastNameSchema,
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
  // The prefix becomes part of the web address of a dozen pages, so it is checked as it
  // is typed rather than after the server refuses it. Same rule as the backend.
  jobPrefix: z
    .string()
    .trim()
    .min(1, 'Job prefix is required')
    .regex(/^[A-Za-z0-9_-]+$/, 'Use only letters, numbers, hyphens (-) and underscores (_). No spaces, slashes or other symbols.'),
  jobTitle: z.string().trim().min(1, 'Job title is required'),
  companyName: z.string().trim().min(1, 'Company name is required'),
  location: z.string().trim().min(1, 'Location is required'),
  jobDescription: z
    .string()
    .trim()
    .min(1, 'Job description is required')
    .max(3000, 'Job description must be 3000 characters or fewer'),
  keySkills: z.string().trim().min(1, 'At least one skill is required'),
  experience: z.string().trim().min(1, 'Experience is required'),
  education: z.string().trim().min(1, 'Education is required'),
  salaryRange: z.string().optional(),
  jobType: z.string().min(1, 'Please select a job type'),
  industry: z.string().optional(),
  // Required: every post is categorised by department for reporting and
  // candidate search, so an uncategorised one leaves gaps in both.
  department: z.string().trim().min(1, 'Department is required'),
  // Required: the role is what the job lists are keyed on visually, so a post
  // without one shows up unidentifiable.
  role: z.string().trim().min(1, 'Job role is required'),
  numberOfOpenings: z
    .number({ error: 'Number of openings is required' })
    .int('Openings must be a whole number (no decimals)')
    .min(1, 'At least 1 opening is required')
    .max(100000, 'Number of openings looks too high'),
  applicationDeadline: z
    .string()
    .min(1, 'Application deadline is required')
    .refine((val) => {
      // Backend stores a LocalDate and only closes applications the day AFTER the
      // deadline, so today is still valid. Compare at local day granularity.
      const selected = new Date(`${val}T00:00:00`);
      if (Number.isNaN(selected.getTime())) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return selected.getTime() >= today.getTime();
    }, 'Deadline cannot be in the past'),
});

/**
 * Editing an existing post reuses the create rules, except that an already
 * expired job may keep its original deadline — otherwise fixing a typo on a
 * closed posting would force the admin to silently reopen it.
 */
export function jobEditSchema(originalDeadline?: string) {
  // The prefix cannot be changed on an existing job, so a job created before the
  // rule existed must not be made uneditable by it.
  const base = jobPostSchema.extend({ jobPrefix: z.string().trim().min(1, 'Job prefix is required') });
  if (!originalDeadline) return base;
  return base.extend({
    applicationDeadline: z
      .string()
      .min(1, 'Application deadline is required')
      .refine((val) => {
        if (val === originalDeadline) return true;
        const selected = new Date(`${val}T00:00:00`);
        if (Number.isNaN(selected.getTime())) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return selected.getTime() >= today.getTime();
      }, 'Deadline cannot be in the past'),
  });
}

export const jobApplicationSchema = z.object({
  firstName: firstNameSchema,
  lastName: lastNameSchema,
  email: emailSchema,
  mobileNumber: mobileSchema,
  experience: z.string().min(1, 'Experience is required'),
  address: z.string().min(1, 'Address is required'),
  role: z.string().min(1, 'Role is required'),
  // Optional referral — no validation; a candidate may leave neither, either, or both.
  referralName: z.string().optional(),
  referralId: z.string().optional(),
});
