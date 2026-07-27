export interface JobPostDTO {
  id?: number;
  jobPrefix: string;
  jobTitle: string;
  companyName: string;
  location: string;
  jobDescription: string;
  keySkills: string;
  experience: string;
  education: string;
  salaryRange?: string;
  jobType: string;
  industry?: string;
  department?: string;
  role?: string;
  numberOfOpenings: number;
  contactEmail?: string;
  applicationDeadline: string;
  createdAt?: string;
  updatedAt?: string;
}

export type JobApplicationStatus =
  | 'APPLIED'
  | 'SHORTLISTED'
  | 'ACKNOWLEDGED'
  | 'ACKNOWLEDGED_BACK'
  | 'RECONFIRMED'
  | 'EXAM_SENT'
  | 'EXAM_COMPLETED'
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEW_COMPLETED'
  | 'SELECTED'
  | 'REJECTED';

export interface JobApplicationDTO {
  id?: number;
  firstName: string;
  lastName: string;
  email: string;
  userEmail?: string;
  mobileNumber: string;
  experience: string;
  address: string;
  jobRole: string;
  jobPrefix: string;
  status: JobApplicationStatus;
  resumeFileName?: string;
  contentType?: string;
  matchPercent?: number;
  /** ATS shortlisting outcome, e.g. "Shortlisted" / "Not Shortlisted". */
  shortlistStatus?: string;
  /** Whether the ATS scan has run, e.g. "Screening Completed" / "Pending". */
  atsScanStatus?: string;
  confirmationStatus?: string;
  acknowledgedStatus?: string;
  reconfirmationStatus?: string;
  examLinkStatus?: string;
  examCompletedStatus?: string;
  rejectionStatus?: string;
  writtenTestStatus?: string;
  interview?: string;
  createdAt?: string;
  updatedAt?: string;
  jobTitle?: string;
  companyName?: string;
  applicationDeadline?: string;
  /** Optional referral captured at apply time (either may be null). */
  referralId?: string | null;
  referralName?: string | null;
}
