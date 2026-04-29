import { z } from "zod";

// ─── Shared primitives ───────────────────────────────────────────────────────
const uuid = z.string().uuid();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");
const isoDatetime = z.string().datetime({ offset: true });
const nonEmptyStr = z.string().min(1).max(2000);
const optStr = z.string().max(2000).optional().nullable();
const optUrl = z.string().url().optional().nullable();

// ─── People / Leaves ─────────────────────────────────────────────────────────
export const leavePostSchema = z.object({
  leave_type: z.enum(["sick", "vacation", "emergency"]),
  start_date: dateStr,
  end_date: dateStr,
  reason: optStr,
});

// Manager action: pre_approve (pending → pre_approved) or reject
// OPS action: approve (pre_approved → approved) or reject
// Employee action: cancel (own pending → cancelled)
export const leavePatchSchema = z.object({
  leave_id: uuid,
  action: z.enum(["pre_approve", "approve", "reject", "cancel", "rescind"]),
});

export const leaveCreditsSchema = z.object({
  // Single user OR bulk update — one of these must be present
  user_id:  uuid.optional(),
  user_ids: z.array(uuid).min(1).optional(),
  sick_total:      z.number().int().min(0).max(365).optional(),
  vacation_total:  z.number().int().min(0).max(365).optional(),
  emergency_total: z.number().int().min(0).max(365).optional(),
}).refine((d) => d.user_id || (d.user_ids && d.user_ids.length > 0), {
  message: "Either user_id or user_ids is required",
});

// ─── Users ───────────────────────────────────────────────────────────────────
export const userPostSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  first_name: nonEmptyStr,
  last_name: nonEmptyStr,
  department_id: uuid,
  role_id: uuid,
  birthday: dateStr.optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
});

export const userPatchSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  department_id: uuid.optional(),
  role_id: uuid.optional(),
  birthday: dateStr.optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  status: z.enum(["active", "inactive", "terminated"]).optional(),
});

// ─── Announcements ───────────────────────────────────────────────────────────
export const announcementPostSchema = z.object({
  title: nonEmptyStr,
  content: nonEmptyStr,
  priority: z.enum(["normal", "important", "urgent"]).optional().default("normal"),
  department_id: uuid.optional().nullable(),
  expires_at: isoDatetime.optional().nullable(),
});

// ─── Rooms & Bookings ────────────────────────────────────────────────────────
export const roomPostSchema = z.object({
  name: nonEmptyStr,
  capacity: z.number().int().min(1).max(500).optional().nullable(),
  location: optStr,
});

export const bookingPostSchema = z.object({
  room_id: uuid,
  title: nonEmptyStr,
  start_time: isoDatetime,
  end_time: isoDatetime,
  notes: optStr,
});

export const bookingPatchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  start_time: isoDatetime.optional(),
  end_time: isoDatetime.optional(),
  notes: optStr,
  status: z.enum(["active", "cancelled"]).optional(),
});

// ─── Kanban ───────────────────────────────────────────────────────────────────
export const kanbanCardPostSchema = z.object({
  column_id: uuid,
  title: nonEmptyStr,
  description: optStr,
  assigned_to: uuid.optional().nullable(),
  due_date: dateStr.optional().nullable(),
  priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
});

export const kanbanCardPatchSchema = z.object({
  id: uuid,
  column_id: uuid.optional(),
  title: z.string().min(1).max(500).optional(),
  description: optStr,
  assigned_to: uuid.optional().nullable(),
  due_date: dateStr.optional().nullable(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const kanbanColumnPostSchema = z.object({
  board_id: uuid,
  name: nonEmptyStr,
  sort_order: z.number().int().min(0).optional().default(99),
});

export const kanbanColumnPatchSchema = z.object({
  name: nonEmptyStr.optional(),
  sort_order: z.number().int().min(0).optional(),
  color: z.string().max(50).optional().nullable(),
});

// ─── Memos ───────────────────────────────────────────────────────────────────
export const memoPostSchema = z.object({
  title: nonEmptyStr,
  content: nonEmptyStr,
  department_id: uuid.optional().nullable(),
});

export const memoPatchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).max(50000).optional(),
});

// ─── Goals ───────────────────────────────────────────────────────────────────
export const goalPostSchema = z.object({
  title: nonEmptyStr,
  description: optStr,
  target_value: z.number(),
  current_value: z.number().optional().default(0),
  unit: z.string().max(50).optional().nullable(),
  deadline: dateStr,
  department_id: uuid.optional().nullable(),
  kpi_definition_id: uuid.optional().nullable(),
  deadline_green_days: z.number().int().min(1).optional().default(14),
  deadline_amber_days: z.number().int().min(1).optional().default(7),
});

export const goalPatchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: optStr,
  current_value: z.number().optional(),
  target_value: z.number().optional(),
  deadline: dateStr.optional(),
  status: z.enum(["active", "achieved", "cancelled"]).optional(),
  kpi_definition_id: z.string().uuid().optional().nullable(),
  deadline_green_days: z.number().int().min(1).optional(),
  deadline_amber_days: z.number().int().min(1).optional(),
});

// ─── KPI entries ─────────────────────────────────────────────────────────────
export const kpiEntryPostSchema = z.object({
  value_numeric: z.number(),
  period_date: dateStr,
  notes: optStr,
});

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationPatchSchema = z.object({
  id: uuid.optional(),
  mark_all: z.boolean().optional(),
});

// ─── Learning completions ─────────────────────────────────────────────────────
export const learningCompletePostSchema = z.object({
  material_id: uuid,
  completed: z.boolean(),
});

// ─── Sales: Volume ───────────────────────────────────────────────────────────
export const salesVolumePostSchema = z.object({
  agent_id: uuid,
  date: dateStr,
  follow_ups: z.number().int().min(0).optional().default(0),
  confirmed_total: z.number().int().min(0).optional().default(0),
  confirmed_abandoned: z.number().int().min(0).optional().default(0),
  buffer_approved: z.boolean().optional().default(false),
  buffer_reason: optStr,
  buffer_proof_link: optUrl,
  on_leave: z.boolean().optional().default(false),
  excluded_hours: z.number().min(0).max(24).optional().default(0),
  notes: optStr,
});

export const salesVolumeApprovalSchema = z.object({
  id: uuid,
  buffer_approved: z.boolean(),
});

// ─── Sales: Confirmed Sales ───────────────────────────────────────────────────
export const confirmedSalePostSchema = z.object({
  confirmed_date: dateStr,
  hour_range: optStr,
  duration_text: optStr,
  order_id: z.string().min(1).max(100),
  agent_id: uuid,
  sale_type: optStr,
  design: optStr,
  quantity: z.number().int().min(1).optional().default(1),
  net_value: z.number().min(0).optional().default(0),
  discount_offered: optStr,
  abandoned_cart: z.boolean().optional().default(false),
  ads_source: optStr,
  alex_assist: optStr,
  payment_mode: optStr,
  status: z.string().max(50).optional().default("confirmed"),
  notes: optStr,
  source: z.string().max(50).optional().default("manual"),
});

export const confirmedSalePatchSchema = z.object({
  confirmed_date: dateStr.optional(),
  order_id: z.string().min(1).max(100).optional(),
  quantity: z.number().int().min(1).optional(),
  net_value: z.number().min(0).optional(),
  status: z.string().max(50).optional(),
  abandoned_cart: z.boolean().optional(),
  notes: optStr,
  sale_type: optStr,
  design: optStr,
  discount_offered: optStr,
  ads_source: optStr,
  payment_mode: optStr,
});

// ─── Sales: QA ───────────────────────────────────────────────────────────────
export const salesQaPostSchema = z.object({
  agent_id: uuid,
  qa_date: dateStr,
  message_link: optUrl,
  qa_tier: z.string().min(1).max(50),
  qa_reason: optStr,
  evaluator: z.string().min(1).max(100),
  notes: optStr,
});

export const salesQaPatchSchema = z.object({
  qa_tier: z.string().min(1).max(50).optional(),
  qa_reason: optStr,
  evaluator: z.string().max(100).optional(),
  notes: optStr,
  message_link: optUrl,
});

// ─── Sales: Downtime ─────────────────────────────────────────────────────────
export const salesDowntimePostSchema = z.object({
  date: dateStr,
  agent_id: uuid.optional().nullable(),
  downtime_type: z.string().min(1).max(50),
  affected_tool: optStr,
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Must be HH:MM or HH:MM:SS"),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  duration_hours: z.number().min(0).max(24).optional().nullable(),
  ticket_ref: optStr,
  description: z.string().min(1).max(2000),
});

export const salesDowntimePatchSchema = z.object({
  verified: z.boolean().optional(),
  description: z.string().min(1).max(2000).optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  duration_hours: z.number().min(0).max(24).optional().nullable(),
  ticket_ref: optStr,
  notes: optStr,
});

// ─── Sales: Consistency ───────────────────────────────────────────────────────
export const salesConsistencyPostSchema = z.object({
  agent_id: uuid,
  month: z.string().regex(/^\d{4}-\d{2}$/, "Must be YYYY-MM"),
  ranges_hit: z.number().int().min(0).max(3),
  evaluator: z.string().min(1).max(100),
  notes: optStr,
});

export const salesConsistencyPatchSchema = z.object({
  ranges_hit: z.number().int().min(0).max(3).optional(),
  evaluator: z.string().min(1).max(100).optional(),
  notes: optStr,
});

// ─── Sales: Payouts ───────────────────────────────────────────────────────────
export const salesPayoutPostSchema = z.object({
  agent_id: uuid,
  month: z.string().regex(/^\d{4}-\d{2}$/, "Must be YYYY-MM"),
  paid_pairs: z.number().int().min(0).optional().default(0),
  abandoned_pairs: z.number().int().min(0).optional().default(0),
  onhand_pairs: z.number().int().min(0).optional().default(0),
  total_delivered: z.number().int().min(0).optional().default(0),
  notes: optStr,
});

export const salesPayoutPatchSchema = z.object({
  status: z.enum(["draft", "approved", "paid", "disputed"]).optional(),
  notes: optStr,
});

// ─── Ad Ops: Requests ────────────────────────────────────────────────────────
export const adRequestPostSchema = z.object({
  title: nonEmptyStr,
  brief: optStr,
  assignee_id: uuid.optional().nullable(),
  assignee_ids: z.array(uuid).optional(),
  target_date: dateStr.optional().nullable(),
  notes: optStr,
  inspo_link: optStr,
  additional_notes: optStr,
});

export const adRequestPatchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  brief: optStr,
  assignee_id: uuid.optional().nullable(),
  assignee_ids: z.array(uuid).optional(),
  target_date: dateStr.optional().nullable(),
  notes: optStr,
  inspo_link: optStr,
  additional_notes: optStr,
  deny_reason: optStr,
  status: z.enum(["draft", "submitted", "in_progress", "review", "approved", "rejected", "cancelled"]).optional(),
});

// ─── Ad Ops: Assets ──────────────────────────────────────────────────────────
export const adAssetPostSchema = z.object({
  request_id: uuid.optional().nullable(),
  title: nonEmptyStr,
  content_type: optStr,
  funnel_stage: z.enum(["TOF", "MOF", "BOF"]).optional().nullable(),
  ad_format: optStr,
  file_url: optUrl,
  thumbnail_url: optUrl,
  notes: optStr,
  status: z.enum(["draft", "pending_review", "approved", "needs_revision", "archived"]).optional().default("draft"),
});

export const adAssetPatchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content_type: optStr,
  funnel_stage: z.enum(["TOF", "MOF", "BOF"]).optional().nullable(),
  ad_format: optStr,
  file_url: optUrl,
  thumbnail_url: optUrl,
  notes: optStr,
  status: z.enum(["draft", "pending_review", "approved", "needs_revision", "archived"]).optional(),
});

// ─── Ad Ops: Deployments ─────────────────────────────────────────────────────
export const adDeploymentPostSchema = z.object({
  asset_id: uuid.optional().nullable(),
  meta_account_id: uuid.optional().nullable(),
  campaign_name: optStr,
  meta_campaign_id: optStr,
  meta_adset_id: optStr,
  meta_ad_id: optStr,
  budget_daily: z.number().min(0).optional().nullable(),
  budget_total: z.number().min(0).optional().nullable(),
  notes: optStr,
  status: z.enum(["draft", "active", "paused", "ended"]).optional().default("draft"),
});

export const adDeploymentPatchSchema = z.object({
  campaign_name: optStr,
  meta_campaign_id: optStr,
  meta_adset_id: optStr,
  meta_ad_id: optStr,
  budget_daily: z.number().min(0).optional().nullable(),
  budget_total: z.number().min(0).optional().nullable(),
  notes: optStr,
  status: z.enum(["draft", "active", "paused", "ended"]).optional(),
});

// ─── Ad Ops: Performance ─────────────────────────────────────────────────────
export const adPerformancePostSchema = z.object({
  deployment_id: uuid,
  metric_date: dateStr,
  impressions: z.number().int().min(0).optional().nullable(),
  clicks: z.number().int().min(0).optional().nullable(),
  spend: z.number().min(0).optional().nullable(),
  conversions: z.number().int().min(0).optional().nullable(),
  conversion_value: z.number().min(0).optional().nullable(),
  video_plays: z.number().int().min(0).optional().nullable(),
  video_plays_25pct: z.number().int().min(0).optional().nullable(),
});

// ─── Obs: Alerts ─────────────────────────────────────────────────────────────
export const obsAlertPostSchema = z.object({
  type: nonEmptyStr,
  severity: z.enum(["low", "medium", "high", "critical"]).optional().default("medium"),
  message: nonEmptyStr,
  source_table: optStr,
});
