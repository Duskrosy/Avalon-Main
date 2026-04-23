// Supabase/PostgREST caps a single SELECT at 1000 rows by default.
// `fetchAllRows` loops .range() pages until a page comes back short.
// Pass a factory so each iteration builds a fresh query builder.
const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  makeQuery: () => any,
): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await makeQuery().range(start, start + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}
