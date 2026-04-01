# RightPath - Enterprise SaaS Platform Documentation

## Overview

RightPath is a modern, enterprise-grade SaaS web application for role-based career and internal management. Built with React, TypeScript, Tailwind CSS, and Supabase, it features a complete authentication system, role-based access control, and a sophisticated design system.

## Features Implemented

### Design System
- **Theme Support**: Complete light/dark mode with system detection
- **Design Tokens**: Comprehensive color, spacing, and typography system
- **CSS Variables**: Dynamic theme switching without page reload
- **Typography**: Clean, modern typography with Inter font family
- **8px Grid System**: Consistent spacing throughout the application

### UI Component Library
- **Button**: Multiple variants (primary, secondary, outline, ghost, danger) with loading states
- **Input**: Form inputs with labels, icons, validation states
- **Card**: Flexible card component with header, content, footer
- **Badge**: Status badges with multiple color variants
- **Table**: Responsive data tables with sorting capabilities
- **Modal**: Accessible modal dialogs with confirmation variants
- **Select**: Dropdown selects with custom styling
- **Checkbox**: Custom styled checkboxes
- **Toast**: Notification system with auto-dismiss
- **Skeleton**: Loading placeholders
- **Empty State**: Helpful empty state displays

### Layout Components
- **Sidebar**: Collapsible navigation with role-based menu items
- **Navbar**: Top navigation with search, notifications, theme switcher, profile menu
- **Layout**: Main layout wrapper combining sidebar and navbar
- **Public Layout**: Simplified layout for public pages

### Authentication System
- **JWT-based**: Secure token authentication with Supabase Auth
- **Auto-refresh**: Automatic token refresh for seamless sessions
- **Login/Register**: Complete authentication flows
- **Password Reset**: Forgot password and reset functionality
- **Protected Routes**: Role-based route protection
- **Session Management**: Session expiry tracking and notifications

### Role-Based Access Control
- **5 User Roles**:
  - Super Admin: Complete system access
  - Admin: Organization-wide administration
  - HR: Candidate and recruitment management
  - Interviewer: Interview management
  - Candidate: External job applicants

- **Dynamic Dashboards**: Different dashboard views per role
- **Permission System**: Granular permissions for resources and actions
- **Route Guards**: Automatic redirection based on role permissions

### Database Schema
Complete Supabase schema with:
- User profiles with role assignments
- Roles and permissions tables
- Role-permission mappings
- System configurations
- Row Level Security (RLS) policies
- Automatic profile creation on signup
- Audit tracking with timestamps

### Pages Implemented

#### Authentication
- `/login` - User login
- `/register` - New user registration
- `/forgot-password` - Password reset request
- `/reset-password` - Password reset completion

#### Dashboards
- `/dashboard` - Role-specific dashboard (dynamic)
- Super Admin Dashboard with system stats
- HR Dashboard with candidate pipeline
- Candidate Dashboard with application tracking

#### Protected Routes
- `/users` - User management (Super Admin, Admin)
- `/candidates` - Candidate management (Super Admin, Admin, HR, Interviewer)
- `/interviews` - Interview scheduling (Super Admin, Admin, HR, Interviewer)
- `/roles` - Role & permission management (Super Admin, Admin)
- `/settings` - User settings (All authenticated users)

#### Error Pages
- `/unauthorized` - 403 Access Denied
- `*` - 404 Not Found

## Project Structure

```
src/
├── components/
│   ├── ui/              # Core UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   ├── Badge.tsx
│   │   ├── Table.tsx
│   │   ├── Modal.tsx
│   │   ├── Select.tsx
│   │   ├── Checkbox.tsx
│   │   ├── Toast.tsx
│   │   ├── Skeleton.tsx
│   │   └── EmptyState.tsx
│   ├── layout/          # Layout components
│   │   ├── Sidebar.tsx
│   │   ├── Navbar.tsx
│   │   └── Layout.tsx
│   └── auth/            # Auth components
│       └── ProtectedRoute.tsx
├── contexts/
│   ├── ThemeContext.tsx # Theme management
│   └── AuthContext.tsx  # Authentication state
├── pages/
│   ├── auth/            # Authentication pages
│   │   ├── Login.tsx
│   │   ├── Register.tsx
│   │   ├── ForgotPassword.tsx
│   │   └── ResetPassword.tsx
│   ├── dashboards/      # Role-specific dashboards
│   │   ├── SuperAdminDashboard.tsx
│   │   ├── HRDashboard.tsx
│   │   └── CandidateDashboard.tsx
│   └── errors/          # Error pages
│       ├── NotFound.tsx
│       └── Unauthorized.tsx
├── theme/
│   └── tokens.ts        # Design tokens
├── lib/
│   └── supabase.ts      # Supabase client
├── App.tsx              # Main app with routing
└── main.tsx             # App entry point
```

## Technology Stack

- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS with custom design system
- **Routing**: React Router v6
- **Authentication**: Supabase Auth (JWT-based)
- **Database**: Supabase (PostgreSQL)
- **Icons**: Lucide React
- **Build Tool**: Vite

## Database Schema

### Tables Created

1. **user_profiles**
   - Extends auth.users with role and profile info
   - Links to Supabase auth system

2. **roles**
   - Defines system roles (super_admin, admin, hr, interviewer, candidate)

3. **permissions**
   - Granular permissions for resources and actions

4. **role_permissions**
   - Maps roles to permissions (many-to-many)

5. **system_configurations**
   - Global system settings (JWT expiry, password policies, etc.)

### Security Features

- Row Level Security (RLS) enabled on all tables
- Role-based access policies
- Automatic user profile creation
- Audit trails with timestamps
- Secure authentication with Supabase

## Environment Variables

The following environment variables are configured in `.env`:

```
VITE_SUPABASE_URL=https://udzymreispeqsbvhdgef.supabase.co
VITE_SUPABASE_ANON_KEY=[configured]
```

## Design Principles

### Clean Enterprise SaaS Style
- Inspired by Stripe, Notion, and Linear
- Minimal but powerful interfaces
- Consistent spacing and typography
- Soft shadows and subtle borders
- Accessible contrast ratios (WCAG compliant)

### Component-Driven Architecture
- Reusable, composable components
- Single responsibility principle
- Type-safe with TypeScript
- Props-based customization

### Responsive Design
- Desktop-first approach
- Tablet and mobile adaptations
- Collapsible sidebar on mobile
- Responsive tables and cards

### Theme System
- Light and dark modes
- System preference detection
- CSS variable-based theming
- Smooth transitions

## Getting Started

### Development
```bash
npm run dev
```

### Build
```bash
npm run build
```

### Type Check
```bash
npm run typecheck
```

## User Roles & Permissions

### Super Admin
- Full system access
- User management
- Role and permission management
- System configuration
- Audit logs
- All admin capabilities

### Admin
- Organization configuration
- Workflow management
- User management (limited)
- Permission matrix view
- System settings

### HR
- Candidate management
- Interview scheduling
- Pipeline view (Kanban)
- Application tracking
- Offer management

### Interviewer
- Assigned interviews view
- Interview feedback forms
- Candidate evaluation
- Schedule management

### Candidate (External)
- Profile dashboard
- Application status tracking
- Resume upload
- Interview notifications
- Timeline view

## Security Features

- JWT access tokens with automatic refresh
- Secure password requirements (8+ characters)
- Row Level Security on all database tables
- Role-based route protection
- Session expiry tracking
- Protected API endpoints
- HTTPS-only cookies (ready)
- XSS and CSRF protection

## Next Steps

To continue building RightPath, consider implementing:

1. **User Management Screen**: Full CRUD for users
2. **Candidate Pipeline**: Kanban board for recruitment
3. **Interview Scheduler**: Calendar integration
4. **Permission Matrix**: Visual permission editor
5. **Workflow Builder**: Custom workflow configuration
6. **File Upload**: Resume and document management
7. **Real-time Notifications**: WebSocket integration
8. **Advanced Analytics**: Charts and reporting
9. **Email Notifications**: Transactional emails
10. **API Integration**: Third-party service connections

## Best Practices

### Component Development
- Use TypeScript for type safety
- Follow single responsibility principle
- Keep components small and focused
- Use composition over inheritance
- Implement proper error boundaries

### State Management
- Use React Context for global state
- Keep state close to where it's used
- Avoid prop drilling with context
- Use custom hooks for reusable logic

### Security
- Never expose sensitive data in frontend
- Validate all user inputs
- Use RLS policies for database access
- Implement proper error handling
- Log security events for audit

### Performance
- Lazy load routes and heavy components
- Optimize images and assets
- Use React.memo for expensive renders
- Implement proper loading states
- Monitor bundle size

## Support

For questions or issues, refer to:
- Supabase Documentation: https://supabase.com/docs
- React Router: https://reactrouter.com
- Tailwind CSS: https://tailwindcss.com

---

Built with modern web technologies for enterprise-grade performance and security.
