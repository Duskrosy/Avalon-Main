// Seed a board's protected default columns.
// Creatives team boards get tracker-status columns; everyone else gets the
// generic workflow set. Matches the logic in migration 00056_kanban_default_columns.sql
// and its backfill 00081_kanban_default_columns_backfill.sql so new boards ship
// with the same protected set the retroactive migration produces.
//
// Pass the department slug only for `team`-scope boards. Personal and global
// boards always get the generic defaults.

const GENERIC_DEFAULTS = [
  { name: "To Do",       sort_order: 10 },
  { name: "In Progress", sort_order: 20 },
  { name: "Review",      sort_order: 30 },
  { name: "Done",        sort_order: 40 },
];

const CREATIVES_TEAM_DEFAULTS = [
  { name: "Idea",          sort_order: 10 },
  { name: "In Production", sort_order: 20 },
  { name: "Submitted",     sort_order: 30 },
  { name: "Approved",      sort_order: 40 },
  { name: "Scheduled",     sort_order: 50 },
  { name: "Published",     sort_order: 60 },
  { name: "Archived",      sort_order: 70 },
];

type BoardScope = "global" | "team" | "personal";

export function defaultColumnsFor(scope: BoardScope, departmentSlug?: string | null) {
  if (scope === "team" && departmentSlug === "creatives") {
    return CREATIVES_TEAM_DEFAULTS;
  }
  return GENERIC_DEFAULTS;
}

export async function seedDefaultColumns(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  boardId: string,
  scope: BoardScope,
  departmentSlug?: string | null,
) {
  const columns = defaultColumnsFor(scope, departmentSlug);
  const { error } = await admin.from("kanban_columns").insert(
    columns.map((c) => ({
      board_id:   boardId,
      name:       c.name,
      sort_order: c.sort_order,
      is_default: true,
    })),
  );
  if (error) throw new Error(`Failed to seed default columns: ${error.message}`);
}
