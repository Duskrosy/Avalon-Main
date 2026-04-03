-- ============================================================
-- 00001_foundation.sql
-- Avalon Supabase Rebuild -- Phase 1: Foundation
-- Extensions, utilities, ENUMs, core identity, data sources,
-- observability, RLS helpers, RLS policies, seed data
-- ============================================================

-- ==========================
-- EXTENSIONS
-- ==========================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ==========================
-- UTILITY FUNCTIONS
-- ==========================

-- Automatically set updated_at on every UPDATE
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generic audit-log trigger: captures INSERT / UPDATE / DELETE
-- Writes to obs_audit_logs (append-only)
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS TRIGGER AS $$
DECLARE
  _actor_id uuid;
  _old      jsonb;
  _new      jsonb;
  _action   text;
BEGIN
  _actor_id := auth.uid();

  IF TG_OP = 'DELETE' THEN
    _old    := to_jsonb(OLD);
    _new    := NULL;
    _action := 'DELETE';
  ELSIF TG_OP = 'UPDATE' THEN
    _old    := to_jsonb(OLD);
    _new    := to_jsonb(NEW);
    _action := 'UPDATE';
  ELSIF TG_OP = 'INSERT' THEN
    _old    := NULL;
    _new    := to_jsonb(NEW);
    _action := 'INSERT';
  END IF;

  INSERT INTO public.obs_audit_logs (
    actor_id, action, table_name, record_id,
    old_values, new_values
  ) VALUES (
    _actor_id, _action, TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    _old, _new
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==========================
-- ENUM TYPES -- Group 1: Core Identity & Access
-- ==========================
CREATE TYPE public.user_status       AS ENUM ('active', 'inactive', 'suspended', 'pending');
CREATE TYPE public.role_type         AS ENUM ('ops', 'manager', 'staff');
CREATE TYPE public.permission_action AS ENUM (
  'create', 'read', 'update', 'delete',
  'approve', 'export', 'import', 'manage_users',
  'manage_roles', 'manage_permissions', 'view_analytics',
  'view_all_departments', 'manage_settings'
);

-- ==========================
-- ENUM TYPES -- Group 3: Data Source & Ingestion
-- ==========================
CREATE TYPE public.data_source_type       AS ENUM ('manual', 'csv_import', 'api_sync', 'webhook');
CREATE TYPE public.sync_run_status        AS ENUM ('pending', 'running', 'completed', 'failed');
CREATE TYPE public.import_batch_status    AS ENUM ('uploading', 'validating', 'validated', 'importing', 'completed', 'failed');
CREATE TYPE public.import_row_status      AS ENUM ('pending', 'valid', 'invalid', 'skipped');
CREATE TYPE public.correction_status      AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.validation_issue_type  AS ENUM ('error', 'warning', 'info');
CREATE TYPE public.validation_severity    AS ENUM ('low', 'medium', 'high', 'critical');

-- ==========================
-- ENUM TYPES -- Group 9: Observability
-- ==========================
CREATE TYPE public.event_category  AS ENUM ('product', 'audit', 'error', 'performance');
CREATE TYPE public.error_severity  AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE public.job_status      AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE public.alert_severity  AS ENUM ('info', 'warning', 'error', 'critical');


-- ============================================================
-- CORE IDENTITY TABLES
-- ============================================================

-- Departments
CREATE TABLE public.departments (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_departments_slug      ON public.departments (slug);
CREATE INDEX idx_departments_is_active ON public.departments (is_active);

CREATE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Roles (tier 0-5: super_admin=0, ops_admin=1, manager=2, contributor=3, viewer=4, auditor=5)
CREATE TABLE public.roles (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  tier        smallint NOT NULL CHECK (tier BETWEEN 0 AND 5),
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_roles_slug ON public.roles (slug);
CREATE INDEX idx_roles_tier ON public.roles (tier);

CREATE TRIGGER trg_roles_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Profiles (extends auth.users)
CREATE TABLE public.profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text NOT NULL UNIQUE,
  first_name    text NOT NULL,
  last_name     text NOT NULL,
  avatar_url    text,
  phone         text,
  birthday      date,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  role_id       uuid REFERENCES public.roles(id) ON DELETE SET NULL,
  status        public.user_status NOT NULL DEFAULT 'pending',
  deleted_at    timestamptz,
  deleted_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id),
  updated_by    uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_profiles_email         ON public.profiles (email);
CREATE INDEX idx_profiles_department_id ON public.profiles (department_id);
CREATE INDEX idx_profiles_role_id       ON public.profiles (role_id);
CREATE INDEX idx_profiles_status        ON public.profiles (status);
CREATE INDEX idx_profiles_active        ON public.profiles (id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Permissions
CREATE TABLE public.permissions (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  action      public.permission_action NOT NULL,
  resource    text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (action, resource)
);

CREATE INDEX idx_permissions_action   ON public.permissions (action);
CREATE INDEX idx_permissions_resource ON public.permissions (resource);

-- Role-Permission junction
CREATE TABLE public.role_permissions (
  role_id       uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX idx_role_permissions_permission_id ON public.role_permissions (permission_id);

-- User-level permission overrides
CREATE TABLE public.user_permission_overrides (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  granted       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id),
  UNIQUE (user_id, permission_id)
);

CREATE INDEX idx_upo_user_id       ON public.user_permission_overrides (user_id);
CREATE INDEX idx_upo_permission_id ON public.user_permission_overrides (permission_id);


-- ============================================================
-- DATA SOURCE TABLES
-- ============================================================

CREATE TABLE public.data_sources (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  type          public.data_source_type NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  config_json   jsonb DEFAULT '{}'::jsonb,
  is_active     boolean NOT NULL DEFAULT true,
  last_sync_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_data_sources_slug          ON public.data_sources (slug);
CREATE INDEX idx_data_sources_type          ON public.data_sources (type);
CREATE INDEX idx_data_sources_department_id ON public.data_sources (department_id);

CREATE TRIGGER trg_data_sources_updated_at
  BEFORE UPDATE ON public.data_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.data_source_configs (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id     uuid NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  config_key    text NOT NULL,
  config_value  jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_secret     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, config_key)
);

CREATE INDEX idx_dsc_source_id ON public.data_source_configs (source_id);

CREATE TRIGGER trg_dsc_updated_at
  BEFORE UPDATE ON public.data_source_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.validation_rules (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id     uuid NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  field_name    text NOT NULL,
  rule_type     text NOT NULL, -- 'required','regex','range','enum','unique','custom'
  rule_config   jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_validation_rules_source_id ON public.validation_rules (source_id);

CREATE TRIGGER trg_validation_rules_updated_at
  BEFORE UPDATE ON public.validation_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- OBSERVABILITY TABLES
-- ============================================================

-- Application events (product analytics, performance, etc.)
CREATE TABLE public.obs_app_events (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_name    text NOT NULL,
  category      public.event_category NOT NULL,
  actor_id      uuid REFERENCES auth.users(id),
  actor_role    text,
  department_id uuid,
  module        text,
  properties    jsonb DEFAULT '{}'::jsonb,
  success       boolean DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_oae_event_name       ON public.obs_app_events (event_name);
CREATE INDEX idx_oae_category         ON public.obs_app_events (category);
CREATE INDEX idx_oae_actor_id         ON public.obs_app_events (actor_id);
CREATE INDEX idx_oae_module           ON public.obs_app_events (module);
CREATE INDEX idx_oae_created_at       ON public.obs_app_events (created_at);
CREATE INDEX idx_oae_category_created ON public.obs_app_events (category, created_at DESC);

-- Audit logs (APPEND-ONLY -- no UPDATE or DELETE grants to any role)
CREATE TABLE public.obs_audit_logs (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id    uuid REFERENCES auth.users(id),
  action      text NOT NULL,
  table_name  text NOT NULL,
  record_id   uuid,
  old_values  jsonb,
  new_values  jsonb,
  ip_address  inet,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_oal_actor_id     ON public.obs_audit_logs (actor_id);
CREATE INDEX idx_oal_table_name   ON public.obs_audit_logs (table_name);
CREATE INDEX idx_oal_record_id    ON public.obs_audit_logs (record_id);
CREATE INDEX idx_oal_created_at   ON public.obs_audit_logs (created_at);
CREATE INDEX idx_oal_action       ON public.obs_audit_logs (action);
CREATE INDEX idx_oal_table_record ON public.obs_audit_logs (table_name, record_id);

-- Error logs
CREATE TABLE public.obs_error_logs (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  error_type     text NOT NULL,
  message        text NOT NULL,
  stack_trace    text,
  module         text,
  severity       public.error_severity NOT NULL DEFAULT 'medium',
  actor_id       uuid REFERENCES auth.users(id),
  request_path   text,
  request_method text,
  resolved       boolean NOT NULL DEFAULT false,
  resolved_at    timestamptz,
  resolved_by    uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_oel_severity   ON public.obs_error_logs (severity);
CREATE INDEX idx_oel_module     ON public.obs_error_logs (module);
CREATE INDEX idx_oel_resolved   ON public.obs_error_logs (resolved);
CREATE INDEX idx_oel_created_at ON public.obs_error_logs (created_at);

-- Job runs
CREATE TABLE public.obs_job_runs (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_name          text NOT NULL,
  status            public.job_status NOT NULL DEFAULT 'pending',
  started_at        timestamptz,
  completed_at      timestamptz,
  duration_ms       integer,
  records_processed integer DEFAULT 0,
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ojr_job_name   ON public.obs_job_runs (job_name);
CREATE INDEX idx_ojr_status     ON public.obs_job_runs (status);
CREATE INDEX idx_ojr_created_at ON public.obs_job_runs (created_at);

-- Alerts
CREATE TABLE public.obs_alerts (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type            text NOT NULL,
  severity        public.alert_severity NOT NULL DEFAULT 'info',
  message         text NOT NULL,
  source_table    text,
  source_id       uuid,
  acknowledged    boolean NOT NULL DEFAULT false,
  acknowledged_by uuid REFERENCES auth.users(id),
  acknowledged_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_oa_severity       ON public.obs_alerts (severity);
CREATE INDEX idx_oa_acknowledged   ON public.obs_alerts (acknowledged);
CREATE INDEX idx_oa_type           ON public.obs_alerts (type);
CREATE INDEX idx_oa_created_at     ON public.obs_alerts (created_at);

-- Feature flags
CREATE TABLE public.feature_flags (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text NOT NULL UNIQUE,
  description text,
  is_enabled  boolean NOT NULL DEFAULT false,
  config      jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ff_name       ON public.feature_flags (name);
CREATE INDEX idx_ff_is_enabled ON public.feature_flags (is_enabled);

CREATE TRIGGER trg_ff_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- AUDIT TRIGGER on profiles
-- ============================================================
CREATE TRIGGER trg_audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ============================================================
-- RLS HELPER FUNCTIONS
-- ============================================================

-- Current user's role tier (0=super_admin ... 5=auditor)
CREATE OR REPLACE FUNCTION public.get_my_tier()
RETURNS smallint AS $$
  SELECT r.tier
  FROM public.profiles p
  JOIN public.roles r ON r.id = p.role_id
  WHERE p.id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Current user's department_id
CREATE OR REPLACE FUNCTION public.get_my_department_id()
RETURNS uuid AS $$
  SELECT department_id
  FROM public.profiles
  WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Is current user OPS? (tier <= 1)
CREATE OR REPLACE FUNCTION public.is_ops()
RETURNS boolean AS $$
  SELECT COALESCE(public.get_my_tier() <= 1, false)
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Is current user Manager or above? (tier <= 2)
CREATE OR REPLACE FUNCTION public.is_manager_or_above()
RETURNS boolean AS $$
  SELECT COALESCE(public.get_my_tier() <= 2, false)
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Does the current user have a specific role slug?
CREATE OR REPLACE FUNCTION public.has_role(_slug text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id
    WHERE p.id = auth.uid()
      AND r.slug = _slug
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Does the current user have a specific permission (action + resource)?
CREATE OR REPLACE FUNCTION public.has_permission(_action public.permission_action, _resource text)
RETURNS boolean AS $$
  SELECT EXISTS (
    -- Check explicit user override (granted = true)
    SELECT 1
    FROM public.user_permission_overrides upo
    JOIN public.permissions perm ON perm.id = upo.permission_id
    WHERE upo.user_id = auth.uid()
      AND perm.action = _action
      AND perm.resource = _resource
      AND upo.granted = true
  )
  OR (
    -- Check role-level permission (and no explicit deny override)
    EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.role_permissions rp ON rp.role_id = p.role_id
      JOIN public.permissions perm ON perm.id = rp.permission_id
      WHERE p.id = auth.uid()
        AND perm.action = _action
        AND perm.resource = _resource
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_permission_overrides upo
      JOIN public.permissions perm ON perm.id = upo.permission_id
      WHERE upo.user_id = auth.uid()
        AND perm.action = _action
        AND perm.resource = _resource
        AND upo.granted = false
    )
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ============================================================
-- ENABLE RLS (default deny) on all Phase 1 tables
-- ============================================================
ALTER TABLE public.departments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments                FORCE ROW LEVEL SECURITY;

ALTER TABLE public.roles                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles                      FORCE ROW LEVEL SECURITY;

ALTER TABLE public.profiles                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                   FORCE ROW LEVEL SECURITY;

ALTER TABLE public.permissions                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions                FORCE ROW LEVEL SECURITY;

ALTER TABLE public.role_permissions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions           FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_permission_overrides  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permission_overrides  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.data_sources               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_sources               FORCE ROW LEVEL SECURITY;

ALTER TABLE public.data_source_configs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_source_configs        FORCE ROW LEVEL SECURITY;

ALTER TABLE public.validation_rules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_rules           FORCE ROW LEVEL SECURITY;

ALTER TABLE public.obs_app_events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obs_app_events             FORCE ROW LEVEL SECURITY;

ALTER TABLE public.obs_audit_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obs_audit_logs             FORCE ROW LEVEL SECURITY;

ALTER TABLE public.obs_error_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obs_error_logs             FORCE ROW LEVEL SECURITY;

ALTER TABLE public.obs_job_runs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obs_job_runs               FORCE ROW LEVEL SECURITY;

ALTER TABLE public.obs_alerts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obs_alerts                 FORCE ROW LEVEL SECURITY;

ALTER TABLE public.feature_flags              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags              FORCE ROW LEVEL SECURITY;


-- ============================================================
-- RLS POLICIES -- Phase 1 tables
-- ============================================================

-- PROFILES: own row always; same-department if manager+; all if OPS
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (
  id = auth.uid()
  OR (public.is_manager_or_above() AND department_id = public.get_my_department_id())
  OR public.is_ops()
);
CREATE POLICY profiles_insert ON public.profiles FOR INSERT WITH CHECK (public.is_ops());
CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING (
  id = auth.uid() OR public.is_ops()
);
CREATE POLICY profiles_delete ON public.profiles FOR DELETE USING (public.is_ops());

-- DEPARTMENTS: read all (reference data), write OPS only
CREATE POLICY departments_select ON public.departments FOR SELECT USING (true);
CREATE POLICY departments_insert ON public.departments FOR INSERT WITH CHECK (public.is_ops());
CREATE POLICY departments_update ON public.departments FOR UPDATE USING (public.is_ops());
CREATE POLICY departments_delete ON public.departments FOR DELETE USING (public.is_ops());

-- ROLES: read all, write OPS only
CREATE POLICY roles_select ON public.roles FOR SELECT USING (true);
CREATE POLICY roles_insert ON public.roles FOR INSERT WITH CHECK (public.is_ops());
CREATE POLICY roles_update ON public.roles FOR UPDATE USING (public.is_ops());
CREATE POLICY roles_delete ON public.roles FOR DELETE USING (public.is_ops());

-- PERMISSIONS: read all, write OPS only
CREATE POLICY permissions_select ON public.permissions FOR SELECT USING (true);
CREATE POLICY permissions_insert ON public.permissions FOR INSERT WITH CHECK (public.is_ops());
CREATE POLICY permissions_delete ON public.permissions FOR DELETE USING (public.is_ops());

-- ROLE_PERMISSIONS: read all, write OPS only
CREATE POLICY role_permissions_select ON public.role_permissions FOR SELECT USING (true);
CREATE POLICY role_permissions_insert ON public.role_permissions FOR INSERT WITH CHECK (public.is_ops());
CREATE POLICY role_permissions_delete ON public.role_permissions FOR DELETE USING (public.is_ops());

-- USER_PERMISSION_OVERRIDES: own row or OPS
CREATE POLICY upo_select ON public.user_permission_overrides FOR SELECT USING (
  user_id = auth.uid() OR public.is_ops()
);
CREATE POLICY upo_insert ON public.user_permission_overrides FOR INSERT WITH CHECK (public.is_ops());
CREATE POLICY upo_update ON public.user_permission_overrides FOR UPDATE USING (public.is_ops());
CREATE POLICY upo_delete ON public.user_permission_overrides FOR DELETE USING (public.is_ops());

-- DATA SOURCES: read by department or OPS, write OPS only
CREATE POLICY data_sources_select ON public.data_sources FOR SELECT USING (
  department_id = public.get_my_department_id() OR public.is_ops()
);
CREATE POLICY data_sources_insert ON public.data_sources FOR INSERT WITH CHECK (public.is_ops());
CREATE POLICY data_sources_update ON public.data_sources FOR UPDATE USING (public.is_ops());
CREATE POLICY data_sources_delete ON public.data_sources FOR DELETE USING (public.is_ops());

-- DATA SOURCE CONFIGS: same as data_sources
CREATE POLICY dsc_select ON public.data_source_configs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.data_sources ds
    WHERE ds.id = source_id
    AND (ds.department_id = public.get_my_department_id() OR public.is_ops())
  )
);
CREATE POLICY dsc_insert ON public.data_source_configs FOR INSERT WITH CHECK (public.is_ops());
CREATE POLICY dsc_update ON public.data_source_configs FOR UPDATE USING (public.is_ops());
CREATE POLICY dsc_delete ON public.data_source_configs FOR DELETE USING (public.is_ops());

-- VALIDATION RULES: read all, write OPS only
CREATE POLICY validation_rules_select ON public.validation_rules FOR SELECT USING (true);
CREATE POLICY validation_rules_insert ON public.validation_rules FOR INSERT WITH CHECK (public.is_ops());
CREATE POLICY validation_rules_update ON public.validation_rules FOR UPDATE USING (public.is_ops());
CREATE POLICY validation_rules_delete ON public.validation_rules FOR DELETE USING (public.is_ops());

-- OBS_APP_EVENTS: insert all, read manager+
CREATE POLICY oae_insert ON public.obs_app_events FOR INSERT WITH CHECK (true);
CREATE POLICY oae_select ON public.obs_app_events FOR SELECT USING (public.is_manager_or_above());

-- OBS_AUDIT_LOGS: APPEND-ONLY -- read OPS only, insert via SECURITY DEFINER trigger only
CREATE POLICY oal_select ON public.obs_audit_logs FOR SELECT USING (public.is_ops());
CREATE POLICY oal_insert ON public.obs_audit_logs FOR INSERT WITH CHECK (false);
-- No UPDATE or DELETE policies -- table is append-only

-- OBS_ERROR_LOGS: insert all, read/update OPS
CREATE POLICY oel_select ON public.obs_error_logs FOR SELECT USING (public.is_ops());
CREATE POLICY oel_insert ON public.obs_error_logs FOR INSERT WITH CHECK (true);
CREATE POLICY oel_update ON public.obs_error_logs FOR UPDATE USING (public.is_ops());

-- OBS_JOB_RUNS: read manager+, write OPS
CREATE POLICY ojr_select ON public.obs_job_runs FOR SELECT USING (public.is_manager_or_above());
CREATE POLICY ojr_insert ON public.obs_job_runs FOR INSERT WITH CHECK (public.is_ops());
CREATE POLICY ojr_update ON public.obs_job_runs FOR UPDATE USING (public.is_ops());

-- OBS_ALERTS: read manager+, write OPS, acknowledge manager+
CREATE POLICY oa_select      ON public.obs_alerts FOR SELECT USING (public.is_manager_or_above());
CREATE POLICY oa_insert      ON public.obs_alerts FOR INSERT WITH CHECK (public.is_ops());
CREATE POLICY oa_acknowledge ON public.obs_alerts FOR UPDATE USING (public.is_manager_or_above());

-- FEATURE FLAGS: read all, write OPS
CREATE POLICY ff_select ON public.feature_flags FOR SELECT USING (true);
CREATE POLICY ff_insert ON public.feature_flags FOR INSERT WITH CHECK (public.is_ops());
CREATE POLICY ff_update ON public.feature_flags FOR UPDATE USING (public.is_ops());
CREATE POLICY ff_delete ON public.feature_flags FOR DELETE USING (public.is_ops());


-- ============================================================
-- REVOKE UPDATE/DELETE on append-only tables
-- ============================================================
REVOKE UPDATE, DELETE ON public.obs_audit_logs FROM public, anon, authenticated;


-- ============================================================
-- SEED DATA
-- ============================================================

-- Default roles (6-tier system)
INSERT INTO public.roles (name, slug, tier, description) VALUES
  ('Super Admin',  'super_admin', 0, 'Unrestricted platform access'),
  ('OPS Admin',    'ops_admin',   1, 'Full operational access'),
  ('Manager',      'manager',     2, 'Department manager with elevated access'),
  ('Contributor',  'contributor', 3, 'Standard employee -- can create and edit own data'),
  ('Viewer',       'viewer',      4, 'Read-only access to permitted resources'),
  ('Auditor',      'auditor',     5, 'Read-only access for compliance review');

-- Default departments
INSERT INTO public.departments (name, slug, description) VALUES
  ('Operations',      'ops',    'Operations and administration'),
  ('Sales',           'sales',  'Sales department'),
  ('Ad Operations',   'ad-ops', 'Advertising operations'),
  ('Human Resources', 'hr',     'Human resources department');

-- Default permissions (22 records)
INSERT INTO public.permissions (action, resource, description) VALUES
  ('create',                'profiles',             'Create user profiles'),
  ('read',                  'profiles',             'View user profiles'),
  ('update',                'profiles',             'Edit user profiles'),
  ('delete',                'profiles',             'Remove user profiles'),
  ('manage_users',          'profiles',             'Full user management'),
  ('manage_roles',          'roles',                'Manage role definitions'),
  ('manage_permissions',    'permissions',          'Manage permission assignments'),
  ('create',                'sales_daily_volume',   'Create sales volume entries'),
  ('read',                  'sales_daily_volume',   'View sales volume data'),
  ('update',                'sales_daily_volume',   'Edit sales volume entries'),
  ('approve',               'sales_daily_volume',   'Approve sales volume submissions'),
  ('create',                'ad_requests',          'Create ad requests'),
  ('read',                  'ad_requests',          'View ad requests'),
  ('update',                'ad_requests',          'Edit ad requests'),
  ('approve',               'ad_requests',          'Approve ad requests'),
  ('import',                'data_sources',         'Import data from sources'),
  ('export',                'data_sources',         'Export data from sources'),
  ('view_analytics',        'dashboards',           'View analytics dashboards'),
  ('view_all_departments',  'departments',          'View cross-department data'),
  ('manage_settings',       'feature_flags',        'Manage application settings'),
  ('read',                  'obs_audit_logs',       'View audit trail'),
  ('read',                  'obs_error_logs',       'View error logs');

-- Default feature flags
INSERT INTO public.feature_flags (name, description, is_enabled) VALUES
  ('sales_module',          'Enable sales operations module',              true),
  ('ad_ops_module',         'Enable ad operations module',                 true),
  ('hr_module',             'Enable HR module',                            true),
  ('productivity_module',   'Enable productivity module',                  false),
  ('advanced_analytics',    'Enable advanced analytics features',          false),
  ('csv_import',            'Enable CSV import functionality',             true),
  ('meta_sync',             'Enable Meta API synchronization',             false),
  ('correction_requests',   'Enable data correction request workflow',     true);
