# RightPath - Quick Start Guide

## Testing the Application

### 1. Start the Development Server

The development server starts automatically. Your application is now running.

### 2. Create Your First User

Navigate to the registration page and create an account:

**URL**: `/register`

Fill in:
- Full Name: Your name
- Email: your.email@example.com
- Password: (minimum 8 characters)
- Confirm Password: (same as password)
- Check "I agree to the Terms and Conditions"

Click "Create account"

### 3. Understanding User Roles

By default, new users are assigned the `candidate` role. To test different roles:

#### Test as Candidate (Default)
- View your application dashboard
- Track application status
- See interview timeline
- Upload documents

#### Test as Super Admin
To test admin features, you'll need to update your user role in the database:

1. Go to your Supabase dashboard
2. Navigate to Table Editor > user_profiles
3. Find your user record
4. Change the `role` field to `super_admin`
5. Log out and log back in

As Super Admin, you'll see:
- Complete system overview
- User management interface
- System configuration panel
- Activity logs
- All admin capabilities

#### Test as HR
Change role to `hr` to see:
- Candidate pipeline
- Interview scheduling
- Application management
- Recruitment metrics

### 4. Testing Theme Switching

Click the sun/moon icon in the top navbar to switch between:
- Light Mode
- Dark Mode
- System Mode (auto-detect)

### 5. Testing Navigation

#### Sidebar Navigation
- Dashboard: Main overview for your role
- Users: User management (Super Admin, Admin only)
- Candidates: Candidate management (Super Admin, Admin, HR, Interviewer)
- Interviews: Interview scheduling (Super Admin, Admin, HR, Interviewer)
- Roles & Permissions: Role management (Super Admin, Admin)
- Settings: User settings (All users)

Try accessing pages you don't have permission for - you'll be redirected to the Unauthorized page.

#### Navbar Features
- **Search**: Global search functionality (placeholder)
- **Theme Toggle**: Switch between light/dark/system modes
- **Notifications**: View system notifications (mock data)
- **Profile Menu**: Access profile settings and logout

### 6. Testing Authentication Features

#### Password Reset
1. Log out
2. Go to login page
3. Click "Forgot password?"
4. Enter your email
5. Check email for reset link (if email is configured in Supabase)

#### Session Management
- Your session is automatically maintained with JWT tokens
- Tokens refresh automatically before expiry
- Session expiry time is shown in the profile menu

### 7. Testing Role-Based Access

#### As Super Admin:
- Access all menu items
- View system statistics
- Manage users and roles
- Configure system settings

#### As HR:
- Access candidates and interviews
- View candidate pipeline
- Schedule interviews
- Cannot access user management or roles

#### As Candidate:
- Only access dashboard and settings
- View application status
- Track interview progress
- Upload documents

### 8. Database Verification

Check your Supabase dashboard to verify:

#### Tables Created
- user_profiles
- roles
- permissions
- role_permissions
- system_configurations

#### Default Data
- 5 roles (super_admin, admin, hr, interviewer, candidate)
- System configurations (JWT expiry, password policies, etc.)

#### Row Level Security
All tables have RLS policies enabled. Test by:
1. Creating multiple users with different roles
2. Verifying each user can only access their allowed data

### 9. Component Testing

#### UI Components
Test all UI components:
- Buttons: Try different variants and loading states
- Inputs: Test validation and error states
- Modals: Open and close dialogs
- Tables: Check sorting and pagination (when implemented)
- Cards: Hover effects and interactions
- Badges: Different status colors
- Toast notifications: Trigger success/error messages

#### Responsive Design
Test responsive behavior:
1. Resize browser window
2. Sidebar should collapse at mobile breakpoints
3. Tables should adapt to smaller screens
4. Navigation should remain accessible

### 10. Error Handling

Test error scenarios:
1. Try logging in with wrong credentials
2. Access a route that doesn't exist (404)
3. Try accessing a protected route without permission (403)
4. Submit forms with invalid data

## Common Tasks

### Change User Role

**Via Supabase Dashboard**:
1. Open Supabase Dashboard
2. Go to Table Editor > user_profiles
3. Find the user
4. Edit the `role` field
5. User must log out and log back in

**Via SQL** (Super Admin):
```sql
UPDATE user_profiles
SET role = 'super_admin'
WHERE id = 'user-uuid-here';
```

### Add New Permission

```sql
INSERT INTO permissions (name, description, resource, action)
VALUES (
  'candidate.delete',
  'Delete candidates',
  'candidate',
  'delete'
);
```

### Assign Permission to Role

```sql
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'hr'
AND p.name = 'candidate.delete';
```

### Update System Configuration

```sql
UPDATE system_configurations
SET value = '"2 hours"'::jsonb
WHERE key = 'jwt_token_expiry';
```

## Troubleshooting

### Can't Login
- Verify Supabase credentials in .env file
- Check browser console for errors
- Ensure user exists in auth.users table

### 403 Unauthorized
- Check your user role in user_profiles table
- Verify you're accessing a route allowed for your role
- Log out and log back in after role changes

### Theme Not Switching
- Check browser console for errors
- Verify ThemeProvider is wrapping the app
- Clear localStorage and refresh

### Database Errors
- Verify RLS policies are not blocking your queries
- Check Supabase logs for detailed errors
- Ensure migrations ran successfully

## Development Tips

### Hot Reload
Vite provides fast hot module reload. Changes to components update instantly.

### TypeScript Checking
Run type checking: `npm run typecheck`

### Build for Production
```bash
npm run build
npm run preview
```

### Adding New Routes
1. Create page component in `src/pages/`
2. Add route in `src/App.tsx`
3. Wrap in `<ProtectedRoute>` if authentication required
4. Add `allowedRoles` prop for role-based access

### Adding New Components
1. Create component in `src/components/ui/`
2. Export from component file
3. Import where needed
4. Follow existing component patterns

## Security Checklist

- [x] JWT authentication implemented
- [x] Row Level Security enabled
- [x] Role-based access control active
- [x] Password requirements enforced
- [x] Session management implemented
- [x] Protected routes configured
- [x] Input validation on forms
- [x] Secure token storage

## Next Steps

After testing the basic functionality:

1. Customize dashboards for your use case
2. Implement actual candidate management features
3. Add real interview scheduling
4. Integrate email notifications
5. Add file upload functionality
6. Implement advanced search
7. Add real-time updates
8. Create admin tools
9. Build reporting features
10. Deploy to production

---

Happy building with RightPath!
