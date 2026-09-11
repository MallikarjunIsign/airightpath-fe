import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Loader2, Users, UserCheck, UserX, ChevronRight, UserPlus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SearchInput } from '@/components/ui/SearchInput';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { UserRoleBadges } from '@/components/admin/UserRoleBadges';
import { UserDetailsPanel } from '@/components/admin/UserDetailsPanel';
import { CreateStaffModal } from '@/components/admin/CreateStaffModal';
import { userService } from '@/services/user.service';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/config/messages';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useMediaQuery, XL_QUERY } from '@/hooks/useMediaQuery';
import { useRbac } from '@/hooks/useRbac';
import { PERMISSIONS } from '@/config/permissions';
import type { UsersDto } from '@/types/user.types';

/** Activate/deactivate control, shared by the desktop row and the mobile card. */
function ToggleStatusButton({
  user,
  isToggling,
  onClick,
  className,
}: Readonly<{
  user: UsersDto;
  isToggling: boolean;
  onClick: () => void;
  className?: string;
}>) {
  let icon: ReactNode;
  if (isToggling) icon = undefined;
  else icon = user.enabled ? <UserX size={14} /> : <UserCheck size={14} />;

  return (
    <Button
      variant={user.enabled ? 'danger' : 'primary'}
      size="sm"
      className={className}
      isLoading={isToggling}
      leftIcon={icon}
      onClick={onClick}
    >
      {user.enabled ? 'Deactivate' : 'Activate'}
    </Button>
  );
}

export function UserListPage() {
  const { showToast } = useToast();
  // Same breakpoint as the `xl:` classes below, so the pane and the dialog can
  // never both be showing (or both be hidden) at some in-between width.
  const isWide = useMediaQuery(XL_QUERY);

  /**
   * Admins read this screen; super admins act on it.
   *
   * Both writes are SUPER_ADMIN-only server-side, so the controls are hidden
   * rather than shown-and-refused. An admin arriving here to look someone up
   * should not have to discover the boundary by clicking a button and reading a
   * 403 — the screen simply offers what their role can actually do.
   */
  const { can } = useRbac();
  const canManageRoles = can(PERMISSIONS.ROLE_MANAGE);
  const canChangeStatus = can(PERMISSIONS.USER_ACTIVATE) && can(PERMISSIONS.USER_DEACTIVATE);

  const [users, setUsers] = useState<UsersDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = usePersistentState('users:searchTerm', '');
  const [togglingEmail, setTogglingEmail] = useState<string | null>(null);
  const [confirmUser, setConfirmUser] = useState<UsersDto | null>(null);
  /**
   * The row whose details are open, held as an email rather than the object so
   * the panel re-reads from `users` — otherwise activating an account from the
   * panel would leave a stale copy of it on screen showing the old status.
   */
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  /**
   * Staff only — admins and super admins.
   *
   * Candidates are managed on the Candidates screen, which carries their
   * applications, assessments and results. Listing them here as well meant two
   * screens showing the same people with different actions; this one is now
   * about who administers the system.
   */
  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await userService.getStaff();
      setUsers(res.data ?? []);
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setLoading(false);
    }
  }

  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  const filteredUsers = users.filter((user) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
    return fullName.includes(term) || user.email.toLowerCase().includes(term);
  });

  const selectedUser = users.find((user) => user.email === selectedEmail) ?? null;

  // A filter that excludes the open row would otherwise leave its details up
  // beside a list that no longer contains it.
  const selectedIsVisible = filteredUsers.some((user) => user.email === selectedEmail);
  const panelUser = selectedIsVisible ? selectedUser : null;

  async function confirmToggleStatus() {
    const user = confirmUser;
    if (!user) return;
    setTogglingEmail(user.email);
    try {
      if (user.enabled) {
        await userService.deactivate(user.email);
        showToast(MESSAGES.admin.users.statusChanged(`${user.firstName} ${user.lastName}`, false), 'success');
      } else {
        await userService.activate(user.email);
        showToast(MESSAGES.admin.users.statusChanged(`${user.firstName} ${user.lastName}`, true), 'success');
      }
      // Update local state
      setUsers((prev) =>
        prev.map((u) =>
          u.email === user.email ? { ...u, enabled: !u.enabled } : u
        )
      );
      setConfirmUser(null);
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setTogglingEmail(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={36} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  const list = (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <CardTitle>
            Staff Accounts ({filteredUsers.length})
          </CardTitle>
          <SearchInput
            onSearch={handleSearch}
            initialValue={searchTerm}
            placeholder="Search staff by name or email..."
            className="w-full sm:w-80"
          />
        </div>
      </CardHeader>
      <CardContent>
        {filteredUsers.length === 0 ? (
          <EmptyState
            icon={<Users size={48} />}
            title={searchTerm ? 'No matching staff accounts' : 'No staff accounts'}
            description={
              searchTerm
                ? 'No admin or super admin matches your search. Try a different keyword.'
                : canManageRoles
                  ? 'No admin or super admin accounts exist yet. Use "New admin" to create one.'
                  : 'No admin or super admin accounts exist yet.'
            }
          />
        ) : (
          <>
            {/* Mobile: one card per user. Email and mobile are long enough
                that five columns scrolled sideways on a phone, hiding the
                status and the only action on the screen. */}
            <div className="md:hidden space-y-3">
              {filteredUsers.map((user) => (
                <div
                  key={user.email}
                  className="rounded-2xl border border-[var(--borderMuted,var(--border))] bg-[var(--cardBg)] p-4 space-y-3"
                >
                  <button
                    className="flex w-full items-start justify-between gap-3 text-left"
                    onClick={() => setSelectedEmail(user.email)}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--text)] break-words">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-sm text-[var(--textSecondary)] break-all">
                        {user.email}
                      </p>
                      <p className="text-sm text-[var(--textSecondary)]">{user.mobileNumber}</p>
                      <div className="mt-2">
                        <UserRoleBadges roles={user.roles} />
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <Badge variant={user.enabled ? 'success' : 'error'} size="sm">
                        {user.enabled ? 'Active' : 'Inactive'}
                      </Badge>
                      <ChevronRight size={16} className="text-[var(--textTertiary)]" />
                    </div>
                  </button>
                  {canChangeStatus && (
                    <ToggleStatusButton
                      user={user}
                      isToggling={togglingEmail === user.email}
                      onClick={() => setConfirmUser(user)}
                      className="w-full"
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Desktop: fixed layout so email and name wrap rather than
                stretching the table past the card. */}
            <div className="hidden md:block">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[20%]">Name</TableHead>
                    <TableHead className="w-[26%]">Email</TableHead>
                    <TableHead className="w-[14%]">Mobile</TableHead>
                    <TableHead className="w-[14%]">Role</TableHead>
                    <TableHead className="w-[11%]">Status</TableHead>
                    <TableHead className="w-[15%]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow
                      key={user.email}
                      onClick={() => setSelectedEmail(user.email)}
                      className={`cursor-pointer ${
                        user.email === selectedEmail ? 'bg-[var(--primary)]/5' : ''
                      }`}
                    >
                      <TableCell className="font-medium align-top break-words">
                        {user.firstName} {user.lastName}
                      </TableCell>
                      <TableCell className="align-top break-all">{user.email}</TableCell>
                      <TableCell className="align-top break-words">{user.mobileNumber}</TableCell>
                      <TableCell className="align-top">
                        <UserRoleBadges roles={user.roles} />
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={user.enabled ? 'success' : 'error'} size="sm">
                          {user.enabled ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      {/* Stops the row's own click handler firing: the button
                          opens a confirmation, and it should not also swap the
                          details panel out from under it. */}
                      <TableCell className="align-top" onClick={(e) => e.stopPropagation()}>
                        {canChangeStatus ? (
                          <ToggleStatusButton
                            user={user}
                            isToggling={togglingEmail === user.email}
                            onClick={() => setConfirmUser(user)}
                          />
                        ) : (
                          <span className="text-sm text-[var(--textTertiary)]">View only</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text)]">User Management</h1>
          <p className="text-[var(--textSecondary)] mt-1">
            Admins and super admins — select a row to see full details. Candidates are managed on
            the Candidates screen.
            {!canManageRoles && ' Creating accounts and changing roles needs a super admin.'}
          </p>
        </div>
        {canManageRoles && (
          <Button variant="primary" leftIcon={<UserPlus size={16} />} onClick={() => setCreating(true)}>
            New admin
          </Button>
        )}
      </div>

      {/* On a wide screen the details sit beside the list, so comparing rows
          against one person's detail needs no navigation. Narrower than that
          there is no room for a second column, and the same panel opens as a
          dialog instead — one component, two containers, so the two renderings
          cannot drift apart. */}
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">{list}</div>

        {isWide && panelUser && (
          <aside className="w-full xl:sticky xl:top-6 xl:w-[22rem] xl:flex-shrink-0">
            <Card>
              <CardHeader>
                <CardTitle>User details</CardTitle>
              </CardHeader>
              <CardContent>
                <UserDetailsPanel
                  user={panelUser}
                  isToggling={togglingEmail === panelUser.email}
                  onToggleStatus={() => setConfirmUser(panelUser)}
                  onClose={() => setSelectedEmail(null)}
                  canChangeStatus={canChangeStatus}
                />
              </CardContent>
            </Card>
          </aside>
        )}
      </div>

      <Modal
        isOpen={!isWide && !!panelUser}
        onClose={() => setSelectedEmail(null)}
        title="User details"
        size="md"
      >
        {panelUser && (
          <UserDetailsPanel
            user={panelUser}
            isToggling={togglingEmail === panelUser.email}
            onToggleStatus={() => setConfirmUser(panelUser)}
            onClose={() => setSelectedEmail(null)}
            showClose={false}
            canChangeStatus={canChangeStatus}
          />
        )}
      </Modal>

      <CreateStaffModal
        isOpen={creating}
        onClose={() => setCreating(false)}
        onCreated={fetchUsers}
      />

      <ConfirmDialog
        isOpen={!!confirmUser}
        onClose={() => setConfirmUser(null)}
        onConfirm={confirmToggleStatus}
        isLoading={!!confirmUser && togglingEmail === confirmUser.email}
        variant={confirmUser?.enabled ? 'danger' : 'success'}
        icon={confirmUser?.enabled ? <UserX size={24} /> : <UserCheck size={24} />}
        title={confirmUser?.enabled ? 'Deactivate user?' : 'Activate user?'}
        confirmText={confirmUser?.enabled ? 'Deactivate' : 'Activate'}
        message={
          confirmUser
            ? `Are you sure you want to ${confirmUser.enabled ? 'deactivate' : 'activate'} ${confirmUser.firstName} ${confirmUser.lastName} (${confirmUser.email})?`
            : ''
        }
      />
    </div>
  );
}
