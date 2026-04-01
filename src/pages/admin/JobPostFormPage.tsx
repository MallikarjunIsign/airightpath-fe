import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Send, Briefcase } from 'lucide-react';
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

export function JobPostFormPage() {
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<JobPostFormData>({
    resolver: zodResolver(jobPostSchema),
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
    setSubmitting(true);
    try {
      await jobService.createJob(data);
      showToast('Job posted successfully!', 'success');
      reset();
    } catch {
      // Error toast auto-handled by interceptor
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
                placeholder="e.g. DEV-2024-001"
                error={errors.jobPrefix?.message}
                {...register('jobPrefix')}
              />
              <Input
                label="Job Title"
                placeholder="e.g. Senior Software Engineer"
                error={errors.jobTitle?.message}
                {...register('jobTitle')}
              />
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Company Name"
                placeholder="e.g. Acme Corp"
                error={errors.companyName?.message}
                {...register('companyName')}
              />
              <Input
                label="Location"
                placeholder="e.g. Hyderabad, India"
                error={errors.location?.message}
                {...register('location')}
              />
            </div>

            {/* Job Description */}
            <Textarea
              label="Job Description"
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
                placeholder="e.g. React, Node.js, TypeScript"
                error={errors.keySkills?.message}
                {...register('keySkills')}
              />
              <Input
                label="Experience"
                placeholder="e.g. 3-5 years"
                error={errors.experience?.message}
                {...register('experience')}
              />
            </div>

            {/* Row 4 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Education"
                placeholder="e.g. B.Tech in CS"
                error={errors.education?.message}
                {...register('education')}
              />
              <Input
                label="Salary"
                placeholder="e.g. 10-15 LPA"
                error={errors.salaryRange?.message}
                {...register('salaryRange')}
              />
            </div>

            {/* Row 5 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Job Type"
                options={JOB_TYPE_OPTIONS}
                error={errors.jobType?.message}
                {...register('jobType')}
              />
              <Input
                label="Industry"
                placeholder="e.g. Information Technology"
                error={errors.industry?.message}
                {...register('industry')}
              />
            </div>

            {/* Row 6 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Department"
                placeholder="e.g. Engineering"
                error={errors.department?.message}
                {...register('department')}
              />
              <Input
                label="Role"
                placeholder="e.g. Backend Developer"
                error={errors.role?.message}
                {...register('role')}
              />
            </div>

            {/* Row 7 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Number of Openings"
                type="number"
                min={1}
                error={errors.numberOfOpenings?.message}
                {...register('numberOfOpenings', { valueAsNumber: true })}
              />
              <Input
                label="Application Deadline"
                type="date"
                error={errors.applicationDeadline?.message}
                {...register('applicationDeadline')}
              />
            </div>

            {/* Submit */}
            <div className="flex justify-end pt-4 border-t border-[var(--border)]">
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
                leftIcon={!submitting ? <Send size={16} /> : undefined}
              >
                Post Job
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
