import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Send, Upload, FileText, X, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { jobApplicationService } from '@/services/job-application.service';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ROUTES } from '@/config/routes';
import { jobApplicationSchema } from '@/config/validation';
import { validateResumeFile } from '@/utils/file.utils';
import type { JobPostDTO, JobApplicationDTO } from '@/types/job.types';

type JobApplicationFormData = z.infer<typeof jobApplicationSchema>;

export function JobApplicationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const locationState = location.state as {
    job?: JobPostDTO;
    existingApplication?: JobApplicationDTO;
  } | null;
  const job = locationState?.job;
  const passedApplication = locationState?.existingApplication;

  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [existingApplication, setExistingApplication] = useState<JobApplicationDTO | null>(null);
  const [isDeadlinePassed, setIsDeadlinePassed] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<JobApplicationFormData>({
    resolver: zodResolver(jobApplicationSchema),
    defaultValues: {
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      email: user?.email || '',
      mobileNumber: user?.mobileNumber || '',
      experience: '',
      address: '',
      role: job?.role || job?.jobTitle || '',
    },
  });

  // Check deadline
  useEffect(() => {
    if (job?.applicationDeadline) {
      const deadline = new Date(job.applicationDeadline);
      const today = new Date(new Date().toDateString());
      if (deadline < today) {
        setIsDeadlinePassed(true);
      }
    }
  }, [job?.applicationDeadline]);

  // Check for existing application - use passed data or fetch from API
  useEffect(() => {
    async function checkExisting() {
      if (!job?.jobPrefix || !user?.email) return;

      // If application data was passed from MyApplicationsPage, use it
      if (passedApplication) {
        setExistingApplication(passedApplication);
        setIsEditMode(true);
        reset({
          firstName: passedApplication.firstName,
          lastName: passedApplication.lastName,
          email: passedApplication.email || passedApplication.userEmail || user.email,
          mobileNumber: passedApplication.mobileNumber,
          experience: passedApplication.experience,
          address: passedApplication.address,
          role: passedApplication.jobRole,
        });
        return;
      }

      // Otherwise, fetch from API
      setLoading(true);
      try {
        const res = await jobApplicationService.getByPrefixAndEmail(job.jobPrefix, user.email);
        if (res.data) {
          setExistingApplication(res.data);
          setIsEditMode(true);
          reset({
            firstName: res.data.firstName,
            lastName: res.data.lastName,
            email: res.data.email || res.data.userEmail || user.email,
            mobileNumber: res.data.mobileNumber,
            experience: res.data.experience,
            address: res.data.address,
            role: res.data.jobRole,
          });
        }
      } catch {
        // No existing application - that's fine
      } finally {
        setLoading(false);
      }
    }
    checkExisting();
  }, [job?.jobPrefix, user?.email, reset, passedApplication]);

  const handleResumeSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateResumeFile(file);
    if (error) {
      showToast(error, 'error');
      return;
    }
    setResumeFile(file);
  };

  const onSubmit = async (data: JobApplicationFormData) => {
    if (!job?.jobPrefix) {
      showToast('No job selected. Please go back and select a job.', 'error');
      return;
    }

    if (!isEditMode && !resumeFile) {
      showToast('Please upload your resume.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const jobApplication = JSON.stringify({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        mobileNumber: data.mobileNumber,
        experience: data.experience,
        address: data.address,
        jobRole: data.role,
        jobPrefix: job.jobPrefix,
      });

      const formData = new FormData();
      formData.append('jobApplication', new Blob([jobApplication], { type: 'application/json' }));

      if (resumeFile) {
        formData.append('resume', resumeFile);
      }

      if (isEditMode) {
        await jobApplicationService.update(formData);
        showToast('Application updated successfully.', 'success');
      } else {
        await jobApplicationService.apply(formData);
        showToast('Application submitted successfully.', 'success');
      }

      navigate(ROUTES.CANDIDATE.APPLICATIONS);
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setSubmitting(false);
    }
  };

  if (!job) {
    return (
      <div className="text-center py-16">
        <p className="text-lg text-[var(--textSecondary)]">
          No job selected. Please go to the Events page and select a job to apply.
        </p>
        <Button className="mt-4" onClick={() => navigate(ROUTES.CANDIDATE.EVENTS)}>
          Browse Jobs
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">
          {isEditMode ? 'Update Application' : 'Apply for Job'}
        </h1>
        <p className="mt-1 text-[var(--textSecondary)]">
          {job.jobTitle} at {job.companyName}
        </p>
        {isEditMode && existingApplication?.status && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-[var(--textSecondary)]">Current Status:</span>
            <Badge
              variant={
                existingApplication.status === 'APPLIED' ? 'info' :
                existingApplication.status === 'SHORTLISTED' ? 'success' :
                existingApplication.status === 'REJECTED' ? 'error' : 'primary'
              }
              size="sm"
            >
              {existingApplication.status}
            </Badge>
          </div>
        )}
      </div>

      {isDeadlinePassed && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">
            The application deadline for this job has passed. You can no longer submit or update your application.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Application Form</CardTitle>
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
              error={errors.email?.message}
              disabled={!!user?.email}
            />

            <Input
              label="Mobile Number"
              {...register('mobileNumber')}
              error={errors.mobileNumber?.message}
              placeholder="Enter 10-digit mobile number"
            />

            <Input
              label="Experience"
              {...register('experience')}
              error={errors.experience?.message}
              placeholder="e.g., 2 years"
            />

            <Input
              label="Address"
              {...register('address')}
              error={errors.address?.message}
              placeholder="Enter your address"
            />

            <Input
              label="Role"
              {...register('role')}
              error={errors.role?.message}
              placeholder="Applied role"
            />

            {/* Resume Upload */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[var(--text)]">
                Resume {!isEditMode && <span className="text-[var(--error)]">*</span>}
              </label>

              {/* Show existing resume info in edit mode */}
              {isEditMode && !resumeFile && existingApplication?.resumeFileName && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">
                      Resume already uploaded
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-500 truncate">
                      {existingApplication.resumeFileName}
                    </p>
                  </div>
                </div>
              )}

              <div
                className="border-2 border-dashed border-[var(--border)] rounded-lg p-6 text-center cursor-pointer hover:border-[var(--primary)] transition-colors"
                onClick={() => document.getElementById('app-resume-input')?.click()}
              >
                <input
                  id="app-resume-input"
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={handleResumeSelect}
                />
                <Upload className="w-8 h-8 mx-auto text-[var(--textTertiary)] mb-2" />
                <p className="text-sm text-[var(--textSecondary)]">
                  {isEditMode
                    ? 'Click to upload a new resume to replace the existing one (PDF, DOC, DOCX - Max 2MB)'
                    : 'Click to upload resume (PDF, DOC, DOCX - Max 2MB)'}
                </p>
              </div>
              {resumeFile && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface1)] border border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[var(--primary)]" />
                    <span className="text-sm text-[var(--text)]">{resumeFile.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setResumeFile(null)}
                    className="text-[var(--textSecondary)] hover:text-[var(--text)]"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                type="button"
                onClick={() => navigate(-1)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                isLoading={submitting}
                disabled={isDeadlinePassed}
                leftIcon={<Send size={18} />}
              >
                {isDeadlinePassed
                  ? 'Deadline Passed'
                  : isEditMode
                    ? 'Update Application'
                    : 'Submit Application'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
