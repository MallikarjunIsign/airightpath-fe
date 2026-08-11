import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Moon,
  Sun,
  Monitor,
  LogOut,
  Settings,
  Menu,
  ClipboardList,
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useProfileImage } from '@/contexts/ProfileImageContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { usePendingAssessments } from '@/contexts/PendingAssessmentsContext';
import { useRbac } from '@/hooks/useRbac';
import { ROUTES } from '@/config/routes';
import { formatName, formatDate, formatRelativeTime } from '@/utils/format.utils';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';

/** Absolute date plus the relative gap — "Aug 20, 2026" alone reads as trivia. */
function deadlineLabel(deadline: string): string {
  return `Due ${formatDate(deadline)} · ${formatRelativeTime(deadline)}`;
}

/** Inside two days, so the candidate has to act on it rather than note it. */
const DUE_SOON_MS = 48 * 60 * 60 * 1000;

function isDueSoon(deadline: string): boolean {
  const time = new Date(deadline).getTime();
  if (Number.isNaN(time)) return false;
  return time - Date.now() <= DUE_SOON_MS;
}

// ---------------------------------------------------------------------------
// Navbar Component — Floating, borderless, semi-transparent
// ---------------------------------------------------------------------------
export function Navbar() {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { mode, setMode, isDark } = useTheme();
  const { user, logout } = useAuth();
  const { imageUrl } = useProfileImage();
  const { toggleMobile } = useSidebar();
  const { pending } = usePendingAssessments();
  const { roles, hasAnyRole } = useRbac();
  const navigate = useNavigate();

  const profileRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const isAdmin = hasAnyRole(['ADMIN', 'SUPER_ADMIN']);

  // Detect scroll for subtle backdrop intensification
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) setShowProfileMenu(false);
      if (themeRef.current && !themeRef.current.contains(target)) setShowThemeMenu(false);
      if (notifRef.current && !notifRef.current.contains(target)) setShowNotifications(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const closeAll = () => {
    setShowProfileMenu(false);
    setShowThemeMenu(false);
    setShowNotifications(false);
  };

  const themeOptions = [
    { key: 'light' as const, icon: <Sun size={16} />, label: 'Light' },
    { key: 'dark' as const, icon: <Moon size={16} />, label: 'Dark' },
    { key: 'system' as const, icon: <Monitor size={16} />, label: 'System' },
  ];

  const handleLogout = async () => {
    closeAll();
    await logout();
    navigate(ROUTES.PUBLIC.LOGIN);
  };

  const handleProfileClick = () => {
    closeAll();
    navigate(isAdmin ? ROUTES.ADMIN.PROFILE : ROUTES.CANDIDATE.PROFILE);
  };

  return (
    <header
      className={`
        navbar-surface
        fixed top-0 right-0 z-navbar
        h-14 transition-all duration-300 ease-spring
        ${scrolled ? 'navbar-scrolled' : ''}
      `}
      style={{
        left: 'var(--sidebar-width, 264px)',
      }}
    >
      <div className="h-full px-4 sm:px-6 flex items-center gap-2">
        {/* Mobile: open the sidebar drawer */}
        <button
          onClick={toggleMobile}
          className="navbar-action-btn md:hidden"
          title="Open menu"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        {/* ----------------------------------------------------------------
            Right: Actions — ghost buttons with micro-interactions
            ---------------------------------------------------------------- */}
        <div className="flex items-center gap-0.5 ml-auto">
          {/* Theme toggle */}
          <div ref={themeRef} className="relative">
            <button
              onClick={() => { setShowThemeMenu(!showThemeMenu); setShowNotifications(false); setShowProfileMenu(false); }}
              className="navbar-action-btn"
              title="Toggle theme"
            >
              <span className="transition-transform duration-300 inline-flex">
                {isDark ? <Moon size={18} /> : <Sun size={18} />}
              </span>
            </button>
            {showThemeMenu && (
              <div className="dropdown-menu right-0 top-11 w-44">
                {themeOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => { setMode(opt.key); setShowThemeMenu(false); }}
                    className={`dropdown-item ${mode === opt.key ? 'dropdown-item-active' : ''}`}
                  >
                    {opt.icon}
                    <span>{opt.label}</span>
                    {mode === opt.key && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--accentPrimary,var(--primary))]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notifications */}
          <div ref={notifRef} className="relative">
            <button
              onClick={() => { setShowNotifications(!showNotifications); setShowThemeMenu(false); setShowProfileMenu(false); }}
              className="navbar-action-btn relative"
              title={pending.length > 0 ? `${pending.length} assessment${pending.length === 1 ? '' : 's'} to complete` : 'Notifications'}
              aria-label={pending.length > 0 ? `Notifications, ${pending.length} unread` : 'Notifications'}
            >
              <Bell size={18} />
              {pending.length > 0 && (
                <span
                  className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--error)] ring-2 ring-[var(--navbarBg,var(--surface1))]"
                  aria-hidden="true"
                />
              )}
            </button>
            {showNotifications && (
              <div className="dropdown-menu right-0 top-11 w-80">
                <div className="px-4 py-3 flex items-center justify-between gap-2">
                  <h3 className="text-[0.8125rem] font-semibold text-[var(--text)]">Notifications</h3>
                  {pending.length > 0 && (
                    <span className="text-[0.6875rem] font-semibold text-white bg-[var(--error)] rounded-full px-2 py-0.5">
                      {pending.length}
                    </span>
                  )}
                </div>

                {pending.length === 0 ? (
                  <div className="px-4 py-10 text-center text-[var(--textTertiary)] text-[0.8125rem]">
                    All caught up
                  </div>
                ) : (
                  <div className="max-h-80 overflow-y-auto py-1">
                    {pending.map((assessment) => (
                      <button
                        key={assessment.id}
                        onClick={() => { closeAll(); navigate(ROUTES.CANDIDATE.ASSESSMENTS); }}
                        className="dropdown-item items-start text-left"
                      >
                        <ClipboardList size={16} className="mt-0.5 flex-shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.8125rem] font-medium text-[var(--text)]">
                            {assessment.assessmentType === 'APTITUDE' ? 'Aptitude' : 'Coding'} assessment
                          </span>
                          <span className="block text-[0.6875rem] text-[var(--textTertiary)] truncate">
                            {assessment.jobPrefix}
                          </span>
                          {/* The deadline is the reason this is a notification
                              at all, so it gets the emphasis — and turns red
                              once it is close enough to act on today. */}
                          <span
                            className={`block text-[0.6875rem] mt-0.5 ${
                              isDueSoon(assessment.deadline)
                                ? 'text-[var(--error)] font-semibold'
                                : 'text-[var(--textSecondary)]'
                            }`}
                          >
                            {deadlineLabel(assessment.deadline)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Soft separator — just spacing, no visible line */}
          <div className="w-2" />

          {/* Profile */}
          <div ref={profileRef} className="relative">
            <button
              onClick={() => { setShowProfileMenu(!showProfileMenu); setShowThemeMenu(false); setShowNotifications(false); }}
              className="flex items-center gap-2.5 py-1.5 px-2.5 rounded-2xl hover:bg-[var(--bgOverlay,var(--surface1))] transition-all duration-200"
            >
              <Avatar
                src={imageUrl}
                firstName={user?.firstName}
                lastName={user?.lastName}
                size="sm"
              />
              <div className="hidden lg:block text-left min-w-0">
                <p className="text-[0.8125rem] font-semibold text-[var(--text)] truncate leading-tight">
                  {formatName(user?.firstName, user?.lastName)}
                </p>
              </div>
            </button>
            {showProfileMenu && (
              <div className="dropdown-menu right-0 top-12 w-60">
                {/* User info header */}
                <div className="px-4 py-3">
                  <p className="text-[0.8125rem] font-semibold text-[var(--text)]">
                    {formatName(user?.firstName, user?.lastName)}
                  </p>
                  <p className="text-[0.6875rem] text-[var(--textTertiary)] mt-0.5 truncate">{user?.email}</p>
                  <div className="mt-2">
                    <Badge variant="secondary" size="sm">
                      {roles[0] || 'User'}
                    </Badge>
                  </div>
                </div>
                <div className="py-1">
                  <button onClick={handleProfileClick} className="dropdown-item">
                    <Settings size={16} />
                    <span>Profile Settings</span>
                  </button>
                  <button onClick={handleLogout} className="dropdown-item text-[var(--error)] hover:bg-[var(--errorMuted,var(--errorLight))]">
                    <LogOut size={16} />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
