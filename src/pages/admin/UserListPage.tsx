import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Loader2, Users, UserCheck, UserX, ChevronRight, UserPlus, X } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { UserRoleBadges } from '@/components/admin/UserRoleBadges';
import { UserDetailsPanel } from '@/components/admin/UserDetailsPanel';
import { CreateStaffModal } from '@/components/admin/CreateStaffModal';
import { userService } from '@/services/user.service';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/config/messages';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useMediaQuery, XL_QUERY } from '@/hooks/useMediaQuery';
import { useRbac } from '@/hooks/useRbac';
import { hasRoleNamed } from '@/utils/role.utils';
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

/**
 * Which accounts the list is showing.
 *
 * `ALL` is the absence of a filter rather than a value to match, so it is not a
 * role name. Deliberately not persisted, unlike the search box: arriving to a
 * filter left over from a previous visit reads as accounts having disappeared.
 */
type RoleFilter = 'ALL' | 'SUPER_ADMIN' | 'ADMIN' | 'USER';

/**
 * Rows per page. Small when this screen listed only staff; candidates put it in
 * the hundreds, which is the same problem the assessment results table had.
 */
const PAGE_SIZE = 25;

const ROLE_FILTER_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: 'ALL', label: 'All roles' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'ADMIN', label: 'Admin' },
  // USER is the stored enum; "Candidate" is what it means to anyone reading
  // this screen, and matches how the badges label it.
  { value: 'USER', label: 'Candidate' },
];

export function UserListPage() {
  const { showToast } = useToast();
  // Same breakpoint as the `xl:` classes below, so the pane and the dialog can
  // never both be showing (or both be hidden) at some in-between width.
  const isWide = useMediaQuery(XL_QUERY);

  const { can, hasAnyRole } = useRbac();
  const canCreateStaff = hasAnyRole(['ADMIN', 'SUPER_ADMIN']);
  const canChangeStatus = can(PERMISSIONS.USER_ACTIVATE) && can(PERMISSIONS.USER_DEACTIVATE);

  const [users, setUsers] = useState<UsersDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  /** Set when one half of the roster loaded and the other did not. */
  const [partialLoad, setPartialLoad] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = usePersistentState('users:searchTerm', '');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [page, setPage] = useState(1);
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
   * Everyone, staff and candidates.
   *
   * Two requests because the API splits the roster in two: `/users/staff`
   * returns the ADMIN and SUPER_ADMIN accounts and `/users` returns everyone
   * else. They are exact complements — the backend builds them from the same
   * staff-role list, one including and one excluding — so merging cannot double
   * up or drop anyone.
   *
   * Settled rather than awaited together: whichever half arrives is worth
   * showing. Losing the candidate list should not also hide the six admins.
   */
  async function fetchUsers() {
    setLoading(true);
    setLoadFailed(false);
    setPartialLoad(null);

    const [staff, candidates] = await Promise.allSettled([
      userService.getStaff(),
      userService.getAll(),
    ]);

    const merged: UsersDto[] = [];
    if (staff.status === 'fulfilled') merged.push(...(staff.value.data ?? []));
    if (candidates.status === 'fulfilled') merged.push(...(candidates.value.data ?? []));

    if (staff.status === 'rejected' && candidates.status === 'rejected') {
      setLoadFailed(true);
    } else if (staff.status === 'rejected') {
      setPartialLoad('Admin accounts could not be loaded, so only candidates are listed.');
    } else if (candidates.status === 'rejected') {
      setPartialLoad('Candidates could not be loaded, so only admin accounts are listed.');
    }

    // Email is the primary key, so it is the identity to sort and de-dupe on.
    merged.sort((a, b) => a.email.localeCompare(b.email));
    setUsers(merged);
    setLoading(false);
  }

  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  const filteredUsers = users.filter((user) => {
    // Role first: it is the cheaper test and the one that usually excludes most.
    if (roleFilter !== 'ALL' && !hasRoleNamed(user.roles, roleFilter)) return false;

    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
    return fullName.includes(term) || user.email.toLowerCase().includes(term);
  });

  /** Counts per role for the dropdown, so it says how many each choice returns. */
  const roleCounts = {
    ALL: users.length,
    SUPER_ADMIN: users.filter((user) => hasRoleNamed(user.roles, 'SUPER_ADMIN')).length,
    ADMIN: users.filter((user) => hasRoleNamed(user.roles, 'ADMIN')).length,
    USER: users.filter((user) => hasRoleNamed(user.roles, 'USER')).length,
  } satisfies Record<RoleFilter, number>;

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));

  // Narrowing the filter changes what page 1 means, so go back to the top
  // rather than leaving someone on a page the new result set does not have.
  useEffect(() => {
    setPage(1);
  }, [roleFilter, searchTerm]);

  // Same overrun from the other side: the list can shrink under an open page
  // when an account is created or the roster reloads.
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const pagedUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const filtersActive = roleFilter !== 'ALL' || searchTerm.trim() !== '';

  const clearFilters = () => {
    setRoleFilter('ALL');
    setSearchTerm('');
  };

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

  const list = (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle>
              User Accounts{!loading && !loadFailed && ` (${filteredUsers.length})`}
            </CardTitle>
            <SearchInput
              onSearch={handleSearch}
              initialValue={searchTerm}
              placeholder="Search by name or email..."
              className="w-full sm:w-80"
            />
          </div>

          {/* One half of the roster missing is worth saying out loud: the list
              looks complete otherwise, and a missing admin reads as a deleted
              account rather than a failed request. */}
          {partialLoad && !loading && (
            <p className="text-sm text-[var(--warning)]">{partialLoad}</p>
          )}

          {/* Role filter. Hidden while the list is unusable, so an empty screen
              does not also offer controls that cannot change anything. */}
          {!loading && !loadFailed && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-full sm:w-52">
                <Select
                  aria-label="Filter by role"
                  options={ROLE_FILTER_OPTIONS.map((option) => ({
                    value: option.value,
                    // The count is on the option so the cost of a choice is
                    // visible before making it.
                    label: `${option.label} (${roleCounts[option.value]})`,
                  }))}
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                />
              </div>

              {filtersActive && (
                <>
                  <span className="text-sm text-[var(--textSecondary)]">
                    Showing <strong className="text-[var(--text)]">{filteredUsers.length}</strong> of{' '}
                    {users.length}
                  </span>
                  <Button variant="ghost" size="sm" leftIcon={<X size={14} />} onClick={clearFilters}>
                    Clear
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-16" role="status" aria-label="Loading staff accounts">
            <Loader2 size={36} className="animate-spin text-[var(--primary)]" />
          </div>
        ) : loadFailed ? (
          <EmptyState
            icon={<Users size={48} />}
            title="Unable to load staff accounts"
            description="Please try again to load the staff list."
            action={{ label: 'Retry', onClick: fetchUsers }}
          />
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            icon={<Users size={48} />}
            title={filtersActive ? 'No matching accounts' : 'No accounts'}
            description={
              /* Keyed on filtersActive, not just the search box: filtering to a
                 role nobody holds would otherwise claim no accounts exist at
                 all, and send someone off to create a duplicate. */
              filtersActive
                ? `None of the ${users.length} account${users.length === 1 ? '' : 's'} match the current filters.`
                : canCreateStaff
                  ? 'No accounts exist yet. Use "Add User" to create an admin.'
                  : 'No accounts exist yet.'
            }
            action={filtersActive ? { label: 'Clear filters', onClick: clearFilters } : undefined}
          />
        ) : (
          <>
            {/* Mobile: one card per user. Email and mobile are long enough
                that five columns scrolled sideways on a phone, hiding the
                status and the only action on the screen. */}
            <div className="md:hidden space-y-3">
              {pagedUsers.map((user) => (
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
                  {pagedUsers.map((user) => (
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

            {/* Footer count stays even on a single page — Pagination renders
                nothing when there is only one, and "1-25 of 240" is the line
                that tells you the list is longer than the screen. */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-[var(--borderMuted,var(--border))] pt-4">
              <p className="text-sm text-[var(--textSecondary)] tabular-nums">
                Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filteredUsers.length)} of{' '}
                {filteredUsers.length} account{filteredUsers.length === 1 ? '' : 's'}
              </p>
              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text)]">User Management</h1>
          <p className="text-[var(--textSecondary)] mt-1">
            Admins, super admins and candidates — select a row to see full details. Filter by role
            above; candidate applications and results live on the Candidates screen.
          </p>
        </div>
        {canCreateStaff && (
          <Button variant="primary" className="w-full sm:w-auto flex-shrink-0" leftIcon={<UserPlus size={18} />} onClick={() => setCreating(true)}>
            Add User
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
