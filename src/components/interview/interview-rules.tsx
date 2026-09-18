import {
  Video,
  Monitor,
  Shield,
  ScanLine,
  Mic,
  Camera,
  Clock,
  Users,
  Maximize,
  RotateCcw,
  Wifi,
  BatteryCharging,
  BellOff,
} from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { PROCTORING_CONFIG } from '@/config/proctoring.config';

/** One rule as the instructions and the interview screen both render it. */
export interface ProctoringRule {
  icon: React.ReactNode;
  text: string;
}

/**
 * The proctoring rules, built from the same switches the proctoring actually
 * reads.
 *
 * Exported because the interview screen shows the same list once the interview
 * is running — a candidate mid-interview who cannot remember whether leaving
 * fullscreen costs them a warning should not have to guess, and a second
 * hand-written copy of this list would start disagreeing with the first the
 * moment a switch moved.
 */
export function buildProctoringRules(): ProctoringRule[] {
  const rules: ProctoringRule[] = [];
  const p = PROCTORING_CONFIG;

  rules.push({
    icon: <Monitor size={18} />,
    text: 'Take this interview on a desktop or laptop with a webcam. Phones and tablets are not supported.',
  });
  rules.push({
    icon: <Clock size={18} />,
    text: `The interview lasts up to ${APP_CONFIG.INTERVIEW_TIMER_MINUTES} minutes and ends automatically when the timer reaches zero.`,
  });
  rules.push({
    icon: <Mic size={18} />,
    text: 'You speak with an AI interviewer. Click the microphone to answer, and stop when you are done — your answers are transcribed live.',
  });

  if (p.camera.required) {
    rules.push({
      icon: <Camera size={18} />,
      text: 'Your camera must stay on for the whole interview. If it is switched off or blocked, the interview cannot continue.',
    });
  }
  if (p.identityPhoto.required) {
    rules.push({
      icon: <Camera size={18} />,
      text: 'One photo of you is taken before the interview starts, to confirm who sat it.',
    });
  }
  if (p.roomScan.required) {
    rules.push({
      icon: <ScanLine size={18} />,
      text: 'You will be asked to turn slowly on the spot and scan your room with your camera before you begin.',
    });
  }
  if (p.recording.camera.required) {
    rules.push({
      icon: <Video size={18} />,
      text: 'Your camera and microphone are recorded for the whole interview and stored with your answers.',
    });
  }
  if (p.recording.screen.required) {
    rules.push({
      icon: <Monitor size={18} />,
      text: 'Your screen is recorded for the whole interview. You will be asked to share it when the interview starts — share your entire screen, and do not stop the share.',
    });
  }
  if (p.eyeDetection.enabled) {
    rules.push({
      icon: <Users size={18} />,
      text: 'You must be alone and facing the screen. A second face in frame, or no face at all, is recorded as a warning.',
    });
  }
  if (p.fullscreen.enabled) {
    rules.push({
      icon: <Maximize size={18} />,
      text: 'The interview runs in fullscreen. Leaving fullscreen, or opening developer tools, is recorded as a warning.',
    });
  }
  if (p.tabSwitch.enabled) {
    rules.push({
      icon: <Monitor size={18} />,
      text: 'Do not switch tabs, windows or applications during the interview. Each switch is recorded as a warning.',
    });
  }

  rules.push({
    icon: <Shield size={18} />,
    text: `${APP_CONFIG.INTERVIEW_MAX_PROCTORING_WARNINGS} warnings end the interview automatically, with whatever you have answered so far.`,
  });
  rules.push({
    icon: <RotateCcw size={18} />,
    text: 'Do not reload, close, or navigate away from this page once the interview begins. It cannot be resumed from where you left off.',
  });
  rules.push({
    icon: <Wifi size={18} />,
    text: 'Use a stable internet connection. If it drops, the timer keeps running — reconnect on the same device and continue.',
  });
  rules.push({
    icon: <BatteryCharging size={18} />,
    text: 'Keep your device plugged in and disable sleep. A device that sleeps mid-interview is treated as leaving it.',
  });
  rules.push({
    icon: <BellOff size={18} />,
    text: 'Close other applications and silence notifications. A call or pop-up that takes focus counts as leaving the interview.',
  });

  return rules;
}
