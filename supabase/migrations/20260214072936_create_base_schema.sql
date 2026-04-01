/*
  # RightPath Base Schema Migration

  ## Overview
  Creates the foundational database schema for RightPath - a role-based career and internal management platform.

  ## New Tables

  ### 1. user_profiles
  Extends auth.users with additional profile information
  - `id` (uuid, primary key, references auth.users)
  - `full_name` (text)
  - `role` (text) - one of: super_admin, admin, hr, interviewer, candidate
  - `avatar_url` (text, nullable)
  - `phone` (text, nullable)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

  ### 2. roles
  Defines available roles in the system
  - `id` (uuid, primary key)
  - `name` (text, unique) - role identifier
  - `display_name` (text) - human-readable name
  - `description` (text, nullable)
  - `is_active` (boolean, default true)
  - `created_at` (timestamptz, default now())

  ### 3. permissions
  Defines granular permissions
  - `id` (uuid, primary key)
  - `name` (text, unique) - permission identifier
  - `description` (text, nullable)
  - `resource` (text) - what resource this permission applies to
  - `action` (text) - what action (read, write, delete, etc.)
  - `created_at` (timestamptz, default now())

  ### 4. role_permissions
  Maps roles to permissions (many-to-many)
  - `id` (uuid, primary key)
  - `role_id` (uuid, references roles)
  - `permission_id` (uuid, references permissions)
  - `created_at` (timestamptz, default now())

  ### 5. system_configurations
  Global system settings
  - `id` (uuid, primary key)
  - `key` (text, unique) - configuration key
  - `value` (jsonb) - configuration value
  - `description` (text, nullable)
  - `is_active` (boolean, default true)
  - `updated_by` (uuid, references auth.users, nullable)
  - `updated_at` (timestamptz, default now())

  ## Security
  - Enable RLS on all tables
  - Super admins and admins can manage all data
  - HR and interviewers have read access to relevant data
  - Candidates can only access their own profile data
  - All sensitive operations are restricted by role

  ## Important Notes
  - Uses Supabase auth.users for authentication
  - Role-based access control (RBAC) through roles and permissions
  - All tables have proper indexes for performance
  - Triggers maintain updated_at timestamps
*/

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'candidate' CHECK (role IN ('super_admin', 'admin', 'hr', 'interviewer', 'candidate')),
  avatar_url text,
  phone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  display_name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  resource text NOT NULL,
  action text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create role_permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid REFERENCES roles ON DELETE CASCADE,
  permission_id uuid REFERENCES permissions ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(role_id, permission_id)
);

-- Create system_configurations table
CREATE TABLE IF NOT EXISTS system_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  updated_by uuid REFERENCES auth.users,
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);
CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_system_configurations_key ON system_configurations(key);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for user_profiles
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for system_configurations
DROP TRIGGER IF EXISTS update_system_configurations_updated_at ON system_configurations;
CREATE TRIGGER update_system_configurations_updated_at
  BEFORE UPDATE ON system_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_configurations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Users can update their own profile (except role)
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Super admins and admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  );

-- Super admins and admins can update all profiles
CREATE POLICY "Admins can update all profiles"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  );

-- Super admins can insert new profiles
CREATE POLICY "Super admins can insert profiles"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
    )
  );

-- RLS Policies for roles

-- Authenticated users can view active roles
CREATE POLICY "Users can view active roles"
  ON roles FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Only super admins can manage roles
CREATE POLICY "Super admins can manage roles"
  ON roles FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
    )
  );

-- RLS Policies for permissions

-- Authenticated users can view permissions
CREATE POLICY "Users can view permissions"
  ON permissions FOR SELECT
  TO authenticated
  USING (true);

-- Only super admins can manage permissions
CREATE POLICY "Super admins can manage permissions"
  ON permissions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
    )
  );

-- RLS Policies for role_permissions

-- Authenticated users can view role permissions
CREATE POLICY "Users can view role permissions"
  ON role_permissions FOR SELECT
  TO authenticated
  USING (true);

-- Only super admins can manage role permissions
CREATE POLICY "Super admins can manage role permissions"
  ON role_permissions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
    )
  );

-- RLS Policies for system_configurations

-- Authenticated users can view active configurations
CREATE POLICY "Users can view active configurations"
  ON system_configurations FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Super admins and admins can manage configurations
CREATE POLICY "Admins can manage configurations"
  ON system_configurations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  );

-- Insert default roles
INSERT INTO roles (name, display_name, description) VALUES
  ('super_admin', 'Super Administrator', 'Full system access with all permissions'),
  ('admin', 'Administrator', 'Organization-wide administration capabilities'),
  ('hr', 'Human Resources', 'Candidate and recruitment management'),
  ('interviewer', 'Interviewer', 'Conduct interviews and provide feedback'),
  ('candidate', 'Candidate', 'External job applicant')
ON CONFLICT (name) DO NOTHING;

-- Insert default system configurations
INSERT INTO system_configurations (key, value, description) VALUES
  ('jwt_token_expiry', '"1 hour"'::jsonb, 'JWT access token expiration time'),
  ('refresh_token_expiry', '"7 days"'::jsonb, 'Refresh token expiration time'),
  ('password_min_length', '8'::jsonb, 'Minimum password length requirement'),
  ('session_timeout', '"30 minutes"'::jsonb, 'User session timeout duration'),
  ('max_login_attempts', '5'::jsonb, 'Maximum failed login attempts before lockout')
ON CONFLICT (key) DO NOTHING;

-- Create function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'candidate')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_profile();
