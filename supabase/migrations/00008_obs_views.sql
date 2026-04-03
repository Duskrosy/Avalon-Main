-- ============================================================
-- 00008_obs_views.sql
-- Avalon Rebuild — Phase 8: Observability Views & Alert Functions
-- ============================================================


-- ==========================
-- VIEWS (query-time, no refresh needed)
-- ==========================

-- Daily active users (last 30 days)
CREATE OR REPLACE VIEW public.obs_v_daily_active_users AS
SELECT
  date_trunc('day', created_at AT TIME ZONE 'UTC') AS day,
  COUNT(DISTINCT actor_id) AS unique_users,
  COUNT(*) AS total_events
FROM public.obs_app_events
WHERE created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;

-- Event frequency by module (last 30 days)
CREATE OR REPLACE VIEW public.obs_v_module_usage AS
SELECT
  module,
  category,
  COUNT(*) AS event_count,
  COUNT(DISTINCT actor_id) AS unique_users,
  MAX(created_at) AS last_seen
FROM public.obs_app_events
WHERE created_at >= now() - interval '30 days'
  AND module IS NOT NULL
GROUP BY module, category
ORDER BY event_count DESC;

-- Event frequency by name (last 7 days)
CREATE OR REPLACE VIEW public.obs_v_recent_events AS
SELECT
  event_name,
  module,
  category,
  COUNT(*) AS event_count,
  COUNT(DISTINCT actor_id) AS unique_users,
  MAX(created_at) AS last_seen
FROM public.obs_app_events
WHERE created_at >= now() - interval '7 days'
GROUP BY event_name, module, category
ORDER BY event_count DESC;

-- Unresolved errors summary
CREATE OR REPLACE VIEW public.obs_v_error_summary AS
SELECT
  severity,
  module,
  COUNT(*) AS error_count,
  MAX(created_at) AS latest_at
FROM public.obs_error_logs
WHERE resolved = false
GROUP BY severity, module
ORDER BY
  CASE severity
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    ELSE 4
  END,
  error_count DESC;

-- Audit log enriched (last 500 rows, for admin dashboard)
CREATE OR REPLACE VIEW public.obs_v_audit_recent AS
SELECT
  al.id,
  al.action,
  al.table_name,
  al.record_id,
  al.old_values,
  al.new_values,
  al.created_at,
  p.first_name || ' ' || p.last_name AS actor_name,
  p.email AS actor_email,
  al.actor_id
FROM public.obs_audit_logs al
LEFT JOIN public.profiles p ON p.id = al.actor_id
ORDER BY al.created_at DESC
LIMIT 500;

-- Job run history (last 200)
CREATE OR REPLACE VIEW public.obs_v_job_history AS
SELECT
  job_name,
  status,
  started_at,
  completed_at,
  duration_ms,
  records_processed,
  error_message,
  created_at
FROM public.obs_job_runs
ORDER BY created_at DESC
LIMIT 200;


-- ==========================
-- ALERT FUNCTIONS
-- ==========================

-- Raise an alert (idempotent — skips if identical unacknowledged alert < 1h old)
CREATE OR REPLACE FUNCTION public.raise_alert(
  p_type     text,
  p_severity public.alert_severity,
  p_message  text,
  p_source_table text DEFAULT NULL,
  p_source_id    uuid  DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Deduplicate: skip if same type+message already open within the last hour
  IF EXISTS (
    SELECT 1 FROM public.obs_alerts
    WHERE type = p_type
      AND message = p_message
      AND acknowledged = false
      AND created_at > now() - interval '1 hour'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.obs_alerts (type, severity, message, source_table, source_id)
  VALUES (p_type, p_severity, p_message, p_source_table, p_source_id);
END;
$$;

-- Auto-alert trigger: critical errors generate an alert
CREATE OR REPLACE FUNCTION public.obs_error_alert_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.severity IN ('critical', 'high') THEN
    PERFORM public.raise_alert(
      'error_logged',
      NEW.severity::public.alert_severity,
      format('[%s] %s — %s', upper(NEW.severity::text), NEW.module, NEW.message),
      'obs_error_logs',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_obs_error_alert
  AFTER INSERT ON public.obs_error_logs
  FOR EACH ROW EXECUTE FUNCTION public.obs_error_alert_trigger();


-- ==========================
-- RLS on views (views inherit table RLS, but explicit grants for safety)
-- ==========================
GRANT SELECT ON public.obs_v_daily_active_users TO authenticated;
GRANT SELECT ON public.obs_v_module_usage        TO authenticated;
GRANT SELECT ON public.obs_v_recent_events       TO authenticated;
GRANT SELECT ON public.obs_v_error_summary       TO authenticated;
GRANT SELECT ON public.obs_v_audit_recent        TO authenticated;
GRANT SELECT ON public.obs_v_job_history         TO authenticated;
