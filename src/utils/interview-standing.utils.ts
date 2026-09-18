import { isPast } from '@/utils/datetime.utils';
import type {
  InterviewResult,
  InterviewRound,
  InterviewSchedule,
} from '@/types/interview.types';

export const INTERVIEW_ROUNDS: InterviewRound[] = ['L2_TECHNICAL', 'L3_BEHAVIORAL'];

/**
 * Where one round stands for one candidate.
 *
 * `pending` and `expired` are kept apart deliberately. Both mean "not sat", but
 * only one of them is still the candidate's to sit — and that difference is the
 * whole of the re-booking rule, so a column that collapsed them would show an
 * admin exactly the thing they cannot act on.
 */
export type RoundState = 'pending' | 'in-progress' | 'expired' | 'completed';

export interface RoundStanding {
  round: InterviewRound;
  /** How many times this round has been booked. Every booking is kept. */
  attempts: number;
  state: RoundState;
  /** Deadline of the attempt being reported — the most recent one. */
  deadlineTime?: string;
  /** Only meaningful once `state` is `completed`. */
  result?: InterviewResult;
  /** Overall score from the evaluation, when one has been produced. */
  score: number | null;
  /** True while this round is still live, so it cannot be booked again. */
  outstanding: boolean;
}

export interface CandidateInterviewStanding {
  /** Only rounds this candidate has actually been booked for. */
  rounds: RoundStanding[];
  /** True when any round is still live. Drives "Assign" vs "Reassign". */
  hasOutstanding: boolean;
}

/** Newest first, by assignment time, falling back to id. */
function newestFirst(a: InterviewSchedule, b: InterviewSchedule): number {
  const at = new Date(a.assignedAt ?? '').getTime();
  const bt = new Date(b.assignedAt ?? '').getTime();
  if (!Number.isNaN(at) && !Number.isNaN(bt) && at !== bt) return bt - at;
  return (b.id ?? 0) - (a.id ?? 0);
}

/**
 * What state one schedule is in.
 *
 * Handed in beats out of time: a candidate who submitted a minute before the
 * deadline and one who submitted a minute after both sat the interview, and
 * reporting the second as "expired" would lose a transcript that exists.
 */
function stateOf(schedule: InterviewSchedule): RoundState {
  if (schedule.attemptStatus === 'COMPLETED') return 'completed';
  if (schedule.deadlineTime && isPast(schedule.deadlineTime)) return 'expired';
  return schedule.attemptStatus === 'IN_PROGRESS' ? 'in-progress' : 'pending';
}

/**
 * One candidate's interview standing, built from their schedules for a job.
 *
 * The pipeline stage says "Interview" or "Interview Done" and stops there. It
 * cannot say which round, whether they have started it, whether the deadline
 * has gone by, or how it went — which is everything an admin is deciding on
 * when they look at this screen, and the reason it was impossible to tell an
 * assigned candidate from a completed one without opening Interview Results.
 */
export function buildInterviewStanding(
  schedules: InterviewSchedule[],
): CandidateInterviewStanding {
  const rounds: RoundStanding[] = [];

  for (const round of INTERVIEW_ROUNDS) {
    const mine = schedules
      .filter((s) => (s.round ?? 'L2_TECHNICAL') === round)
      .sort(newestFirst);
    if (mine.length === 0) continue;

    // The newest booking is the one in play; older ones are history and stay
    // readable in Interview Results.
    const latest = mine[0];
    const state = stateOf(latest);
    rounds.push({
      round,
      attempts: mine.length,
      state,
      deadlineTime: latest.deadlineTime,
      result: latest.interviewResult,
      score: latest.evaluation?.overallScore ?? null,
      outstanding: state === 'pending' || state === 'in-progress',
    });
  }

  return { rounds, hasOutstanding: rounds.some((r) => r.outstanding) };
}

/** Every candidate's standing for a job, keyed by lowercased email. */
export function buildInterviewStandings(
  schedules: InterviewSchedule[],
): Map<string, CandidateInterviewStanding> {
  const byEmail = new Map<string, InterviewSchedule[]>();
  for (const schedule of schedules) {
    const key = (schedule.email ?? '').toLowerCase();
    if (!key) continue;
    const bucket = byEmail.get(key);
    if (bucket) bucket.push(schedule);
    else byEmail.set(key, [schedule]);
  }

  const standings = new Map<string, CandidateInterviewStanding>();
  for (const [email, mine] of byEmail) {
    standings.set(email, buildInterviewStanding(mine));
  }
  return standings;
}
