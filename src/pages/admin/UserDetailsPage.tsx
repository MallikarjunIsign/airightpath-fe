import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Briefcase, Loader2, UserCheck, UserX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { UserDetailsPanel } from '@/components/admin/UserDetailsPanel';
import { useToast } from '@/components/ui/Toast';
import { useRbac } from '@/hooks/useRbac';
import { PERMISSIONS } from '@/config/permissions';
import { ROUTES } from '@/config/routes';
import { MESSAGES } from '@/config/messages';
import { userService } from '@/services/user.service';
import { jobApplicationService } from '@/services/job-application.service';
import { formatServerDateTime } from '@/utils/format.utils';
import type { UsersDto } from '@/types/user.types';
import type { JobApplicationDTO } from '@/types/job.types';

/**
 * One account on a page of its own.
 *
 * <p>The list opened a user in a side panel or a dialog, which is the right size
 * for checking a phone number and the wrong one for anything more. Here the
 * account sits beside every job the person has applied to, each linking on to
 * that application's assessment and interview results — so the question "what
 * has this person actually done on the platform" has one place to be answered.</p>
 */
export function UserDetailsPage() {
  const { email: rawEmail = '' } = useParams<{ email: string }>();
  const email = decodeURIComponent(rawEmail);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { can } = useRbac();
  const canChangeStatus = can(PERMISSIONS.USER_ACTIVATE) && can(PERMISSIONS.USER_DEACTIVATE);

  const [user, setUser] = useState<UsersDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [applications, setApplications] = useState<JobApplicationDTO[] | null>(null);
  const [appsUnavailable, setAppsUnavailable] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        // The directory is searched, not asked for by email: it is the call that
        // returns the role set, which the single-user endpoint does not.
        const res = await userService.getDirectory({ page: 0, size: 10, search: email }) // the API's pages start at 0;
        const exact = (res.data?.content ?? []).find((row) => row.email.toLowerCase() === email.toLowerCase());
        if (cancelled) return;
        if (exact) setUser(exact);
        else setNotFound(true);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email]);

  useEffect(() => {
    let cancelled = false;
    setApplications(null);
    setAppsUnavailable(false);
    jobApplicationService
      .getAll()
      .then((res) => {
        if (cancelled) return;
        setApplications(
          (res.data ?? [])
            .filter((app) => (app.userEmail || app.email || '').toLowerCase() === email.toLowerCase())
            .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
        );
      })
      .catch(() => {
        // Not every admin may read every application; the account details above
        // stand on their own, so this section just says so.
        if (!cancelled) setAppsUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, [email]);

  const toggleStatus = useCallback(async () => {
    if (!user) return;
    setToggling(true);
    try {
      if (user.enabled) await userService.deactivate(user.email);
      else await userService.activate(user.email);
      showToast(MESSAGES.admin.users.statusChanged(`${user.firstName} ${user.lastName}`, !user.enabled), 'success');
      setUser({ ...user, enabled: !user.enabled });
      setConfirming(false);
    } catch {
      // The interceptor shows the error.
    } finally {
      setToggling(false);
    }
  }, [user, showToast]);

  const back = () => navigate(ROUTES.ADMIN.USERS);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-[var(--primary)]" size={32} />
      </div>
    );
  }

  if (notFound || !user) {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="text-[var(--text)]">No user was found for {email}.</p>
        <Button variant="outline" leftIcon={<ArrowLeft size={16} />} onClick={back}>
          Back to users
        </Button>
      </div>
    );
  }

  const fullName = `${user.firstName} ${user.lastName}`.trim();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" leftIcon={<ArrowLeft size={16} />} onClick={back}>
          Users
        </Button>
        <h1 className="text-xl font-bold text-[var(--text)]">{fullName || user.email}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <UserDetailsPanel
              user={user}
              isToggling={toggling}
              onToggleStatus={() => setConfirming(true)}
              onClose={back}
              showClose={false}
              canChangeStatus={canChangeStatus}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Applications{applications ? ` (${applications.length})` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {appsUnavailable && (
              <p className="text-sm text-[var(--textSecondary)]">
                Applications could not be loaded. You may not have permission to read them.
              </p>
            )}
            {!appsUnavailable && applications === null && (
              <Loader2 className="animate-spin text-[var(--textSecondary)]" size={18} />
            )}
            {applications && applications.length === 0 && (
              <p className="text-sm text-[var(--textSecondary)]">This user has not applied to any job.</p>
            )}
            <ul className="space-y-3">
              {(applications ?? []).map((app) => (
                <li
                  key={app.id ?? app.jobPrefix}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface1)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium text-[var(--text)]">
                        <Briefcase size={14} className="text-[var(--primary)]" />
                        {app.jobTitle || app.jobRole || 'Job'}
                      </p>
                      <p className="text-xs text-[var(--textTertiary)]">{app.jobPrefix}</p>
                    </div>
                    <Badge variant="info" size="sm">
                      {String(app.status).replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-[var(--textSecondary)]">
                    Applied {formatServerDateTime(app.createdAt) || '—'}
                    {app.matchPercent ? ` · ATS match ${app.matchPercent.toFixed(1)}%` : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {/* Straight to the pages that already hold each result, so the
                        user's whole path is one click from here. */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(ROUTES.ADMIN.candidateResultDetail(app.jobPrefix, email))}
                    >
                      Assessment result
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(ROUTES.ADMIN.interviewResultDetail(app.jobPrefix, email))}
                    >
                      Interview result
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={toggleStatus}
        isLoading={toggling}
        variant={user.enabled ? 'danger' : 'success'}
        icon={user.enabled ? <UserX size={24} /> : <UserCheck size={24} />}
        title={user.enabled ? 'Deactivate user?' : 'Activate user?'}
        confirmText={user.enabled ? 'Deactivate' : 'Activate'}
        message={
          user.enabled
            ? `${fullName || user.email} will no longer be able to sign in.`
            : `${fullName || user.email} will be able to sign in again.`
        }
      />
    </div>
  );
}
