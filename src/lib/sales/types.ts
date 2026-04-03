export type SalesAgent = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
};

export type DailyVolume = {
  id: string;
  agent_id: string;
  date: string;
  follow_ups: number;
  confirmed_total: number;
  confirmed_abandoned: number;
  confirmed_regular: number;
  buffer_approved: boolean;
  buffer_reason: string | null;
  buffer_proof_link: string | null;
  buffer_approved_by: string | null;
  buffer_approved_at: string | null;
  on_leave: boolean;
  excluded_hours: number;
  notes: string | null;
  source: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  agent?: SalesAgent;
};

export type QaLog = {
  id: string;
  agent_id: string;
  qa_date: string;
  message_link: string;
  qa_tier: "Tier 3" | "Tier 2" | "Tier 1" | "Fail";
  qa_points: number;
  qa_fail: boolean;
  qa_reason: string;
  evaluator: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  agent?: SalesAgent;
};

export type DowntimeLog = {
  id: string;
  date: string;
  agent_id: string | null;
  downtime_type: "system" | "internet" | "power" | "tool" | "other";
  affected_tool: string | null;
  start_time: string;
  end_time: string | null;
  duration_hours: number | null;
  ticket_ref: string | null;
  description: string;
  verified: boolean;
  verified_by: string | null;
  created_at: string;
};

export type ConfirmedSale = {
  id: string;
  confirmed_date: string;
  hour_range: string | null;
  duration_text: string | null;
  order_id: string;
  agent_id: string;
  sale_type: string | null;
  design: string | null;
  quantity: number;
  net_value: number;
  discount_offered: string | null;
  abandoned_cart: boolean;
  ads_source: string | null;
  alex_assist: string | null;
  payment_mode: string | null;
  status: string;
  notes: string | null;
  source: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  agent?: SalesAgent;
};

export type Consistency = {
  id: string;
  agent_id: string;
  month: string;
  ranges_hit: number;
  consistency_score: number;
  evaluator: string | null;
  notes: string | null;
  agent?: SalesAgent;
};

export type IncentivePayout = {
  id: string;
  agent_id: string;
  month: string;
  gate_passed: boolean;
  mtd_confirmed_regular: number;
  gate_threshold: number;
  avg_fps: number | null;
  scored_days: number;
  consistency_score: number;
  final_fps: number | null;
  main_tier_payout: number;
  abandoned_payout: number;
  onhand_payout: number;
  total_payout: number;
  payout_tier: string | null;
  status: "draft" | "approved" | "paid" | "disputed";
  notes: string | null;
  agent?: SalesAgent;
};

export type DailyFpsRow = {
  agentId: string;
  date: string;
  dayStatus: "SCORED" | "LEAVE" | "NO DATA" | "QA CAPPED";
  volPts: number | null;
  qaPts: number | null;
  qaFail: boolean;
  qaMissing: boolean;
  qaTier: string | null;
  baseFps: number | null;
  finalFps: number | null;
  isLeave: boolean;
  isNoData: boolean;
  capApplied: boolean;
};
