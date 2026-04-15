// ============================================================
// Core identity types — matches migration 00001_foundation.sql
// ============================================================

export type Department = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Role = {
  id: string;
  name: string;
  slug: string;
  tier: number; // 0=super_admin, 1=ops_admin, 2=manager, 3=contributor, 4=viewer, 5=auditor
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type UserPreferences = {
  theme?: "light" | "dark" | "system";
  accent?: "blue" | "violet" | "teal" | "rose" | "amber" | "emerald" | "orange" | "indigo";
  density?: "comfortable" | "compact";
};

export type Profile = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  phone: string | null;
  birthday: string | null;
  department_id: string | null;
  role_id: string | null;
  status: "active" | "inactive" | "suspended" | "pending";
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  user_preferences: UserPreferences;
};

export type ProfileWithRelations = Profile & {
  department: Department;
  role: Role;
};

export type Permission = {
  id: string;
  action: string;
  resource: string;
  description: string | null;
  created_at: string;
};

export type RolePermission = {
  role_id: string;
  permission_id: string;
  created_at: string;
};

export type UserPermissionOverride = {
  id: string;
  user_id: string;
  permission_id: string;
  granted: boolean;
  created_at: string;
  created_by: string | null;
};

export type FeatureFlag = {
  id: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

// ============================================================
// People — Leaves & Notifications
// ============================================================

export type Leave = {
  id: string;
  user_id: string;
  leave_type: "vacation" | "sick" | "personal" | "other";
  start_date: string;
  end_date: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type LeaveWithProfile = Leave & {
  profile: Pick<Profile, "id" | "first_name" | "last_name" | "department_id"> & {
    department: Pick<Department, "id" | "name"> | null;
  };
  reviewer: Pick<Profile, "first_name" | "last_name"> | null;
};

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
};

// ============================================================
// Observability types
// ============================================================

export type ObsAppEvent = {
  id: string;
  event_name: string;
  category: "product" | "audit" | "error" | "performance";
  actor_id: string | null;
  actor_role: string | null;
  department_id: string | null;
  module: string | null;
  properties: Record<string, unknown>;
  success: boolean;
  created_at: string;
};

export type ObsAuditLog = {
  id: string;
  actor_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
};

export type ObsErrorLog = {
  id: string;
  error_type: string;
  message: string;
  stack_trace: string | null;
  module: string | null;
  severity: "low" | "medium" | "high" | "critical";
  actor_id: string | null;
  request_path: string | null;
  request_method: string | null;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
};

export type ObsAlert = {
  id: string;
  type: string;
  severity: "info" | "warning" | "error" | "critical";
  message: string;
  source_table: string | null;
  source_id: string | null;
  acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
};
