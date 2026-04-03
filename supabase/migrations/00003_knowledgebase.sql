-- ============================================================
-- 00003_knowledgebase.sql
-- Avalon Rebuild — Phase 3: Knowledgebase
-- KOPs, Learning Materials, Memos
-- ============================================================
-- NOTE: Before applying this migration, create two Storage
-- buckets in the Supabase dashboard (private, no public access):
--   1. kops
--   2. learning
-- ============================================================


-- ==========================
-- KOPS (Key Operating Procedures)
-- ==========================
CREATE TABLE public.kops (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id   uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  title           text NOT NULL,
  description     text,
  category        text,
  current_version integer NOT NULL DEFAULT 1,
  created_by      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kops_department_id ON public.kops (department_id);
CREATE INDEX idx_kops_category      ON public.kops (category);
CREATE INDEX idx_kops_created_by    ON public.kops (created_by);

CREATE TRIGGER trg_kops_updated_at
  BEFORE UPDATE ON public.kops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_kops
  AFTER INSERT OR UPDATE OR DELETE ON public.kops
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- KOP VERSIONS
-- ==========================
CREATE TABLE public.kop_versions (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  kop_id         uuid NOT NULL REFERENCES public.kops(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  file_url       text NOT NULL,
  file_type      text,
  change_notes   text,
  uploaded_by    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (kop_id, version_number)
);

CREATE INDEX idx_kop_versions_kop_id ON public.kop_versions (kop_id);


-- ==========================
-- MEMOS
-- ==========================
CREATE TABLE public.memos (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  title         text NOT NULL,
  content       text NOT NULL,
  created_by    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_memos_department_id ON public.memos (department_id);
CREATE INDEX idx_memos_created_by    ON public.memos (created_by);

CREATE TRIGGER trg_memos_updated_at
  BEFORE UPDATE ON public.memos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_memos
  AFTER INSERT OR UPDATE OR DELETE ON public.memos
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();


-- ==========================
-- MEMO SIGNATURES
-- ==========================
CREATE TABLE public.memo_signatures (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  memo_id   uuid NOT NULL REFERENCES public.memos(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  signed_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (memo_id, user_id)
);

CREATE INDEX idx_memo_signatures_memo_id  ON public.memo_signatures (memo_id);
CREATE INDEX idx_memo_signatures_user_id  ON public.memo_signatures (user_id);


-- ==========================
-- LEARNING MATERIALS
-- ==========================
CREATE TYPE public.material_type AS ENUM ('video', 'pdf', 'presentation', 'document', 'link');

CREATE TABLE public.learning_materials (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  title         text NOT NULL,
  description   text,
  material_type public.material_type NOT NULL,
  file_url      text,
  external_link text,
  sort_order    integer NOT NULL DEFAULT 0,
  created_by    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_learning_materials_dept      ON public.learning_materials (department_id);
CREATE INDEX idx_learning_materials_type      ON public.learning_materials (material_type);
CREATE INDEX idx_learning_materials_sort      ON public.learning_materials (sort_order);


-- ==========================
-- LEARNING COMPLETIONS
-- ==========================
CREATE TABLE public.learning_completions (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.learning_materials(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, material_id)
);

CREATE INDEX idx_learning_completions_user_id     ON public.learning_completions (user_id);
CREATE INDEX idx_learning_completions_material_id ON public.learning_completions (material_id);


-- ==========================
-- ENABLE RLS
-- ==========================
ALTER TABLE public.kops                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kops                  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.kop_versions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kop_versions          FORCE ROW LEVEL SECURITY;
ALTER TABLE public.memos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memos                 FORCE ROW LEVEL SECURITY;
ALTER TABLE public.memo_signatures       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memo_signatures       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learning_materials    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_materials    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learning_completions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_completions  FORCE ROW LEVEL SECURITY;


-- ==========================
-- RLS POLICIES — KOPS
-- Global KOPs (department_id IS NULL) visible to all.
-- Department KOPs visible to that department + OPS.
-- Write: managers+ of that dept, or OPS for global.
-- ==========================
CREATE POLICY kops_select ON public.kops FOR SELECT USING (
  department_id IS NULL
  OR public.is_ops()
  OR department_id = public.get_my_department_id()
);
CREATE POLICY kops_insert ON public.kops FOR INSERT WITH CHECK (public.is_manager_or_above());
CREATE POLICY kops_update ON public.kops FOR UPDATE USING (
  public.is_ops()
  OR (public.is_manager_or_above() AND department_id = public.get_my_department_id())
);
CREATE POLICY kops_delete ON public.kops FOR DELETE USING (public.is_ops());

-- KOP versions follow parent KOP access
CREATE POLICY kop_versions_select ON public.kop_versions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.kops k WHERE k.id = kop_id
    AND (k.department_id IS NULL OR public.is_ops() OR k.department_id = public.get_my_department_id())
  )
);
CREATE POLICY kop_versions_insert ON public.kop_versions FOR INSERT WITH CHECK (public.is_manager_or_above());
CREATE POLICY kop_versions_delete ON public.kop_versions FOR DELETE USING (public.is_ops());


-- ==========================
-- RLS POLICIES — MEMOS
-- ==========================
CREATE POLICY memos_select ON public.memos FOR SELECT USING (
  department_id IS NULL
  OR public.is_ops()
  OR department_id = public.get_my_department_id()
);
CREATE POLICY memos_insert ON public.memos FOR INSERT WITH CHECK (public.is_manager_or_above());
CREATE POLICY memos_update ON public.memos FOR UPDATE USING (
  public.is_ops()
  OR (public.is_manager_or_above() AND department_id = public.get_my_department_id())
);
CREATE POLICY memos_delete ON public.memos FOR DELETE USING (public.is_ops());

CREATE POLICY memo_signatures_select ON public.memo_signatures FOR SELECT USING (true);
CREATE POLICY memo_signatures_insert ON public.memo_signatures FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY memo_signatures_delete ON public.memo_signatures FOR DELETE USING (
  user_id = auth.uid() OR public.is_ops()
);


-- ==========================
-- RLS POLICIES — LEARNING
-- ==========================
CREATE POLICY learning_select ON public.learning_materials FOR SELECT USING (
  department_id IS NULL
  OR public.is_ops()
  OR department_id = public.get_my_department_id()
);
CREATE POLICY learning_insert ON public.learning_materials FOR INSERT WITH CHECK (public.is_manager_or_above());
CREATE POLICY learning_update ON public.learning_materials FOR UPDATE USING (public.is_manager_or_above());
CREATE POLICY learning_delete ON public.learning_materials FOR DELETE USING (public.is_manager_or_above());

CREATE POLICY completions_select ON public.learning_completions FOR SELECT USING (
  user_id = auth.uid() OR public.is_manager_or_above()
);
CREATE POLICY completions_insert ON public.learning_completions FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY completions_delete ON public.learning_completions FOR DELETE USING (
  user_id = auth.uid()
);
