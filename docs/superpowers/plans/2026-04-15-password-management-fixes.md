# Password Management Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken "must change password on next login" feature, add OPS-only email/password editing in the accounts modal, and add show/hide password toggles across all password fields in the app.

**Architecture:** Three independent fixes. (1) Bug fix: POST /api/users must sync `must_change_password` to Supabase `app_metadata` like PATCH already does. (2) Feature: OPS users (tier <= 1) get email + password fields in the edit modal, backed by a new API path in PATCH /api/users/[id]. (3) UI: A reusable `PasswordInput` component wraps every password field with an eye toggle.

**Tech Stack:** Next.js App Router, Supabase Auth Admin API, React, Tailwind CSS

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/ui/password-input.tsx` | **Create** | Reusable password input with show/hide toggle |
| `src/app/api/users/route.ts` | **Modify** (line ~103) | Add `app_metadata` sync after profile insert |
| `src/app/api/users/[id]/route.ts` | **Modify** (lines ~22-117) | Add OPS-only email + password update via admin API |
| `src/app/(dashboard)/people/accounts/accounts-view.tsx` | **Modify** | Add email/password fields to edit modal for OPS; use PasswordInput |
| `src/app/(auth)/login/page.tsx` | **Modify** | Replace password `<input>`s with PasswordInput |
| `src/app/(dashboard)/account/settings/settings-view.tsx` | **Modify** | Replace password `<input>`s with PasswordInput |

---

### Task 1: Fix must_change_password — sync app_metadata on user creation

**Why it's broken:** `POST /api/users` inserts `must_change_password: true` into the `profiles` table but never writes it to Supabase `auth.users.app_metadata`. The login page and middleware both read from `app_metadata`, not the profiles table. New users are never intercepted.

**Files:**
- Modify: `src/app/api/users/route.ts:89-110`

- [ ] **Step 1: Add app_metadata sync after profile insert**

In `src/app/api/users/route.ts`, after the profile insert succeeds (line 103) and before the error-rollback check, add the `app_metadata` sync. The full block from the profile insert through the end of the function should become:

```typescript
  const { error: profileError } = await admin.from("profiles").insert({
    id: authData.user.id,
    email,
    first_name,
    last_name,
    department_id,
    role_id,
    status: "active",
    birthday: birthday || null,
    phone: phone || null,
    created_by: currentUser.id,
    must_change_password,
    require_mfa,
    allow_password_change,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // Sync must_change_password to app_metadata so middleware + login can enforce it
  if (must_change_password) {
    await admin.auth.admin.updateUserById(authData.user.id, {
      app_metadata: { must_change_password: true },
    });
  }

  return NextResponse.json({ message: "User created successfully", user_id: authData.user.id });
```

The key addition is the `if (must_change_password)` block. This mirrors the pattern already used in `PATCH /api/users/[id]` (lines 111-115).

- [ ] **Step 2: Verify the fix compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -E "route\.ts|error TS" | head -20`
Expected: No errors from `src/app/api/users/route.ts`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/users/route.ts
git commit -m "fix(auth): sync must_change_password to app_metadata on user creation

POST /api/users wrote must_change_password to the profiles table but
never set it in Supabase app_metadata. Login page and middleware both
read app_metadata, so newly created users were never intercepted.
Mirrors the sync pattern already used in PATCH /api/users/[id]."
```

---

### Task 2: Create reusable PasswordInput component

**Files:**
- Create: `src/components/ui/password-input.tsx`

- [ ] **Step 1: Create the PasswordInput component**

Create `src/components/ui/password-input.tsx`:

```tsx
"use client";

import { useState, forwardRef } from "react";

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Override the default CSS class. If omitted, uses the standard Avalon input style. */
  className?: string;
};

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, ...props }, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? "text" : "password"}
          className={
            className ??
            "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm pr-9 focus:outline-none focus:ring-2 focus:ring-gray-900"
          }
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? (
            /* EyeSlashIcon — password is visible, click to hide */
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
            </svg>
          ) : (
            /* EyeIcon — password is hidden, click to show */
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
        </button>
      </div>
    );
  }
);
```

- [ ] **Step 2: Verify the component compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -E "password-input|error TS" | head -10`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/password-input.tsx
git commit -m "feat(ui): add PasswordInput component with show/hide toggle

Reusable component wrapping a password input with an eye icon button
to toggle visibility. Uses forwardRef for compatibility with form
libraries and refs. Matches existing Avalon input styling."
```

---

### Task 3: Add show/hide password toggle to login page

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Add PasswordInput import**

At the top of `src/app/(auth)/login/page.tsx`, add the import after the existing imports (after line 5):

```typescript
import { PasswordInput } from "@/components/ui/password-input";
```

- [ ] **Step 2: Replace the credentials step password input (line 275-283)**

Find the password input in the credentials form. Replace:

```tsx
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
```

With:

```tsx
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm pr-9 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
```

- [ ] **Step 3: Replace the force_change "new password" input (line 501-509)**

Find the force_change new password input. Replace:

```tsx
                <input
                  type="password"
                  required
                  minLength={8}
                  value={forceNew}
                  onChange={(e) => setForceNew(e.target.value)}
                  placeholder="At least 8 characters"
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
```

With:

```tsx
                <PasswordInput
                  required
                  minLength={8}
                  value={forceNew}
                  onChange={(e) => setForceNew(e.target.value)}
                  placeholder="At least 8 characters"
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm pr-9 focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
```

- [ ] **Step 4: Replace the force_change "confirm" input (line 514-521)**

Find the confirm password input. Replace:

```tsx
                <input
                  type="password"
                  required
                  minLength={8}
                  value={forceConfirm}
                  onChange={(e) => setForceConfirm(e.target.value)}
                  placeholder="Repeat your new password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
```

With:

```tsx
                <PasswordInput
                  required
                  minLength={8}
                  value={forceConfirm}
                  onChange={(e) => setForceConfirm(e.target.value)}
                  placeholder="Repeat your new password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm pr-9 focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -E "login/page|error TS" | head -10`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/app/(auth)/login/page.tsx
git commit -m "feat(auth): add show/hide password toggle to login page

Replaces plain password inputs with PasswordInput component on the
credentials form and force-change-password step."
```

---

### Task 4: Add show/hide password toggle to settings change-password section

**Files:**
- Modify: `src/app/(dashboard)/account/settings/settings-view.tsx`

- [ ] **Step 1: Add PasswordInput import**

At the top of `settings-view.tsx`, after the existing imports (after line 9):

```typescript
import { PasswordInput } from "@/components/ui/password-input";
```

- [ ] **Step 2: Replace all three password inputs in ChangePasswordSection (lines 204-231)**

Find the three password inputs in the change password form. Replace each one:

**Current password (line 204-209):**

Replace:
```tsx
            <input
              type="password"
              required
              value={form.current}
              onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
```

With:
```tsx
            <PasswordInput
              required
              value={form.current}
              onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
            />
```

**New password (line 214-220):**

Replace:
```tsx
            <input
              type="password"
              required
              minLength={8}
              value={form.next}
              onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
```

With:
```tsx
            <PasswordInput
              required
              minLength={8}
              value={form.next}
              onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
            />
```

**Confirm password (line 225-230):**

Replace:
```tsx
            <input
              type="password"
              required
              value={form.confirm}
              onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
```

With:
```tsx
            <PasswordInput
              required
              value={form.confirm}
              onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
            />
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -E "settings-view|error TS" | head -10`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/account/settings/settings-view.tsx
git commit -m "feat(settings): add show/hide password toggle to change-password form

Replaces plain password inputs with PasswordInput component for
current, new, and confirm password fields."
```

---

### Task 5: Add OPS-only email and password editing to accounts modal + show/hide toggle

**Files:**
- Modify: `src/app/(dashboard)/people/accounts/accounts-view.tsx:72-324` (UserModal)
- Modify: `src/app/api/users/[id]/route.ts:7-117` (PATCH handler)

- [ ] **Step 1: Update the PATCH API to support OPS email + password changes**

In `src/app/api/users/[id]/route.ts`, add `email` and `password` to the destructured body (line 23-27):

Replace:
```typescript
  const {
    first_name, last_name, department_id, role_id, birthday, phone, status,
    bio, job_title, fun_fact, avatar_require_approval,
    must_change_password, require_mfa, allow_password_change,
  } = body;
```

With:
```typescript
  const {
    first_name, last_name, department_id, role_id, birthday, phone, status,
    bio, job_title, fun_fact, avatar_require_approval,
    must_change_password, require_mfa, allow_password_change,
    email, password,
  } = body;
```

Then, after the `status` handling block (line 98) and before `// Self can clear must_change_password` (line 101), add email + password update logic:

```typescript
    // Email + password — OPS only, not self-service
    if (isOps(currentUser) && !isSelf) {
      if (email !== undefined && typeof email === "string" && email.trim()) {
        const { error: emailError } = await admin.auth.admin.updateUserById(id, { email });
        if (emailError) {
          return NextResponse.json({ error: `Email update failed: ${emailError.message}` }, { status: 400 });
        }
        updates.email = email;
      }
      if (password !== undefined && typeof password === "string" && password.length >= 8) {
        const { error: pwError } = await admin.auth.admin.updateUserById(id, { password });
        if (pwError) {
          return NextResponse.json({ error: `Password update failed: ${pwError.message}` }, { status: 400 });
        }
        // Don't store password in profiles table — it lives in auth.users only
      }
    }
```

- [ ] **Step 2: Add PasswordInput import and email/password fields to edit modal**

In `src/app/(dashboard)/people/accounts/accounts-view.tsx`, add the import at the top (after line 7):

```typescript
import { PasswordInput } from "@/components/ui/password-input";
```

- [ ] **Step 3: Update handleSubmit to include email/password for OPS edits**

In the `handleSubmit` function (line 132-158), the edit branch currently strips email and password (line 145):

```typescript
      const { email: _e, password: _p, ...editBody } = form;
```

Replace that line with conditional logic:

```typescript
      // OPS can change email/password; non-OPS strip them
      const editBody: Record<string, unknown> = { ...form };
      delete editBody.password; // only include if OPS set a new one
      if (!isOps) delete editBody.email;
      // If OPS provided a new password, include it
      if (isOps && form.password.trim().length >= 8) {
        editBody.password = form.password;
      }
      // If password field is empty, don't send it
      if (!editBody.password) delete editBody.password;
```

- [ ] **Step 4: Show email field in edit mode for OPS users**

Currently email is only shown in create mode (line 201: `{mode === "create" && ...}`). Change the condition so email also shows for OPS in edit mode.

Replace the `{mode === "create" && (` block (lines 201-225) with:

```tsx
          {/* Email (create always, edit for OPS only) */}
          {(mode === "create" || isOps) && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                required={mode === "create"}
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              {mode === "edit" && (
                <p className="text-xs text-gray-400 mt-1">Changing this will update their login email.</p>
              )}
            </div>
          )}

          {/* Password (create always, edit for OPS only) */}
          {(mode === "create" || isOps) && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {mode === "create" ? "Password" : "New password"}
                {mode === "edit" && <span className="text-gray-400 font-normal"> (leave blank to keep current)</span>}
              </label>
              <PasswordInput
                required={mode === "create"}
                minLength={mode === "create" ? 8 : undefined}
                value={form.password}
                onChange={(e) => setField("password", e.target.value)}
                placeholder={mode === "edit" ? "Leave blank to keep current" : undefined}
              />
            </div>
          )}
```

- [ ] **Step 5: Verify everything compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -E "accounts-view|route\.ts|error TS" | head -20`
Expected: No errors from these files

- [ ] **Step 6: Commit**

```bash
git add src/app/api/users/[id]/route.ts src/app/(dashboard)/people/accounts/accounts-view.tsx
git commit -m "feat(accounts): OPS can edit email and password from accounts modal

Super Ops and Admin Ops can now change a user's email and set a new
password directly from the edit modal. Email updates go through
Supabase admin API and sync to the profiles table. Password updates
go through admin API only (not stored in profiles).

Also adds show/hide password toggle via PasswordInput component to
both the create and edit user modals."
```

---

### Task 6: Build verification

- [ ] **Step 1: Run full project type check**

Run: `npx tsc --noEmit --pretty`
Expected: No new errors

- [ ] **Step 2: Run next build to verify everything compiles end-to-end**

Run: `npx next build 2>&1 | tail -30`
Expected: Build succeeds with no errors

- [ ] **Step 3: If build fails, fix any issues and commit the fix**

---

## Summary of all changes

| Issue | Root cause | Fix |
|-------|-----------|-----|
| `must_change_password` not working | POST /api/users never synced to `app_metadata` | Add `updateUserById` call after profile insert |
| No email/password edit for OPS | Edit modal stripped email/password; PATCH API didn't handle them | Add OPS guard + admin API calls in PATCH; show fields in modal |
| No show/hide on password fields | All password inputs used `type="password"` with no toggle | New `PasswordInput` component with eye icon, used in 4 files |
