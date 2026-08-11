// ─────────────────────────────────────────────────────────────────────────────
// Centralized user-facing UI messages (toasts, inline notices).
//
// Namespaced by module. Migrate inline `showToast('...')` strings here module by
// module so copy stays consistent and is editable in one place. Dynamic messages
// are functions; static ones are plain strings.
//
// NOTE: server/API error messages live separately in `error-messages.ts` (keyed
// by backend error code). This file is for client-originated messages.
// ─────────────────────────────────────────────────────────────────────────────

export const MESSAGES = {
  auth: {
    loginSuccess: 'Successfully logged in',
    registerSuccess: 'Account created successfully! Please sign in.',
    passwordChanged: 'Password changed successfully',
    passwordUpdated: 'Password updated successfully',
    accountUnidentified: 'Unable to identify your account. Please log in again.',
    otpSent: (method: string) => `OTP sent to your ${method}`,
    otpInvalid: 'Please enter a valid OTP',
    otpVerified: 'OTP verified successfully',
    sessionExpired: 'Session expired. Please start the forgot password flow again.',
  },

  // Shared proctoring warnings used by the aptitude & coding exam pages.
  proctoring: {
    fullscreenExited: (count: number) => `Warning: Fullscreen exited! (${count})`,
    tabSwitch: (counter: string) => `Warning: Tab switch detected! (${counter})`,
    faceNotDetected: 'Warning: Your face is not detected!',
    multipleFaces: (count: number) => `Warning: Multiple faces detected (${count})!`,
    lookingAway: (direction: string) => `Warning: Please keep looking at the screen (${direction}).`,
    autoSubmitting: (reason: string) => `Auto-submitting: ${reason}`,
  },

  exam: {
    aptitudeSubmitted: 'Exam submitted successfully!',
    codingSubmitted: 'Coding exam submitted successfully!',
    questionSaved: (n: number) => `Question ${n} saved!`,
    questionSubmitted: (n: number) => `Question ${n} submitted!`,
    compileTimeout: 'Your code took too long to run. Check for an infinite loop and try again.',
    compileFailed: 'Could not run your code. Please try again.',
    // Our compiler host is missing a toolchain — the candidate's code is fine,
    // so this must not read as a mistake they made.
    compilerUnavailable:
      'The code runner is temporarily unavailable. Your code has not been lost — please try again in a moment.',
    compilerUnsupportedLanguage: (language: string) =>
      `${language} is not supported by the code runner. Please pick another language.`,
  },

  // Exam instructions / system-check page.
  examSetup: {
    permissionsGranted: 'Camera and microphone access granted.',
    permissionsFailed: 'Failed to access camera/microphone. Please allow permissions.',
    agreeRequired: 'Please agree to the terms and conditions.',
    enableDevicesRequired: 'Please enable camera and microphone before starting.',
    photoRequired: 'Please take your photo before starting the exam.',
    photoCaptured: 'Photo captured.',
    photoUploadFailed: "We couldn't save your photo. Please try again.",
    photoNoFace: 'No face detected. Please centre your face in the frame and try again.',
    photoMultipleFaces: 'More than one person is visible. Only you may be in frame.',
    secondPersonPresent: 'Another person is visible in your camera. Please sit alone to continue.',
    tooNoisy: 'Your surroundings are too noisy. Please move somewhere quieter and try again.',
    roomScanRequired: 'Please complete the room scan before starting the exam.',
    roomScanDone: 'Room scan captured. Thank you.',
    roomScanFailed: "We couldn't save your room scan. Please try again.",
  },

  application: {
    noJobSelected: 'No job selected. Please go back and select a job.',
    resumeRequired: 'Please upload your resume.',
    updated: 'Application updated successfully.',
    submitted: 'Application submitted successfully.',
  },

  profile: {
    updated: 'Profile updated successfully.',
    imageTypeInvalid: 'Only JPEG, PNG, and GIF files are allowed.',
    imageTooLarge: 'Image size must be less than 5MB.',
    photoUpdated: 'Profile photo updated successfully.',
  },

  resume: {
    selectFile: 'Please select a file to save.',
    saved: 'Resume saved successfully.',
    noneFound: 'No resume found yet. Apply to a job with your resume first.',
    actionFailed: 'Something went wrong with your resume. Please try again.',
  },

  result: {
    noData: 'No result data available.',
  },

  interview: {
    micToStart: 'Please click the microphone to start answering.',
    endingConsecutiveUnanswered: 'Interview ending due to consecutive unanswered questions.',
    timeUp: 'Interview time is up. Ending interview.',
    screenShareStopped: 'Screen sharing stopped. This has been logged.',
    fullscreenExit: (count: number) =>
      `Fullscreen exit detected (${count}). Please return to fullscreen.`,
    faceNotDetected: 'Face not detected. Please stay in front of the camera.',
    multipleFaces: (count: number) =>
      `Multiple faces detected (${count}). Only the candidate should be visible.`,
    lookingAway: (direction: string) =>
      `Looking away detected (${direction}). Please look at the screen.`,
    devtoolsDetected: 'Developer tools detected. Please close them.',
    devtoolsQueued: 'Connection lost, devtools event will be sent when reconnected.',
    wsError: (err: string) => `WebSocket error: ${err}`,
    inactivityWarning:
      'You have been inactive. Please respond soon or the interview will end automatically.',
    endingInactivity: 'Interview ending due to inactivity.',
    answerTimeLimit: 'Answer time limit reached. Submitting your answer.',
    maxWarnings: 'Maximum proctoring warnings reached. Ending interview.',
    writeCodeFirst: 'Please write some code first',
    mobileVerified: 'Mobile verification successful!',
    proctoringWarning: (reason: string) => `Proctoring Warning: ${reason}`,
    proceedingWithoutRoom: 'Proceeding without room verification...',
    videoRecordFailed: 'Could not start video recording.',
    stillConnecting: 'Still connecting...',
  },

  admin: {
    common: {
      selectJobFirst: 'Please select a job first',
      selectJob: 'Please select a job',
      selectCandidate: 'Please select at least one candidate',
    },
    // Resume viewer errors shared by the Candidates & ATS screening pages.
    resume: {
      unavailable: "This candidate's resume is not available.",
      openFailed: 'Unable to open the resume. Please try again.',
    },
    assign: {
      aptitudeGenerated: 'Aptitude questions generated successfully!',
      codingGenerated: 'Coding questions generated successfully!',
      selectAssessmentType: 'Please select at least one assessment type',
      aptitudePaperRequired: 'Please upload or generate an aptitude question paper',
      codingPaperRequired: 'Please upload or generate a coding question paper',
      startTimeRequired: 'Please set a start time',
      deadlineRequired: 'Please set a deadline',
      startInPast: 'Start time cannot be in the past.',
      deadlineInPast: 'Deadline cannot be in the past.',
      deadlineBeforeStart: 'Deadline must be after the start time.',
      minutesPerQuestionInvalid: (min: number, max: number) =>
        `Time per question must be between ${min} and ${max} minutes.`,
      // Generation reads a per-job prompt. Without one the server 404s, which
      // the interceptor renders as a generic "couldn't be found" — true, but it
      // names neither what is missing nor how to fix it.
      promptMissing: (type: string) =>
        `No ${type} prompt is set up for this job yet. Use "Create Prompt" to add one, then generate again.`,
      assigned: 'Assessment assigned successfully!',
    },
    atsBatch: {
      resumeRequired: 'Please upload at least one resume',
      jobDescriptionRequired: 'Please enter a job description',
      screened: (n: number) => `Screened ${n} resumes successfully!`,
    },
    ats: {
      noApplicants: 'No applicants found for this job.',
      screeningComplete: (shortlisted: number, rejected: number, total: number) =>
        `Screening complete! ${shortlisted} shortlisted, ${rejected} rejected out of ${total} candidates.`,
    },
    candidates: {
      selectToShortlist: 'Please select at least one candidate to shortlist',
      shortlisted: (n: number) => `Shortlisted ${n} candidate${n === 1 ? '' : 's'}.`,
      shortlistFailed: (n: number) =>
        `Could not shortlist ${n} candidate${n === 1 ? '' : 's'}. Please try again.`,
      shortlistPartial: (done: number, total: number, failed: number) =>
        `Shortlisted ${done} of ${total}; ${failed} could not be shortlisted.`,
      referralSet: (verified: boolean) => `Referral ${verified ? 'verified' : 'rejected'}.`,
      ackDateTimeRequired: 'Date & Time is required for acknowledgement mail',
      dateTimeInPast: 'Date & Time cannot be in the past. Please pick a future slot.',
      actionSent: (label: string) => `${label} sent successfully!`,
    },
    interviewScheduler: {
      deadlineTimeRequired: 'Please set a deadline time',
      scheduled: (count: number) =>
        `Interview${count > 1 ? 's' : ''} scheduled for ${count} candidate${count > 1 ? 's' : ''}!`,
    },
    jobPost: {
      deadlineInPast: 'Application deadline cannot be in the past.',
      posted: 'Job posted successfully!',
      updated: 'Job updated successfully!',
      notFound: 'That job could not be found.',
      updateNoId: 'This job has no id, so it cannot be updated. Please refresh and try again.',
      updateUnavailable:
        'Editing jobs is not available on this server yet — the update endpoint has not been deployed.',
      deleted: (prefix: string) => `Job ${prefix} deleted.`,
      deleteNoId: 'This job has no id, so it cannot be deleted. Please refresh and try again.',
      deleteUnavailable:
        'Deleting jobs is not available on this server yet — the delete endpoint has not been deployed.',
    },
    prompts: {
      reuseCopied: (source: string) => `Copied prompts from ${source}. Review and Save to apply.`,
      loadReuseFailed: 'Failed to load prompts to reuse.',
      contentEmpty: 'Prompt content cannot be empty',
      promptSaved: (label: string) => `${label} prompt saved successfully!`,
      interviewPromptEmpty: 'Interview prompt cannot be empty',
      evaluationPromptEmpty: 'Evaluation prompt cannot be empty',
      weightsMustTotal: (total: number) =>
        `Category weights must total 100% (currently ${total}%)`,
      categoryNameRequired: 'All categories must have a name',
      interviewSaved: 'Interview prompt saved successfully!',
      interviewSaveFailed: 'Failed to save interview prompt. Please try again.',
      partiallySaved: (failed: string) => `Partially saved. Failed: ${failed}`,
      unexpectedError: 'An unexpected error occurred. Please try again.',
    },
    questionPaper: {
      fileRequired: 'Please select a question paper file to upload',
      uploaded: 'Question paper uploaded successfully!',
    },
    users: {
      statusChanged: (name: string, active: boolean) =>
        `${name} ${active ? 'activated' : 'deactivated'}`,
    },
  },
} as const;
