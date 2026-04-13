-- Goal enhancements: KPI linking + configurable deadline RAG thresholds

-- Link goals to KPI definitions for auto-tracking
ALTER TABLE public.goals
  ADD COLUMN kpi_definition_id uuid REFERENCES public.kpi_definitions(id) ON DELETE SET NULL;

-- Configurable deadline RAG thresholds (in days remaining)
-- green: >= deadline_green_days remaining, amber: >= deadline_amber_days, red: < deadline_amber_days
ALTER TABLE public.goals
  ADD COLUMN deadline_green_days integer NOT NULL DEFAULT 14,
  ADD COLUMN deadline_amber_days integer NOT NULL DEFAULT 7;

-- Index for KPI lookup
CREATE INDEX idx_goals_kpi_def ON public.goals(kpi_definition_id) WHERE kpi_definition_id IS NOT NULL;
