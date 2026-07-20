import { useState, useEffect, useCallback } from 'react';
import { Loader2, Users, UserCheck, UserX } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SearchInput } from '@/components/ui/SearchInput';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { userService } from '@/services/user.service';
import { useToast } from '@/components/ui/Toast';
import { usePersistentState } from '@/hooks/usePersistentState';
import type { UsersDto } from '@/types/user.types';

export function UserListPage() {
  const { showToast } = useToast();

  const [users, setUsers] = useState<UsersDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = usePersistentState('users:searchTerm', '');
  const [togglingEmail, setTogglingEmail] = useState<string | null>(null);
  const [confirmUser, setConfirmUser] = useState<UsersDto | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await userService.getAll();
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

  async function confirmToggleStatus() {
    const user = confirmUser;
    if (!user) return;
    setTogglingEmail(user.email);
    try {
      if (user.enabled) {
        await userService.deactivate(user.email);
        showToast(`${user.firstName} ${user.lastName} deactivated`, 'success');
      } else {
        await userService.activate(user.email);
        showToast(`${user.firstName} ${user.lastName} activated`, 'success');
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">User Management</h1>
        <p className="text-[var(--textSecondary)] mt-1">
          View and manage all registered users
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle>
              All Users ({filteredUsers.length})
            </CardTitle>
            <SearchInput
              onSearch={handleSearch}
              initialValue={searchTerm}
              placeholder="Search by name or email..."
              className="w-full sm:w-80"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredUsers.length === 0 ? (
            <EmptyState
              icon={<Users size={48} />}
              title="No users found"
              description={
                searchTerm
                  ? 'No users match your search criteria. Try a different keyword.'
                  : 'No registered users yet.'
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.email}>
                    <TableCell className="font-medium">
                      {user.firstName} {user.lastName}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.mobileNumber}</TableCell>
                    <TableCell>
                      <Badge variant={user.enabled ? 'success' : 'error'} size="sm">
                        {user.enabled ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant={user.enabled ? 'danger' : 'primary'}
                        size="sm"
                        isLoading={togglingEmail === user.email}
                        leftIcon={
                          togglingEmail !== user.email
                            ? user.enabled
                              ? <UserX size={14} />
                              : <UserCheck size={14} />
                            : undefined
                        }
                        onClick={() => setConfirmUser(user)}
                      >
                        {user.enabled ? 'Deactivate' : 'Activate'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
