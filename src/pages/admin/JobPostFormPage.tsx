import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Send, Briefcase } from 'lucide-react';
import { jobPostSchema } from '@/config/validation';
import { jobService } from '@/services/job.service';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

type JobPostFormData = z.infer<typeof jobPostSchema>;

const JOB_TYPE_OPTIONS = [
  { value: '', label: 'Select job type' },
  { value: 'Full-Time', label: 'Full-Time' },
  { value: 'Part-Time', label: 'Part-Time' },
  { value: 'Contract', label: 'Contract' },
  { value: 'Internship', label: 'Internship' },
];

/** Current local date-time as `YYYY-MM-DDTHH:mm` for a datetime-local `min`. */
function localDateTimeNow(): string {
  const now = new Date();
  now.setSeconds(0, 0);
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
}

// Keystrokes that would produce a non-integer opening count.
const BLOCKED_NUMBER_KEYS = new Set(['.', ',', 'e', 'E', '+', '-']);

export function JobPostFormPage() {
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  // Computed once on mount so the deadline floor doesn't drift each render.
  const [minDeadline] = useState(localDateTimeNow);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<JobPostFormData>({
    resolver: zodResolver(jobPostSchema),
    mode: 'onChange',
    defaultValues: {
      jobPrefix: '',
      jobTitle: '',
      companyName: '',
      location: '',
      jobDescription: '',
      keySkills: '',
      experience: '',
      education: '',
      salaryRange: '',
      jobType: '',
      industry: '',
      department: '',
      role: '',
      numberOfOpenings: 1,
      applicationDeadline: '',
    },
  });

  async function onSubmit(data: JobPostFormData) {
    if (submitting) return;
    setSubmitting(true);
    try {
      await jobService.createJob(data);
      showToast('Job posted successfully!', 'success');
      reset();
    } catch {
      // Error toast (with the server's specific message) auto-handled by the API interceptor.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">Create Job Post</h1>
        <p className="text-[var(--textSecondary)] mt-1">
          Fill in the details below to create a new job posting
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Briefcase size={20} className="text-[var(--primary)]" />
            <CardTitle>Job Details</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Row 1 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Job Prefix"
                required
                placeholder="e.g. DEV-2024-001"
                error={errors.jobPrefix?.message}
                {...register('jobPrefix')}
              />
              <Input
                label="Job Title"
                required
                placeholder="e.g. Senior Software Engineer"
                error={errors.jobTitle?.message}
                {...register('jobTitle')}
              />
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Company Name"
                required
                placeholder="e.g. Acme Corp"
                error={errors.companyName?.message}
                {...register('companyName')}
              />
              <Input
                label="Location"
                required
                placeholder="e.g. Hyderabad, India"
                error={errors.location?.message}
                {...register('location')}
              />
            </div>

            {/* Job Description */}
            <Textarea
              label="Job Description"
              required
              placeholder="Provide a detailed job description..."
              maxLength={3000}
              showCharCount
              error={errors.jobDescription?.message}
              {...register('jobDescription')}
            />

            {/* Row 3 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Skills"
                required
                placeholder="e.g. React, Node.js, TypeScript"
                error={errors.keySkills?.message}
                {...register('keySkills')}
              />
              <Input
                label="Experience"
                required
                placeholder="e.g. 3-5 years"
                error={errors.experience?.message}
                {...register('experience')}
              />
            </div>

            {/* Row 4 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Education"
                required
                placeholder="e.g. B.Tech in CS"
                error={errors.education?.message}
                {...register('education')}
              />
              <Input
                label="Salary"
                placeholder="e.g. 10-15 LPA"
                helperText="Optional"
                error={errors.salaryRange?.message}
                {...register('salaryRange')}
              />
            </div>

            {/* Row 5 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Job Type"
                required
                options={JOB_TYPE_OPTIONS}
                error={errors.jobType?.message}
                {...register('jobType')}
              />
              <Input
                label="Industry"
                placeholder="e.g. Information Technology"
                helperText="Optional"
                error={errors.industry?.message}
                {...register('industry')}
              />
            </div>

            {/* Row 6 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Department"
                placeholder="e.g. Engineering"
                helperText="Optional"
                error={errors.department?.message}
                {...register('department')}
              />
              <Input
                label="Role"
                placeholder="e.g. Backend Developer"
                helperText="Optional"
                error={errors.role?.message}
                {...register('role')}
              />
            </div>

            {/* Row 7 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Number of Openings"
                required
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                placeholder="e.g. 3"
                helperText="Whole numbers only"
                onKeyDown={(e) => {
                  if (BLOCKED_NUMBER_KEYS.has(e.key)) e.preventDefault();
                }}
                error={errors.numberOfOpenings?.message}
                {...register('numberOfOpenings', { valueAsNumber: true })}
              />
              <Input
                label="Application Deadline"
                required
                type="datetime-local"
                min={minDeadline}
                helperText="Must be a future date and time"
                error={errors.applicationDeadline?.message}
                {...register('applicationDeadline')}
              />
            </div>

            {/* Submit */}
            <div className="flex flex-col items-end gap-2 pt-4 border-t border-[var(--border)]">
              {!isValid && (
                <p className="text-sm text-[var(--textSecondary)]">
                  Fill in all required fields (<span className="text-[var(--error)]">*</span>) to
                  enable posting.
                </p>
              )}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => reset()}
                  className="mr-3"
                  disabled={submitting}
                >
                  Reset
                </Button>
                <Button
                  type="submit"
                  isLoading={submitting}
                  disabled={!isValid || submitting}
                  leftIcon={!submitting ? <Send size={16} /> : undefined}
                >
                  Post Job
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
