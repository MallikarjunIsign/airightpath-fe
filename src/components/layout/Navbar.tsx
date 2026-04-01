import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Bell,
  Moon,
  Sun,
  Monitor,
  Search,
  LogOut,
  Settings,
  ChevronRight,
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useProfileImage } from '@/contexts/ProfileImageContext';
import { useRbac } from '@/hooks/useRbac';
import { ROUTES } from '@/config/routes';
import { formatName } from '@/utils/format.utils';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';

// ---------------------------------------------------------------------------
// Breadcrumb builder from pathname
// ---------------------------------------------------------------------------
function useBreadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  return segments.map((segment, i) => ({
    label: segment
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    path: '/' + segments.slice(0, i + 1).join('/'),
    isLast: i === segments.length - 1,
  }));
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
  const { roles, hasAnyRole } = useRbac();
  const navigate = useNavigate();
  const breadcrumbs = useBreadcrumbs();

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
        left: 'var(--sidebar-width, 240px)',
      }}
    >
      <div className="h-full px-6 flex items-center justify-between gap-4">
        {/* ----------------------------------------------------------------
            Left: Breadcrumbs — lightweight path trail
            ---------------------------------------------------------------- */}
        <div className="flex items-center gap-1.5 min-w-0 text-[0.8125rem]">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-1.5 min-w-0">
              {i > 0 && (
                <ChevronRight size={14} className="text-[var(--textQuaternary,var(--textTertiary))] flex-shrink-0 opacity-60" />
              )}
              <span
                className={`
                  truncate transition-colors duration-150
                  ${crumb.isLast
                    ? 'text-[var(--text)] font-semibold'
                    : 'text-[var(--textTertiary)] hover:text-[var(--textSecondary)] cursor-pointer'
                  }
                `}
                onClick={() => !crumb.isLast && navigate(crumb.path)}
              >
                {crumb.label}
              </span>
            </span>
          ))}
        </div>

        {/* ----------------------------------------------------------------
            Right: Actions — ghost buttons with micro-interactions
            ---------------------------------------------------------------- */}
        <div className="flex items-center gap-0.5">
          {/* Search trigger */}
          <button
            className="navbar-action-btn"
            title="Search (Ctrl+K)"
          >
            <Search size={18} />
            <span className="hidden lg:inline text-[0.75rem] text-[var(--textQuaternary,var(--textTertiary))] ml-2 mr-1">
              Search
            </span>
            <kbd className="hidden lg:inline text-[0.625rem] px-1.5 py-0.5 rounded-lg bg-[var(--bgOverlay,var(--surface2))] text-[var(--textQuaternary,var(--textTertiary))]">
              /
            </kbd>
          </button>

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
              title="Notifications"
            >
              <Bell size={18} />
            </button>
            {showNotifications && (
              <div className="dropdown-menu right-0 top-11 w-80">
                <div className="px-4 py-3">
                  <h3 className="text-[0.8125rem] font-semibold text-[var(--text)]">Notifications</h3>
                </div>
                <div className="px-4 py-10 text-center text-[var(--textTertiary)] text-[0.8125rem]">
                  All caught up
                </div>
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
