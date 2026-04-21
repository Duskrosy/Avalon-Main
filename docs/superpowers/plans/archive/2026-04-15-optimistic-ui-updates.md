# Optimistic UI Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all 48 instances of `router.refresh()`, `window.location.reload()`, and `alert()` with optimistic local state updates and inline toast notifications, so the UI reflects changes instantly.

**Architecture:** Create a shared Toast notification component. Then for each mutation handler across 19 files, replace the server re-render/reload with a local state update (add/update/remove item in the existing state array). The API call still happens, we just update the UI immediately without waiting for a full page re-render.

**Tech Stack:** React useState, Next.js App Router, Tailwind CSS

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/ui/toast.tsx` | **Create** | Shared toast notification component with auto-dismiss |
| `src/app/(dashboard)/people/accounts/accounts-view.tsx` | **Modify** | Replace 7 alert() + 2 router.refresh() |
| `src/app/(dashboard)/people/accounts/permissions/permissions-view.tsx` | **Modify** | Replace 1 alert() + 1 router.refresh() |
| `src/app/(dashboard)/operations/orders/orders-view.tsx` | **Modify** | Replace 4 router.refresh() + remove redundant fetchOrders() |
| `src/app/(dashboard)/operations/catalog/catalog-view.tsx` | **Modify** | Replace 4 router.refresh() |
| `src/app/(dashboard)/operations/dispatch/dispatch-view.tsx` | **Modify** | Replace 3 router.refresh() |
| `src/app/(dashboard)/operations/distressed/distressed-view.tsx` | **Modify** | Replace 3 router.refresh() |
| `src/app/(dashboard)/operations/issues/issues-view.tsx` | **Modify** | Replace 4 router.refresh() |
| `src/app/(dashboard)/operations/remittance/remittance-view.tsx` | **Modify** | Replace 6 router.refresh() |
| `src/app/(dashboard)/operations/courier/courier-view.tsx` | **Modify** | Replace 1 router.refresh() |
| `src/app/(dashboard)/operations/inventory/inventory-view.tsx` | **Modify** | Replace 1 router.refresh() |
| `src/app/(dashboard)/creatives/tracker/tracker-view.tsx` | **Modify** | Replace 3 router.refresh() |
| `src/app/(dashboard)/ad-ops/campaigns/campaigns-view.tsx` | **Modify** | Replace 1 router.refresh() |
| `src/app/(dashboard)/ad-ops/dashboard/ad-dashboard.tsx` | **Modify** | Replace 1 router.refresh() |
| `src/app/(dashboard)/ad-ops/settings/settings-view.tsx` | **Modify** | Replace 1 router.refresh() |
| `src/app/(dashboard)/scheduling/rooms/room-booking-view.tsx` | **Modify** | Replace 2 window.location.reload() |
| `src/app/(dashboard)/productivity/kanban/kanban-multi-board.tsx` | **Modify** | Replace 1 window.location.reload() |
| `src/app/(dashboard)/productivity/kanban/kanban-board.tsx` | **Modify** | Replace 1 alert() |
| `src/app/(dashboard)/sales-ops/shopify/shopify-reconciliation.tsx` | **Modify** | Replace 1 router.refresh() |
| `src/app/(dashboard)/knowledgebase/kops/[id]/kop-detail-view.tsx` | **Modify** | Replace 1 router.refresh() |
| `src/app/(dashboard)/executive/date-range-bar.tsx` | **Modify** | Replace 1 router.refresh() |

---

## Universal Fix Patterns

Every file follows one of these 4 patterns. The tasks reference these by name.

### Pattern A: Create → Add to state
```tsx
// BEFORE:
const res = await fetch("/api/items", { method: "POST", ... });
if (res.ok) { setModalOpen(false); router.refresh(); }

// AFTER:
const res = await fetch("/api/items", { method: "POST", ... });
const created = await res.json();
if (res.ok) {
  setItems((prev) => [created, ...prev]);
  setModalOpen(false);
  setToast({ message: "Item created", type: "success" });
}
```

### Pattern B: Update → Patch in state
```tsx
// BEFORE:
await fetch("/api/items", { method: "PATCH", body: JSON.stringify({ id, status }) });
router.refresh();

// AFTER:
const res = await fetch("/api/items", { method: "PATCH", body: JSON.stringify({ id, status }) });
if (res.ok) {
  setItems((prev) => prev.map((item) => item.id === id ? { ...item, status } : item));
}
```

### Pattern C: Delete → Remove from state
```tsx
// BEFORE:
const res = await fetch(`/api/items?id=${id}`, { method: "DELETE" });
if (res.ok) { router.refresh(); }

// AFTER:
const res = await fetch(`/api/items?id=${id}`, { method: "DELETE" });
if (res.ok) {
  setItems((prev) => prev.filter((item) => item.id !== id));
  setToast({ message: "Item deleted", type: "success" });
}
```

### Pattern D: Alert → Toast
```tsx
// BEFORE:
alert(`${name} has been signed out`);
// or
if (!res.ok) { alert(data.error); return; }

// AFTER:
setToast({ message: `${name} has been signed out`, type: "success" });
// or
if (!res.ok) { setToast({ message: data.error, type: "error" }); return; }
```

---

### Task 1: Create Toast notification component

**Files:**
- Create: `src/components/ui/toast.tsx`

- [ ] **Step 1: Create the Toast component**

Create `src/components/ui/toast.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type ToastData = { message: string; type: "success" | "error" | "info" };

export function useToast() {
  const [toast, setToast] = useState<ToastData | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  return { toast, setToast };
}

export function Toast({ toast, onDismiss }: { toast: ToastData | null; onDismiss: () => void }) {
  if (!toast) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200">
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm",
          toast.type === "success" && "bg-green-600 text-white",
          toast.type === "error" && "bg-red-600 text-white",
          toast.type === "info" && "bg-gray-800 text-white",
        )}
      >
        {toast.type === "success" && (
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
        {toast.type === "error" && (
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
        <span className="flex-1">{toast.message}</span>
        <button onClick={onDismiss} className="ml-2 opacity-70 hover:opacity-100">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

Note: Tailwind's `animate-in`, `slide-in-from-bottom-4`, `fade-in` require `tailwindcss-animate`. Check if it's installed. If not, use a simple `transition-all` approach instead:

```tsx
// Fallback if tailwindcss-animate is not installed:
// Replace the animate-in classes with:
className="fixed bottom-4 right-4 z-50"
// And wrap in a conditional that handles enter/exit transitions via opacity
```

- [ ] **Step 2: Verify tailwindcss-animate is available**

Run: `grep "tailwindcss-animate" package.json`
If not found, use plain Tailwind classes instead of animate-in.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -E "toast|error TS" | head -10`

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/toast.tsx
git commit -m "feat(ui): add Toast notification component with useToast hook"
```

---

### Task 2: Fix People module — accounts + permissions

**Files:**
- Modify: `src/app/(dashboard)/people/accounts/accounts-view.tsx`
- Modify: `src/app/(dashboard)/people/accounts/permissions/permissions-view.tsx`

**accounts-view.tsx changes:**

- [ ] **Step 1: Add toast import and state**

Add import: `import { useToast, Toast } from "@/components/ui/toast";`

Inside `AccountsView` component, add: `const { toast, setToast } = useToast();`

Add `<Toast toast={toast} onDismiss={() => setToast(null)} />` just before the closing `</div>` of the return.

- [ ] **Step 2: Replace onSaved callbacks (lines 488, 500)**

Replace both `onSaved={() => router.refresh()}` with actual data refresh functions.

For create modal (line 488): Change `onSaved={() => router.refresh()}` to:
```tsx
onSaved={(newUser?: unknown) => {
  // Refetch the user list to include the new user
  fetch("/api/users").then(r => r.json()).then(data => {
    if (data.users) setUsers(data.users);
  });
  setToast({ message: "User created", type: "success" });
}}
```

For edit modal (line 500): Same pattern but with "User updated" message.

Note: The `UserModal` component's `onSaved` callback currently takes no args. We need to update it to pass the response data, OR just refetch the list (simpler and safer since the server may enrich data).

Actually, the simplest correct fix: change `onSaved` to refetch the users list via the same API the page component uses. But that's a server query. Easier: call `GET /api/users` which already exists and returns the user list.

- [ ] **Step 3: Replace all alert() calls with toast (lines 372-420)**

**handleForceSignOut (lines 372-373):**
Replace:
```tsx
if (!res.ok) { alert(data.error); return; }
alert(`${name} has been signed out of all devices.`);
```
With:
```tsx
if (!res.ok) { setToast({ message: data.error, type: "error" }); return; }
setToast({ message: `${name} has been signed out of all devices.`, type: "success" });
```

**handleDeactivate (line 383):**
Replace: `if (!res.ok) { alert(data.error); return; }`
With: `if (!res.ok) { setToast({ message: data.error, type: "error" }); return; }`

**handleReactivate (line 403):**
Same replacement pattern.

**handlePermanentDelete (line 420):**
Same replacement pattern.

- [ ] **Step 4: Remove useRouter import if no longer used**

After removing all `router.refresh()`, check if `router` is still used elsewhere in the component (it may be used for navigation). If not, remove `const router = useRouter()`. If it's still used for navigation, keep it but remove from `useCallback` deps where only used for refresh.

- [ ] **Step 5: Fix permissions-view.tsx**

Replace line 399 `alert(...)` with toast.
Replace line 404 `router.refresh()` with optimistic state update of the permissions data.

Add toast import, useToast hook, and Toast component to the permissions view.

- [ ] **Step 6: Type check**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -E "accounts-view|permissions-view|error TS" | head -10`

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/people/accounts/accounts-view.tsx" "src/app/(dashboard)/people/accounts/permissions/permissions-view.tsx"
git commit -m "fix(people): replace alert/router.refresh with toast + optimistic updates"
```

---

### Task 3: Fix Operations module — orders, catalog, dispatch

**Files:**
- Modify: `src/app/(dashboard)/operations/orders/orders-view.tsx`
- Modify: `src/app/(dashboard)/operations/catalog/catalog-view.tsx`
- Modify: `src/app/(dashboard)/operations/dispatch/dispatch-view.tsx`

For each file: add toast import + useToast hook + Toast component, then replace every `router.refresh()` with the appropriate optimistic state update (Pattern A/B/C) and a toast message.

**orders-view.tsx** has a special case: lines 168 and 178 call BOTH `router.refresh()` AND `fetchOrders()`. Remove `router.refresh()` entirely (the `fetchOrders()` already refreshes data). For the other two at 227 and 238, replace with optimistic state updates.

**catalog-view.tsx** uses `useCallback` wrappers. When removing `router` from deps, update the dependency arrays too.

**dispatch-view.tsx**: Same pattern as catalog.

- [ ] **Step 1: Read all 3 files to understand exact mutation handlers**
- [ ] **Step 2: Add toast to each file**
- [ ] **Step 3: Replace router.refresh() in orders-view (4 instances)**
  - Lines 168, 178: Remove `router.refresh()`, keep `fetchOrders()`
  - Lines 227, 238: Replace with optimistic `setOrders(prev => ...)` update
- [ ] **Step 4: Replace router.refresh() in catalog-view (4 instances)**
  - Line 208 (create): `setItems(prev => [created, ...prev])`
  - Line 224 (update): `setItems(prev => prev.map(i => i.id === editItem.id ? {...i, ...data} : i))`
  - Line 237 (toggle active): `setItems(prev => prev.map(i => i.id === item.id ? {...i, is_active: !i.is_active} : i))`
  - Line 248 (delete): `setItems(prev => prev.filter(i => i.id !== id))`
- [ ] **Step 5: Replace router.refresh() in dispatch-view (3 instances)**
  - Apply Pattern A/B/C based on each handler
- [ ] **Step 6: Remove unused `useRouter` / `router` refs if no longer needed**
- [ ] **Step 7: Type check all 3 files**
- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/operations/orders/orders-view.tsx" \
  "src/app/(dashboard)/operations/catalog/catalog-view.tsx" \
  "src/app/(dashboard)/operations/dispatch/dispatch-view.tsx"
git commit -m "fix(operations): optimistic updates for orders, catalog, dispatch"
```

---

### Task 4: Fix Operations module — issues, distressed, remittance, courier, inventory

**Files:**
- Modify: `src/app/(dashboard)/operations/issues/issues-view.tsx` (4 instances)
- Modify: `src/app/(dashboard)/operations/distressed/distressed-view.tsx` (3 instances)
- Modify: `src/app/(dashboard)/operations/remittance/remittance-view.tsx` (6 instances)
- Modify: `src/app/(dashboard)/operations/courier/courier-view.tsx` (1 instance)
- Modify: `src/app/(dashboard)/operations/inventory/inventory-view.tsx` (1 instance)

Same pattern as Task 3. For each file:
1. Read to understand state variables and mutation handlers
2. Add toast import + hook + component
3. Replace each `router.refresh()` with the appropriate optimistic state update
4. Add toast messages for user feedback

**remittance-view.tsx** is the most complex (6 instances, nested batch/item state). Read carefully to understand the state shape before making changes.

- [ ] **Step 1: Read all 5 files**
- [ ] **Step 2: Fix issues-view.tsx (4 instances)**
- [ ] **Step 3: Fix distressed-view.tsx (3 instances)**
- [ ] **Step 4: Fix remittance-view.tsx (6 instances)**
- [ ] **Step 5: Fix courier-view.tsx (1 instance)**
- [ ] **Step 6: Fix inventory-view.tsx (1 instance)**
- [ ] **Step 7: Type check all 5 files**
- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/operations/issues/issues-view.tsx" \
  "src/app/(dashboard)/operations/distressed/distressed-view.tsx" \
  "src/app/(dashboard)/operations/remittance/remittance-view.tsx" \
  "src/app/(dashboard)/operations/courier/courier-view.tsx" \
  "src/app/(dashboard)/operations/inventory/inventory-view.tsx"
git commit -m "fix(operations): optimistic updates for issues, distressed, remittance, courier, inventory"
```

---

### Task 5: Fix Scheduling + Productivity — room booking, kanban

**Files:**
- Modify: `src/app/(dashboard)/scheduling/rooms/room-booking-view.tsx` (2 window.location.reload)
- Modify: `src/app/(dashboard)/productivity/kanban/kanban-multi-board.tsx` (1 window.location.reload)
- Modify: `src/app/(dashboard)/productivity/kanban/kanban-board.tsx` (1 alert)

**room-booking-view.tsx:**
- Line 405 (create room): Replace `window.location.reload()` with adding new room to rooms state and showing toast
- Line 422 (save settings): Replace `window.location.reload()` with updating room in state and showing toast

**kanban-multi-board.tsx:**
- Line 212 (create board): Replace `window.location.reload()` with adding new board to boards state

**kanban-board.tsx:**
- Line 1523: Replace `alert(err.error || "Failed to delete field")` with toast

- [ ] **Step 1: Read room-booking-view.tsx to understand rooms state**
- [ ] **Step 2: Replace window.location.reload() in room-booking (2 instances)**
- [ ] **Step 3: Read kanban-multi-board.tsx to understand boards state**
- [ ] **Step 4: Replace window.location.reload() in kanban-multi-board**
- [ ] **Step 5: Replace alert() in kanban-board.tsx**
- [ ] **Step 6: Type check**
- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/scheduling/rooms/room-booking-view.tsx" \
  "src/app/(dashboard)/productivity/kanban/kanban-multi-board.tsx" \
  "src/app/(dashboard)/productivity/kanban/kanban-board.tsx"
git commit -m "fix(scheduling+kanban): replace window.reload/alert with optimistic updates + toast"
```

---

### Task 6: Fix Ad-Ops, Creatives, and remaining modules

**Files:**
- Modify: `src/app/(dashboard)/ad-ops/campaigns/campaigns-view.tsx` (1 router.refresh)
- Modify: `src/app/(dashboard)/ad-ops/dashboard/ad-dashboard.tsx` (1 router.refresh)
- Modify: `src/app/(dashboard)/ad-ops/settings/settings-view.tsx` (1 router.refresh)
- Modify: `src/app/(dashboard)/creatives/tracker/tracker-view.tsx` (3 router.refresh)
- Modify: `src/app/(dashboard)/sales-ops/shopify/shopify-reconciliation.tsx` (1 router.refresh)
- Modify: `src/app/(dashboard)/knowledgebase/kops/[id]/kop-detail-view.tsx` (1 router.refresh)
- Modify: `src/app/(dashboard)/executive/date-range-bar.tsx` (1 router.refresh)

Same pattern. Each gets toast + optimistic state update.

**date-range-bar.tsx** is special: it uses `useTransition` + `router.refresh()` for a manual refresh button. This can stay as-is since it's an explicit user-initiated full refresh, not a mutation response. However, consider replacing with a state-based refetch instead.

- [ ] **Step 1: Read all 7 files**
- [ ] **Step 2: Fix ad-ops files (3 instances across 3 files)**
- [ ] **Step 3: Fix creatives/tracker (3 instances)**
- [ ] **Step 4: Fix shopify-reconciliation (1 instance)**
- [ ] **Step 5: Fix kop-detail-view (1 instance)**
- [ ] **Step 6: Assess date-range-bar.tsx — keep or replace**
- [ ] **Step 7: Type check all files**
- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/ad-ops/campaigns/campaigns-view.tsx" \
  "src/app/(dashboard)/ad-ops/dashboard/ad-dashboard.tsx" \
  "src/app/(dashboard)/ad-ops/settings/settings-view.tsx" \
  "src/app/(dashboard)/creatives/tracker/tracker-view.tsx" \
  "src/app/(dashboard)/sales-ops/shopify/shopify-reconciliation.tsx" \
  "src/app/(dashboard)/knowledgebase/kops/[id]/kop-detail-view.tsx" \
  "src/app/(dashboard)/executive/date-range-bar.tsx"
git commit -m "fix(ad-ops+creatives+remaining): optimistic updates across 7 modules"
```

---

### Task 7: Build verification

- [ ] **Step 1: Run full type check**
Run: `npx tsc --noEmit --pretty`

- [ ] **Step 2: Run next build**
Run: `npx next build`

- [ ] **Step 3: Verify no router.refresh remains (except date-range-bar if kept)**
Run: `grep -rn "router.refresh" src/app/(dashboard)/ --include="*.tsx"`

- [ ] **Step 4: Verify no window.location.reload remains**
Run: `grep -rn "window.location.reload\|location.reload" src/app/(dashboard)/ --include="*.tsx"`

- [ ] **Step 5: Verify no alert() remains**
Run: `grep -rn "alert(" src/app/(dashboard)/ --include="*.tsx"`

- [ ] **Step 6: Push**
```bash
git push
```
