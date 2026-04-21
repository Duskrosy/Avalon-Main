# Knowledge Base Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix YouTube links not playing in Learning Materials, make the Choose File button visually prominent across KOP and Learning uploads, and remove video upload/playback capability from KOP.

**Architecture:** Three independent fixes. (1) YouTube embed: `MaterialViewer` in `learning-view.tsx` passes the raw external_link URL directly into an `<iframe>` — YouTube blocks `youtube.com/watch?v=ID` URLs in iframes, requiring conversion to `youtube.com/embed/ID`. (2) File upload styling: three separate `<input type="file">` elements across the codebase have only minimal `text-sm` styling — wrap each in a styled `<label>` with a dashed border and upload icon. (3) KOP video removal: `FileViewer` in `kop-detail-view.tsx` has a video playback block for mp4/mov/webm; both KOP creation and new-version forms accept `.mp4,.mov` — remove all three.

**Tech Stack:** Next.js App Router, React, Tailwind CSS (via CSS vars)

---

## Files

- Modify: `src/app/(dashboard)/knowledgebase/learning/learning-view.tsx`
- Modify: `src/app/(dashboard)/knowledgebase/kops/kops-view.tsx`
- Modify: `src/app/(dashboard)/knowledgebase/kops/[id]/kop-detail-view.tsx`

---

## Task 1: Fix YouTube embed in Learning Materials viewer

**File:**
- Modify: `src/app/(dashboard)/knowledgebase/learning/learning-view.tsx`

**Root cause:** `MaterialViewer` (lines 93–192) renders link-type materials with `<iframe src={url}>` at line 179. YouTube blocks embedding of `youtube.com/watch?v=ID` and `youtu.be/ID` URLs in iframes — these must be converted to `youtube.com/embed/ID`.

- [ ] **Step 1: Add `toEmbedUrl` helper before `MaterialViewer`**

Find the line immediately before `function MaterialViewer(` (line 93 area). Insert this helper:

```tsx
function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    if (u.hostname === "www.youtube.com" || u.hostname === "youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
    }
  } catch {
    // not a valid URL — return as-is
  }
  return url;
}
```

- [ ] **Step 2: Use `toEmbedUrl` for link-type iframe**

Find the link-type iframe in `MaterialViewer` (line ~179):
```tsx
        ) : material.material_type === "link" ? (
          <iframe src={url} className="w-full h-full border-0" title={material.title} />
```

Replace with:
```tsx
        ) : material.material_type === "link" ? (
          <iframe src={toEmbedUrl(url)} className="w-full h-full border-0" title={material.title} />
```

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: Clean TypeScript build, no errors.

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```

Navigate to `/knowledgebase/learning`. Add a material with type "Link" and URL `https://www.youtube.com/watch?v=dQw4w9WgXcQ`. Click to view — the YouTube player should appear in the modal. Also test `https://youtu.be/dQw4w9WgXcQ` and verify it also works. A non-YouTube URL (e.g. `https://example.com`) should still render in iframe unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/knowledgebase/learning/learning-view.tsx
git commit -m "fix(learning): convert YouTube watch URLs to embed format in MaterialViewer"
```

---

## Task 2: Style file upload buttons across Learning + KOP

**Files:**
- Modify: `src/app/(dashboard)/knowledgebase/learning/learning-view.tsx`
- Modify: `src/app/(dashboard)/knowledgebase/kops/kops-view.tsx`
- Modify: `src/app/(dashboard)/knowledgebase/kops/[id]/kop-detail-view.tsx`

**Root cause:** All three file inputs use only `className="w-full text-sm text-[var(--color-text-secondary)]"` — the native browser file picker button is tiny and unstyled. The fix wraps each in a styled `<label>` with a dashed border, upload icon, and hover state, hiding the native input with `sr-only`.

- [ ] **Step 1: Style file input in `learning-view.tsx`**

Find the file input block (lines ~615–631):
```tsx
                  <>
                    <input
                      type="file"
                      aria-label="Upload file"
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.mp4,.mov,.webm"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        if (f && f.size > 100 * 1024 * 1024) {
                          setError("File must be under 100MB.");
                          e.target.value = "";
                          return;
                        }
                        setFile(f);
                      }}
                      className="w-full text-sm text-[var(--color-text-secondary)]"
                    />
                    <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">Max 100MB</p>
                  </>
```

Replace with:
```tsx
                  <>
                    <label className="flex items-center gap-3 cursor-pointer border border-dashed border-[var(--color-border-primary)] rounded-lg px-4 py-3 hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-hover)] transition-colors">
                      <svg className="w-5 h-5 text-[var(--color-text-tertiary)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      <span className="text-sm text-[var(--color-text-secondary)]">
                        {file ? file.name : "Choose file to upload"}
                      </span>
                      <input
                        type="file"
                        aria-label="Upload file"
                        accept=".pdf,.doc,.docx,.ppt,.pptx,.mp4,.mov,.webm"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          if (f && f.size > 100 * 1024 * 1024) {
                            setError("File must be under 100MB.");
                            e.target.value = "";
                            return;
                          }
                          setFile(f);
                        }}
                      />
                    </label>
                    <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">Max 100MB · PDF, DOC, PPT, Video</p>
                  </>
```

- [ ] **Step 2: Style file input in `kops-view.tsx`**

Find the file input block (lines ~261–280):
```tsx
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">File *</label>
                <input
                  required
                  type="file"
                  aria-label="Upload KOP file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.mp4,.mov"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f && f.size > 100 * 1024 * 1024) {
                      setError("File must be under 100MB.");
                      e.target.value = "";
                      return;
                    }
                    setFile(f);
                  }}
                  className="w-full text-sm text-[var(--color-text-secondary)]"
                />
                <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">Max 100MB. PDF, DOC, PPT, XLS, MP4, MOV</p>
```

Replace with:
```tsx
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">File *</label>
                <label className="flex items-center gap-3 cursor-pointer border border-dashed border-[var(--color-border-primary)] rounded-lg px-4 py-3 hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-hover)] transition-colors">
                  <svg className="w-5 h-5 text-[var(--color-text-tertiary)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    {file ? file.name : "Choose file to upload"}
                  </span>
                  <input
                    required
                    type="file"
                    aria-label="Upload KOP file"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f && f.size > 100 * 1024 * 1024) {
                        setError("File must be under 100MB.");
                        e.target.value = "";
                        return;
                      }
                      setFile(f);
                    }}
                  />
                </label>
                <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">Max 100MB · PDF, DOC, PPT, XLS</p>
```

Note: `.mp4,.mov` removed from accept in this step (combines Task 2 + Task 3 for kops-view).

- [ ] **Step 3: Style file input in `kop-detail-view.tsx`**

Find the new-version file input block (lines ~417–426):
```tsx
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">File *</label>
                <input
                  required
                  ref={fileRef}
                  type="file"
                  aria-label="Upload new version file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.mp4,.mov"
                  className="w-full text-sm text-[var(--color-text-secondary)]"
                />
                <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">Max 100MB</p>
```

Replace with:
```tsx
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">File *</label>
                <label className="flex items-center gap-3 cursor-pointer border border-dashed border-[var(--color-border-primary)] rounded-lg px-4 py-3 hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-hover)] transition-colors">
                  <svg className="w-5 h-5 text-[var(--color-text-tertiary)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span className="text-sm text-[var(--color-text-secondary)]">Choose file to upload</span>
                  <input
                    required
                    ref={fileRef}
                    type="file"
                    aria-label="Upload new version file"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                    className="sr-only"
                  />
                </label>
                <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">Max 100MB · PDF, DOC, PPT, XLS</p>
```

Note: `.mp4,.mov` removed from accept (combines Task 2 + Task 3 for kop-detail-view).

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: Clean TypeScript build.

- [ ] **Step 5: Verify in browser**

```bash
npm run dev
```

- Navigate to `/knowledgebase/learning` → add material (non-link type) → file upload area shows a dashed bordered box with upload icon and "Choose file to upload" text. Clicking it opens the file picker. After selecting a file, the file name appears in the label.
- Navigate to `/knowledgebase/kops` → new KOP form → same styled upload area.
- Navigate to any KOP detail → "New Version" form → same styled upload area.

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/knowledgebase/learning/learning-view.tsx
git add src/app/(dashboard)/knowledgebase/kops/kops-view.tsx
git add src/app/(dashboard)/knowledgebase/kops/[id]/kop-detail-view.tsx
git commit -m "feat(knowledgebase): style file upload buttons with prominent dashed upload area"
```

---

## Task 3: Remove video playback from KOP FileViewer

**File:**
- Modify: `src/app/(dashboard)/knowledgebase/kops/[id]/kop-detail-view.tsx`

**Note:** The accept= changes for KOP forms were already made in Task 2 Steps 2–3. This task handles only the `FileViewer` playback block.

- [ ] **Step 1: Remove video block from `FileViewer`**

Find the video playback block in `FileViewer` (lines ~219–225):
```tsx
  if (["mp4", "mov", "webm"].includes(ext)) {
    return (
      <video controls className="w-full rounded-lg border border-[var(--color-border-primary)] max-h-[70vh]">
        <source src={url} />
      </video>
    );
  }
```

Delete those 7 lines entirely.

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: Clean build. `FileViewer` will fall through to the existing `<iframe>` or "unsupported" rendering for any mp4/mov files that were uploaded before this change (they'll show as unsupported, which is acceptable).

- [ ] **Step 3: Verify**

```bash
npm run dev
```

Navigate to a KOP detail. The "New Version" file picker now only accepts PDF/DOC/PPT/XLS. If any existing KOP version was a video file, clicking it should show "unsupported format" (or the iframe fallback), not a video player.

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/knowledgebase/kops/[id]/kop-detail-view.tsx
git commit -m "feat(kops): remove video upload and playback capability"
```

---

## Self-Review

**Spec coverage:**
- ✅ "Uploaded video not playing, youtube link is blocked" — Task 1 adds `toEmbedUrl()` converting watch URLs to embed URLs before iframe render
- ✅ "KOP Library and Learning Materials Choose File button feels too weak" — Task 2 adds dashed bordered upload area with icon and hover state across all 3 file inputs
- ✅ "Remove video capability from KOP" — Task 2 (accept= stripped of mp4/mov) + Task 3 (video playback block removed from FileViewer)

**Placeholder scan:** None — all code blocks are complete and self-contained.

**Type consistency:** No new types introduced. `fileRef` ref in kop-detail-view.tsx is preserved on the hidden input — `required` and `ref` attributes kept in same position.

**Accept= cross-check:**
- `learning-view.tsx` — keeps `.mp4,.mov,.webm` (Learning still supports video material type)
- `kops-view.tsx` — changed to `.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx` (video removed)
- `kop-detail-view.tsx` — changed to `.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx` (video removed)
