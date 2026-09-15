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
  /** Totals come from the server now, not from counting a local array. */
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
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

  /**
   * One page of the roster, filtered and sorted by the server.
   *
   * Role, search and paging all travel as query parameters. They used to be
   * applied in the browser over the whole table, which stopped working for two
   * reasons: the underlying query took MySQL out of sort memory when unbounded,
   * and filtering a single page client-side would silently only search that page.
   */
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await userService.getDirectory({
        page: page - 1, // the pager is 1-based, the API is 0-based
        size: PAGE_SIZE,
        role: roleFilter === 'ALL' ? undefined : roleFilter,
        search: searchTerm.trim() || undefined,
      });
      setUsers(res.data?.content ?? []);
      setTotalElements(res.data?.totalElements ?? 0);
      setTotalPages(Math.max(1, res.data?.totalPages ?? 1));
    } catch {
      setLoadFailed(true);
      setUsers([]);
      // Error toast auto-handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [page, roleFilter, searchTerm]);

  // Re-runs whenever the query changes — page, role or search term.
  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  // `users` is already the page the server selected — no client-side filtering
  // or slicing. Doing either here would only ever narrow the visible 25 rows
  // while claiming to search the whole roster.

  // Narrowing the filter changes what page 1 means, so go back to the top
  // rather than asking the server for a page the new result set does not have.
  useEffect(() => {
    setPage(1);
  }, [roleFilter, searchTerm]);

  // The same overrun from the other side: creating an account or deactivating
  // one can shrink the result set under an open page.
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const filtersActive = roleFilter !== 'ALL' || searchTerm.trim() !== '';

  const clearFilters = () => {
    setRoleFilter('ALL');
    setSearchTerm('');
  };

  const selectedUser = users.find((user) => user.email === selectedEmail) ?? null;

  // A filter that excludes the open row would otherwise leave its details up
  // beside a list that no longer contains it.
  const selectedIsVisible = users.some((user) => user.email === selectedEmail);
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
              User Accounts{!loading && !loadFailed && ` (${totalElements})`}
            </CardTitle>
            <SearchInput
              onSearch={handleSearch}
              initialValue={searchTerm}
              placeholder="Search by name or email..."
              className="w-full sm:w-80"
            />
          </div>

          {/* Role filter. Hidden while the list is unusable, so an empty screen
              does not also offer controls that cannot change anything. */}
          {!loading && !loadFailed && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-full sm:w-52">
                <Select
                  aria-label="Filter by role"
                  options={ROLE_FILTER_OPTIONS}
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                />
              </div>

              {filtersActive && (
                <>
                  <span className="text-sm text-[var(--textSecondary)]">
                    <strong className="text-[var(--text)]">{totalElements}</strong> matching
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
            title="Unable to load accounts"
            description="Please try again to load the user list."
            action={{ label: 'Retry', onClick: fetchUsers }}
          />
        ) : users.length === 0 ? (
          <EmptyState
            icon={<Users size={48} />}
            title={filtersActive ? 'No matching accounts' : 'No accounts'}
            description={
              /* Keyed on filtersActive, not just the search box: filtering to a
                 role nobody holds would otherwise claim no accounts exist at
                 all, and send someone off to create a duplicate. */
              filtersActive
                ? 'No account matches the current filters.'
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
              {users.map((user) => (
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
                  {users.map((user) => (
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
                Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, totalElements)} of{' '}
                {totalElements} account{totalElements === 1 ? '' : 's'}
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
