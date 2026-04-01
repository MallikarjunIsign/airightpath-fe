import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Calendar,
  LogOut,
  Briefcase,
  FileText,
  ClipboardList,
  Upload,
  UserCheck,
  MessageSquare,
  BookOpen,
  Award,
  FileSearch,
  Layers,
  Video,
  User,
  Lock,
  Pin,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { useRbac } from '@/hooks/useRbac';
import { ROUTES } from '@/config/routes';
import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Avatar';
import { useProfileImage } from '@/contexts/ProfileImageContext';
import { formatName } from '@/utils/format.utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
  badge?: string;
}

// ---------------------------------------------------------------------------
// Navigation Data — single continuous list, no category groupings
// ---------------------------------------------------------------------------
const adminNavItems: NavItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={18} />, path: ROUTES.ADMIN.DASHBOARD },
  { label: 'Create Job', icon: <Briefcase size={18} />, path: ROUTES.ADMIN.JOBS_CREATE },
  { label: 'Candidates', icon: <UserCheck size={18} />, path: ROUTES.ADMIN.CANDIDATES },
  { label: 'Users', icon: <Users size={18} />, path: ROUTES.ADMIN.USERS },
  { label: 'ATS Screening', icon: <FileSearch size={18} />, path: ROUTES.ADMIN.ATS },
  { label: 'ATS Batch', icon: <Layers size={18} />, path: ROUTES.ADMIN.ATS_BATCH },
  { label: 'Assign', icon: <ClipboardList size={18} />, path: ROUTES.ADMIN.ASSESSMENTS_ASSIGN },
  { label: 'Upload Questions', icon: <Upload size={18} />, path: ROUTES.ADMIN.ASSESSMENTS_UPLOAD },
  { label: 'Assessment Results', icon: <Award size={18} />, path: ROUTES.ADMIN.ASSESSMENTS_RESULTS },
  { label: 'Schedule', icon: <Calendar size={18} />, path: ROUTES.ADMIN.INTERVIEWS_SCHEDULE },
  { label: 'Interview Results', icon: <Video size={18} />, path: ROUTES.ADMIN.INTERVIEWS_RESULTS },
  { label: 'Prompts', icon: <MessageSquare size={18} />, path: ROUTES.ADMIN.PROMPTS },
  { label: 'Profile', icon: <User size={18} />, path: ROUTES.ADMIN.PROFILE },
  { label: 'Password', icon: <Lock size={18} />, path: ROUTES.ADMIN.CHANGE_PASSWORD },
];

const candidateNavItems: NavItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={18} />, path: ROUTES.CANDIDATE.DASHBOARD },
  { label: 'Profile', icon: <User size={18} />, path: ROUTES.CANDIDATE.PROFILE },
  { label: 'Resume', icon: <FileText size={18} />, path: ROUTES.CANDIDATE.RESUME },
  { label: 'Events', icon: <BookOpen size={18} />, path: ROUTES.CANDIDATE.EVENTS },
  { label: 'Applications', icon: <FileText size={18} />, path: ROUTES.CANDIDATE.APPLICATIONS },
  { label: 'Assessments', icon: <ClipboardList size={18} />, path: ROUTES.CANDIDATE.ASSESSMENTS },
  { label: 'Interviews', icon: <Video size={18} />, path: ROUTES.CANDIDATE.INTERVIEWS },
  { label: 'Results', icon: <Award size={18} />, path: ROUTES.CANDIDATE.RESULTS },
  { label: 'Password', icon: <Lock size={18} />, path: ROUTES.CANDIDATE.CHANGE_PASSWORD },
];

// ---------------------------------------------------------------------------
// Tooltip for collapsed mode
// ---------------------------------------------------------------------------
function NavTooltip({ label, visible }: { label: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      className="
        absolute left-full top-1/2 -translate-y-1/2 ml-3
        px-3 py-1.5 rounded-lg
        text-[0.8125rem] font-medium whitespace-nowrap
        bg-[var(--bgElevated,var(--surface2))] text-[var(--text)]
        shadow-[var(--shadowFloating)]
        pointer-events-none z-[100]
        animate-fade-in
      "
      style={{
        backdropFilter: 'blur(12px)',
      }}
    >
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar Component
// ---------------------------------------------------------------------------
interface SidebarProps {
  environment?: 'dev' | 'test' | 'prod';
}

export function Sidebar({ environment = 'prod' }: SidebarProps) {
  const { collapsed, toggle } = useSidebar();
  const [hovered, setHovered] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const location = useLocation();
  const { user, logout } = useAuth();
  const { hasAnyRole, roles } = useRbac();
  const { imageUrl } = useProfileImage();

  const isAdmin = hasAnyRole(['ADMIN', 'SUPER_ADMIN']);
  const navItems = isAdmin ? adminNavItems : candidateNavItems;

  // Keyboard shortcut: [ to toggle sidebar
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === '[' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      toggle();
    }
  }, [toggle]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // When collapsed, expand on hover for a "peek" experience
  const isExpanded = !collapsed || hovered;
  const showTooltips = collapsed && !hovered;

  const envColors = {
    dev: 'warning',
    test: 'info',
    prod: 'success',
  } as const;

  return (
    <aside
      onMouseEnter={() => collapsed && setHovered(true)}
      onMouseLeave={() => { setHovered(false); setHoveredItem(null); }}
      className={`
        sidebar-surface
        fixed left-0 top-0 h-screen
        transition-all duration-moderate ease-spring
        ${isExpanded ? 'w-[240px]' : 'w-[72px]'}
        ${collapsed && hovered ? 'sidebar-preview' : ''}
        flex flex-col z-sidebar
        hidden md:flex
      `}
    >
      {/* ----------------------------------------------------------------
          Logo — Brand identity
          ---------------------------------------------------------------- */}
      <div className="flex items-center h-16 px-4 flex-shrink-0 relative z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="sidebar-logo-mark w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm gradient-brand flex-shrink-0">
            RP
          </div>
          <span
            className={`
              font-heading font-bold text-[1.05rem] gradient-text
              transition-all duration-moderate ease-spring
              ${isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0 overflow-hidden'}
            `}
          >
            RightPath
          </span>
        </div>
      </div>

      {/* Environment badge */}
      {environment !== 'prod' && isExpanded && (
        <div className="px-5 pb-2 relative z-10">
          <Badge variant={envColors[environment]} size="sm">
            {environment.toUpperCase()}
          </Badge>
        </div>
      )}

      {/* ----------------------------------------------------------------
          Navigation — Single continuous list
          No category groupings. Spacing creates visual rhythm.
          ---------------------------------------------------------------- */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none py-3 relative z-10">
        <ul className={`space-y-0.5 transition-all duration-moderate ease-spring ${isExpanded ? 'px-3' : 'px-0'}`}>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <li key={item.path} className={`relative ${!isExpanded ? 'flex justify-center' : ''}`}>
                <Link
                  to={item.path}
                  onMouseEnter={() => setHoveredItem(item.path)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={`
                    sidebar-nav-item
                    group flex items-center relative
                    transition-all duration-200 ease-spring
                    ${isExpanded
                      ? 'gap-3 rounded-2xl px-3.5 py-2.5 w-full'
                      : 'justify-center rounded-full w-10 h-10'
                    }
                    ${
                      isActive
                        ? 'sidebar-nav-active text-[var(--sidebarTextActive)] font-semibold'
                        : 'text-[var(--sidebarText)] hover:text-[var(--sidebarTextHover,var(--text))] font-medium'
                    }
                  `}
                >
                  <span
                    className={`
                      flex-shrink-0 transition-all duration-200
                      ${isActive ? 'text-[var(--sidebarTextActive)]' : 'opacity-70 group-hover:opacity-100'}
                    `}
                  >
                    {item.icon}
                  </span>

                  <span
                    className={`
                      flex-1 truncate text-[0.8125rem] tracking-[-0.01em]
                      transition-all duration-moderate ease-spring
                      ${isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0 overflow-hidden'}
                    `}
                  >
                    {item.label}
                  </span>

                  {item.badge && isExpanded && (
                    <Badge variant="primary" size="sm">
                      {item.badge}
                    </Badge>
                  )}
                </Link>

                {/* Tooltip in collapsed mode */}
                <NavTooltip
                  label={item.label}
                  visible={showTooltips && hoveredItem === item.path}
                />
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ----------------------------------------------------------------
          Bottom: User Card + Collapse Toggle
          ---------------------------------------------------------------- */}
      <div className={`flex-shrink-0 ${isExpanded ? 'px-3' : 'px-0'} pb-3 pt-2 space-y-1.5 relative z-10 transition-all duration-moderate ease-spring`}>
        {/* Logout */}
        <div className={!isExpanded ? 'flex justify-center' : ''}>
          <button
            onClick={() => logout()}
            onMouseEnter={() => setHoveredItem('logout')}
            onMouseLeave={() => setHoveredItem(null)}
            className={`
              group flex items-center relative
              text-[var(--sidebarText)] font-medium
              hover:bg-[var(--errorMuted,var(--errorLight))] hover:text-[var(--error)]
              transition-all duration-200 ease-spring
              ${isExpanded ? 'gap-3 w-full rounded-2xl px-3.5 py-2' : 'justify-center rounded-full w-10 h-10'}
            `}
          >
          <LogOut size={18} className="flex-shrink-0 opacity-70 group-hover:opacity-100" />
          <span
            className={`
              text-[0.8125rem]
              transition-all duration-moderate ease-spring
              ${isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0 overflow-hidden'}
            `}
          >
            Logout
          </span>
          <NavTooltip
            label="Logout"
            visible={showTooltips && hoveredItem === 'logout'}
          />
          </button>
        </div>

        {/* User card + collapse button */}
        <div className={`flex items-center ${isExpanded ? 'gap-2' : 'justify-center'}`}>
          <div
            className={`
              sidebar-user-card
              flex items-center rounded-2xl
              transition-all duration-200
              ${isExpanded ? 'gap-3 flex-1 min-w-0 p-2.5' : 'justify-center p-1.5'}
            `}
          >
            <Avatar
              src={imageUrl}
              firstName={user?.firstName}
              lastName={user?.lastName}
              size="sm"
            />
            <div
              className={`
                min-w-0 transition-all duration-moderate ease-spring
                ${isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0 overflow-hidden'}
              `}
            >
              <p className="text-[0.8125rem] font-semibold text-[var(--text)] truncate leading-tight">
                {formatName(user?.firstName, user?.lastName)}
              </p>
              <p className="text-[0.6875rem] text-[var(--textTertiary)] truncate capitalize leading-tight mt-0.5">
                {roles[0]?.toLowerCase().replace('_', ' ') || 'User'}
              </p>
            </div>
          </div>

          {/* Sidebar control — always visible, state-aware icon */}
          <button
            onClick={toggle}
            className={`
              sidebar-collapse-btn p-1.5 rounded-xl
              transition-all duration-200 ease-spring flex-shrink-0
              ${hovered && collapsed
                ? 'text-[var(--sidebarTextActive)] hover:bg-[var(--sidebarItemActive,rgba(16,185,129,0.12))]'
                : 'text-[var(--sidebarText)] hover:text-[var(--sidebarTextHover)]'
              }
            `}
            title={
              collapsed && hovered
                ? 'Pin sidebar open (press [)'
                : collapsed
                  ? 'Expand sidebar (press [)'
                  : 'Collapse sidebar (press [)'
            }
          >
            {collapsed && hovered ? (
              <Pin size={16} className="rotate-45" />
            ) : collapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <PanelLeftClose size={16} />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
