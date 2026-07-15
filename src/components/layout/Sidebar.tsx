import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Calendar,
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
  Menu,
  PanelLeftClose,
} from 'lucide-react';
import { useSidebar } from '@/contexts/SidebarContext';
import { useRbac } from '@/hooks/useRbac';
import { ROUTES } from '@/config/routes';
import { Badge } from '../ui/Badge';

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
];

const candidateNavItems: NavItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={18} />, path: ROUTES.CANDIDATE.DASHBOARD },
  { label: 'Resume', icon: <FileText size={18} />, path: ROUTES.CANDIDATE.RESUME },
  { label: 'Events', icon: <BookOpen size={18} />, path: ROUTES.CANDIDATE.EVENTS },
  { label: 'Applications', icon: <FileText size={18} />, path: ROUTES.CANDIDATE.APPLICATIONS },
  { label: 'Assessments', icon: <ClipboardList size={18} />, path: ROUTES.CANDIDATE.ASSESSMENTS },
  { label: 'Interviews', icon: <Video size={18} />, path: ROUTES.CANDIDATE.INTERVIEWS },
  { label: 'Results', icon: <Award size={18} />, path: ROUTES.CANDIDATE.RESULTS },
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
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const location = useLocation();
  const { hasAnyRole } = useRbac();

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

  // Collapse/expand is driven purely by the toggle (click or the [ shortcut).
  const isExpanded = !collapsed;
  const showTooltips = collapsed;

  const envColors = {
    dev: 'warning',
    test: 'info',
    prod: 'success',
  } as const;

  return (
    <aside
      onMouseLeave={() => setHoveredItem(null)}
      className={`
        sidebar-surface
        fixed left-0 top-0 h-screen
        transition-all duration-moderate ease-spring
        ${isExpanded ? 'w-[240px]' : 'w-[72px]'}
        flex flex-col z-sidebar
        hidden md:flex
      `}
    >
      {/* ----------------------------------------------------------------
          Logo + Hamburger toggle
          ---------------------------------------------------------------- */}
      <div
        className={`
          flex items-center h-16 flex-shrink-0 relative z-10
          ${isExpanded ? 'px-4 gap-2' : 'px-0 justify-center'}
        `}
      >
        {isExpanded && (
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="sidebar-logo-mark w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm gradient-brand flex-shrink-0">
              RP
            </div>
            <span className="font-heading font-bold text-[1.05rem] gradient-text truncate">
              RightPath
            </span>
          </div>
        )}

        {/* Hamburger — collapse / expand the sidebar */}
        <button
          onClick={toggle}
          className={`
            sidebar-collapse-btn p-2 rounded-xl flex-shrink-0
            transition-all duration-200 ease-spring
            text-[var(--sidebarText)] hover:text-[var(--sidebarTextHover,var(--text))]
            hover:bg-[var(--sidebarItemHover,var(--bgOverlay,var(--surface1)))]
          `}
          title={collapsed ? 'Expand sidebar (press [)' : 'Collapse sidebar (press [)'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isExpanded ? <PanelLeftClose size={18} /> : <Menu size={18} />}
        </button>
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
    </aside>
  );
}
