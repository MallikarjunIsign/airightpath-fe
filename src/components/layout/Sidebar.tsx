import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Calendar,
  FileText,
  ClipboardList,
  UserCheck,
  MessageSquare,
  BookOpen,
  Award,
  FileSearch,
  Layers,
  Video,
  Menu,
  PanelLeftClose,
  FlaskConical,
  ChevronDown,
  X,
} from "lucide-react";
import { useSidebar } from "@/contexts/SidebarContext";
import { usePendingAssessments } from "@/contexts/PendingAssessmentsContext";
import { useRbac } from "@/hooks/useRbac";
import { ROUTES } from "@/config/routes";
import { TEST_MODE_GROUPS, testModesInGroup } from "@/config/test-mode";
import { Badge } from "../ui/Badge";
import { Logo } from "../ui/Logo";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
/**
 * A leaf under an expandable parent. Grouped by an optional heading so one
 * submenu can carry two labelled sets — Test Mode splits its four screens into
 * Assessments and Interview without needing a third level of nesting, which a
 * 264px rail cannot show legibly.
 */
interface NavChild {
  label: string;
  path: string;
  /** Heading rendered above this child when it differs from the previous one. */
  group?: string;
}

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
  badge?: string;
  /**
   * Present on parents that expand rather than navigate straight to a leaf.
   * The parent's own `path` is still a real page — a hub listing the children —
   * so clicking the label is never a dead end.
   */
  children?: NavChild[];
  /**
   * Marks the item that carries the outstanding-assessment count. Kept as a
   * flag on the item rather than a path comparison at render time so the
   * indicator moves with the route if it is ever renamed.
   */
  showsPendingAssessments?: boolean;
}

// ---------------------------------------------------------------------------
// Navigation Data — single continuous list, no category groupings
// ---------------------------------------------------------------------------
const adminNavItems: NavItem[] = [
  {
    label: "Dashboard",
    icon: <LayoutDashboard size={18} />,
    path: ROUTES.ADMIN.DASHBOARD,
  },
  {
    label: "Job Events",
    icon: <BookOpen size={18} />,
    path: ROUTES.ADMIN.JOBS,
  },
  // Create Job — reached from the "Create Job" button on the Job Events page,
  // so it does not need its own sidebar entry. Route and page are unchanged.
  // {
  //   label: "Create Job",
  //   icon: <Briefcase size={18} />,   // re-add the Briefcase import to restore
  //   path: ROUTES.ADMIN.JOBS_CREATE,
  // },
  {
    label: "Candidates",
    icon: <UserCheck size={18} />,
    path: ROUTES.ADMIN.CANDIDATES,
  },
  {
    // Scores the resumes of people who applied to a chosen job. Same wording as
    // the "Screen with ATS" button on the Candidates screen.
    label: "Screen with ATS",
    icon: <FileSearch size={18} />,
    path: ROUTES.ADMIN.ATS,
  },
  {
    label: "Manage AI Prompts",
    icon: <MessageSquare size={18} />,
    path: ROUTES.ADMIN.PROMPTS,
  },
  {
    label: "Assign Assessment",
    icon: <ClipboardList size={18} />,
    path: ROUTES.ADMIN.ASSESSMENTS_ASSIGN,
  },
  {
    label: "Assessment Results",
    icon: <Award size={18} />,
    path: ROUTES.ADMIN.ASSESSMENTS_RESULTS,
  },
  {
    label: "Schedule Interview",
    icon: <Calendar size={18} />,
    path: ROUTES.ADMIN.INTERVIEWS_SCHEDULE,
  },
  {
    label: "Interview Results",
    icon: <Video size={18} />,
    path: ROUTES.ADMIN.INTERVIEWS_RESULTS,
  },
  {
    // A scoring sandbox: paste any job description, upload resumes, read the
    // scores. No job post, no applicants, nothing written to the pipeline.
    label: "Bulk ATS Check",
    icon: <Layers size={18} />,
    path: ROUTES.ADMIN.ATS_BATCH,
  },
  {
    // Rehearses the candidate side of each exam and interview stage. Like Bulk
    // ATS Check above it, it writes nothing — see config/test-mode.ts.
    label: "Test Mode",
    icon: <FlaskConical size={18} />,
    path: ROUTES.ADMIN.TEST_MODE,
    children: TEST_MODE_GROUPS.flatMap((group) =>
      testModesInGroup(group).map((mode, index) => ({
        label: mode.label,
        path: mode.path,
        // Only the first of each group carries the heading.
        group: index === 0 ? group : undefined,
      })),
    ),
  },
  {
    label: "User Management",
    icon: <Users size={18} />,
    path: ROUTES.ADMIN.USERS,
  },
  // Upload Questions — question papers are generated or uploaded from the
  // Assign Assessment screen, so this duplicate entry is hidden. Route and page
  // are unchanged; re-add the Upload icon import to restore.
  // {
  //   label: "Upload Questions",
  //   icon: <Upload size={18} />,
  //   path: ROUTES.ADMIN.ASSESSMENTS_UPLOAD,
  // },
];

const candidateNavItems: NavItem[] = [
  {
    label: "Dashboard",
    icon: <LayoutDashboard size={18} />,
    path: ROUTES.CANDIDATE.DASHBOARD,
  },
  {
    label: "Job Events",
    icon: <BookOpen size={18} />,
    path: ROUTES.CANDIDATE.EVENTS,
  },
  {
    // Where a candidate follows the jobs they have applied to.
    label: "Applied Jobs",
    icon: <FileText size={18} />,
    path: ROUTES.CANDIDATE.APPLICATIONS,
  },
  {
    label: "Assessments",
    icon: <ClipboardList size={18} />,
    path: ROUTES.CANDIDATE.ASSESSMENTS,
    showsPendingAssessments: true,
  },
  {
    label: "Interviews",
    icon: <Video size={18} />,
    path: ROUTES.CANDIDATE.INTERVIEWS,
  },
  {
    label: "Results",
    icon: <Award size={18} />,
    path: ROUTES.CANDIDATE.RESULTS,
  },
  {
    label: "Resume Management",
    icon: <FileText size={18} />,
    path: ROUTES.CANDIDATE.RESUME,
  },
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
        backdropFilter: "blur(12px)",
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
  environment?: "dev" | "test" | "prod";
}

export function Sidebar({ environment = "prod" }: SidebarProps) {
  const { collapsed, toggle, mobileOpen, closeMobile, isMobile } = useSidebar();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  /**
   * Which expandable parents are open. Deliberately not persisted: the branch
   * containing the current page opens itself below, which is the only state a
   * returning user actually wants restored.
   */
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const location = useLocation();
  const { hasAnyRole } = useRbac();
  const { pending } = usePendingAssessments();

  const isAdmin = hasAnyRole(["ADMIN", "SUPER_ADMIN"]);
  const navItems = isAdmin ? adminNavItems : candidateNavItems;

  /** True while the current page is the parent itself or any of its children. */
  const containsActiveRoute = useCallback(
    (item: NavItem) =>
      location.pathname === item.path ||
      location.pathname.startsWith(`${item.path}/`) ||
      (item.children?.some((child) => location.pathname === child.path) ?? false),
    [location.pathname],
  );

  // Open the branch the current page lives in. Runs on navigation rather than
  // once on mount, so deep-linking to a child arrives with its parent already
  // expanded instead of the page appearing to sit outside the menu.
  useEffect(() => {
    const active = navItems.find((item) => item.children && containsActiveRoute(item));
    if (active) {
      setOpenGroups((prev) => (prev.includes(active.path) ? prev : [...prev, active.path]));
    }
  }, [navItems, containsActiveRoute]);

  const toggleGroup = useCallback((path: string) => {
    setOpenGroups((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
  }, []);

  // Keyboard shortcut: [ to toggle sidebar
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "[" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        )
          return;
        toggle();
      }
    },
    [toggle],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // On mobile the sidebar is an off-canvas drawer and always shows full width
  // with labels. On desktop, collapse/expand is driven by the toggle / [ shortcut.
  const isExpanded = isMobile ? true : !collapsed;
  const showTooltips = !isMobile && collapsed;

  const envColors = {
    dev: "warning",
    test: "info",
    prod: "success",
  } as const;

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[45] md:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      <aside
        onMouseLeave={() => setHoveredItem(null)}
        className={`
          sidebar-surface
          fixed left-0 top-0 h-screen
          transition-transform duration-moderate ease-spring md:transition-all
          ${isExpanded ? "w-[264px]" : "w-[72px]"}
          ${mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"} md:translate-x-0
          flex flex-col z-sidebar
        `}
      >
      {/* ----------------------------------------------------------------
          Logo + Hamburger toggle
          ---------------------------------------------------------------- */}
      <div
        className={`
          flex items-center h-16 flex-shrink-0 relative z-10
          ${isExpanded ? "px-4 gap-2" : "px-0 justify-center"}
        `}
      >
        {isExpanded && (
          <div className="flex items-center min-w-0 flex-1">
            <Logo className="h-8 w-auto" />
          </div>
        )}

        {/* Mobile: close drawer. Desktop: collapse / expand the sidebar. */}
        <button
          onClick={isMobile ? closeMobile : toggle}
          className={`
            sidebar-collapse-btn p-2 rounded-xl flex-shrink-0
            transition-all duration-200 ease-spring
            text-[var(--sidebarText)] hover:text-[var(--sidebarTextHover,var(--text))]
            hover:bg-[var(--sidebarItemHover,var(--bgOverlay,var(--surface1)))]
          `}
          title={
            isMobile
              ? "Close menu"
              : collapsed
                ? "Expand sidebar (press [)"
                : "Collapse sidebar (press [)"
          }
          aria-label={isMobile ? "Close menu" : collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isMobile ? <X size={18} /> : isExpanded ? <PanelLeftClose size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Environment badge */}
      {environment !== "prod" && isExpanded && (
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
        <ul
          className={`
            transition-all duration-moderate ease-spring
            ${isExpanded ? "px-3 space-y-0.5" : "px-0 space-y-1 flex flex-col items-center"}
          `}
        >
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const pendingCount = item.showsPendingAssessments ? pending.length : 0;
            // Children are only reachable while the rail shows labels. Collapsed,
            // the parent still navigates to its hub, which lists the same links.
            const hasChildren = !!item.children?.length && isExpanded;
            const isOpen = openGroups.includes(item.path);
            return (
              <li
                key={item.path}
                className={`relative ${!isExpanded ? "flex justify-center w-full" : ""}`}
              >
                <div className={hasChildren ? "flex items-center gap-0.5" : ""}>
                <Link
                  to={item.path}
                  onClick={closeMobile}
                  onMouseEnter={() => setHoveredItem(item.path)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={`
                    sidebar-nav-item
                    group flex items-center relative
                    transition-all duration-200 ease-spring
                    ${
                      isExpanded
                        ? "gap-3 rounded-2xl px-3.5 py-2.5 w-full"
                        : "justify-center rounded-full w-10 h-10"
                    }
                    ${
                      isActive
                        ? "sidebar-nav-active text-[var(--sidebarTextActive)] font-semibold"
                        : "text-[var(--sidebarText)] hover:text-[var(--sidebarTextHover,var(--text))] font-medium"
                    }
                  `}
                >
                  <span
                    className={`
                      relative flex-shrink-0 transition-all duration-200
                      ${isActive ? "text-[var(--sidebarTextActive)]" : "opacity-70 group-hover:opacity-100"}
                    `}
                  >
                    {item.icon}
                    {/* Collapsed mode hides the label and so the count with it;
                        a dot on the icon is the only thing left that can carry
                        it. Ringed so it reads against the icon underneath. */}
                    {pendingCount > 0 && !isExpanded && (
                      <span
                        className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--error)] ring-2 ring-[var(--sidebarBg,var(--surface1))]"
                        aria-hidden="true"
                      />
                    )}
                  </span>

                  {/* One line. The sidebar is wide enough for these labels; a
                      longer one clips and the hover title spells it out. */}
                  <span
                    title={item.label}
                    className={`
                      truncate text-[0.8125rem] tracking-[-0.01em]
                      transition-all duration-moderate ease-spring
                      ${isExpanded ? "flex-1 min-w-0 opacity-100 w-auto" : "hidden"}
                    `}
                  >
                    {item.label}
                  </span>

                  {item.badge && isExpanded && (
                    <Badge variant="primary" size="sm">
                      {item.badge}
                    </Badge>
                  )}

                  {pendingCount > 0 && isExpanded && (
                    <span
                      className="flex-shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-[var(--error)] text-white text-[0.6875rem] font-semibold flex items-center justify-center"
                      title={`${pendingCount} assessment${pendingCount === 1 ? '' : 's'} to complete`}
                    >
                      {pendingCount}
                    </span>
                  )}
                </Link>

                {/* Separate from the Link so the label still navigates to the
                    hub — expanding a menu and opening its landing page are two
                    different intents and both are worth keeping. */}
                {hasChildren && (
                  <button
                    onClick={() => toggleGroup(item.path)}
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? "Collapse" : "Expand"} ${item.label}`}
                    className="
                      flex-shrink-0 p-1.5 rounded-lg
                      text-[var(--sidebarText)] hover:text-[var(--sidebarTextHover,var(--text))]
                      hover:bg-[var(--sidebarItemHover,var(--bgOverlay,var(--surface1)))]
                      transition-colors
                    "
                  >
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                )}
                </div>

                {hasChildren && isOpen && (
                  <ul className="mt-0.5 mb-1 ml-5 pl-3 border-l border-[var(--sidebarBorder,var(--border))] space-y-0.5">
                    {item.children!.map((child) => {
                      const childActive = location.pathname === child.path;
                      return (
                        <li key={child.path}>
                          {/* Group heading, not a link: it names the pair below
                              it rather than going anywhere itself. */}
                          {child.group && (
                            <p className="px-2 pt-2 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--sidebarText)] opacity-60">
                              {child.group}
                            </p>
                          )}
                          <Link
                            to={child.path}
                            onClick={closeMobile}
                            className={`
                              block rounded-xl px-2.5 py-2 text-[0.8125rem] tracking-[-0.01em] truncate
                              transition-all duration-200
                              ${
                                childActive
                                  ? "sidebar-nav-active text-[var(--sidebarTextActive)] font-semibold"
                                  : "text-[var(--sidebarText)] hover:text-[var(--sidebarTextHover,var(--text))] font-medium"
                              }
                            `}
                            title={child.label}
                          >
                            {child.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}

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
    </>
  );
}
