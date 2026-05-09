
# Ingestion Pipeline (Block 10) — Build Plan

Lets Fif drop an email/PDF/text/photo, have Claude parse it into proposed DB updates, then approve/edit/reject before they're applied.

## 1. Database & Storage (1 migration)

- Create table `intelligence_ingestion` with all columns from spec (source_*, hint_*, parse_*, ai_*, human_*, resulted_in_*, status enum-checked).
- Indexes: `status`, `hint_festival_id`, `created_at desc`.
- `updated_at` trigger reusing existing `update_updated_at_column()`.
- RLS: `authenticated` users full access (matches project pattern).
- Storage bucket `intelligence-uploads` (private) + RLS policies for authenticated read/write/delete.
- RPC helper `apply_ingestion(p_id uuid, p_updates jsonb)` (SECURITY DEFINER) that runs the approved updates inside a single transaction, resolves `match_by` lookups (festival_slug/concept_slug → festival_contract_id), returns `{successes, failures, resulted_in_*}`. On any error → `RAISE` to roll back. Updates ingestion row at the end.

## 2. Edge Function `parse-ingestion`

- `verify_jwt = false` block in `supabase/config.toml` (project pattern), validate JWT in code via `getClaims()`.
- Input: `{ ingestion_id }`.
- Steps:
  1. Set `status='parsing'`.
  2. Load row; if `file_path`, download from storage. For `.eml` parse headers + body (simple regex-based parser). For `.pdf`, expect `raw_content` already extracted client-side (pdf.js). For images, skip parse if no raw_content.
  3. Build context: festivals (slug, name, dates, operating entities from `festival_contracts`), concepts, rules via `get_active_rules_for_festival()` (or all active if no hint), existing contacts + contracts at hint festival.
  4. POST to `https://api.anthropic.com/v1/messages` with `ANTHROPIC_API_KEY`, model `claude-opus-4-7`, max_tokens 4096, system prompt from spec (Part 5) with injected context, user message wrapping `raw_content` + hints. JSON response mode via "Return ONLY valid JSON".
  5. Strip markdown fences, JSON.parse, validate shape.
  6. Update row with parse outputs; `status='parsed'` (or `'failed'` + `error_log`).
- Secret: ask user to add `ANTHROPIC_API_KEY` (only the Lovable AIAGENTS secret currently exists; spec explicitly requires Anthropic key).

## 3. Routes

Add to `App.tsx`:
- `/ingest` → `IngestDropzone`
- `/ingest/inbox` → `IngestInbox`
- `/ingest/:id` → `IngestReview`

## 4. Drop Zone (`/ingest`)

- Header + tagline.
- Dropzone (react-dropzone style, plain implementation) accepting `.eml,.msg,.pdf,.png,.jpg,.jpeg,.heic,.txt,.docx`, max 25MB.
- Textarea for paste.
- Auto-detect source_type from extension/mime; PDFs → extract text in browser using `pdfjs-dist` (already a likely dep; if not, install).
- Collapsible hints: festival select, concepts multi-chip (filtered by festival via `festival_contracts`), card_types multi-select, notes textarea.
- "Parse now" button: upload file to bucket at `{year}/{month}/{ingestion_id-placeholder}` (generate id client-side via `crypto.randomUUID()`), insert ingestion row, then `supabase.functions.invoke('parse-ingestion', { body: { ingestion_id }})`. Subscribe to row → on `status='parsed'` navigate to `/ingest/:id`.
- Recent inbox: last 5 with status pill, summary, click → review.

## 5. Review (`/ingest/:id`)

- Header strip: source icon, filename/subject, sender, hint badges, confidence color, status pill.
- AI summary card with festival match chips.
- Collapsible original content.
- Warnings panel (yellow) if any.
- Proposed updates list — each as a diff card:
  - Table icon + verb + festival/concept badges.
  - For UPDATE: fetch current row by `match_by`, show field-by-field diff (current muted → proposed highlighted).
  - For INSERT: list all proposed fields.
  - Reasoning + confidence.
  - Per-update: Approve / Edit (inline form writing into `human_edits`) / Reject / Convert-to-action.
- Questions-to-human: text inputs writing into `human_edits.qa_responses`.
- Sticky footer: Approve all / Reject all / **Apply changes** (disabled until all decisions made).
- Apply: invoke `apply_ingestion` RPC with curated update list; on success toast with affected entity links; on failure show retry.
- Realtime subscription on this row id.

## 6. Inbox (`/ingest/inbox`)

- Filter strip: status, festival multi-select, source type, date range, confidence slider.
- Stats cards: today count + success rate, week count + success rate, avg parse time, avg confidence.
- Table: timestamp, source preview, festival, summary, confidence, status, actions.
- Bulk: re-parse, delete.
- Realtime on the full table.

## 7. Integration

- `DashboardLayout.tsx` sidebar: add "Ingest" item with badge = count of `status='parsed'`.
- `DashboardHome.tsx`: enable the "Ingest email/PDF" quick action (was placeholder); link to `/ingest`. Add ingestion entries to activity feed (extend `useActivityFeed`).
- `CommandPalette.tsx`: add "Ingest intelligence" command + recent ingestions search.

## 8. Test Content

- After deploy, manually paste the Lisbet email (from spec) and verify 4 proposed updates appear (2 façade approvals + 2 action items with correct due dates).

## Technical Notes

- `claude-opus-4-7` per spec (will pass through; if Anthropic returns model error, fall back to `claude-opus-4-20250514`).
- `match_by` resolution lives in the SQL RPC, not the Edge Function, to keep apply atomic.
- Status transitions enforced via CHECK constraint already; UI uses optimistic updates with realtime as source of truth.
- Files not yet supported for full vision parse (Claude vision not enabled in v1) — image-only uploads land as `parsed` with empty proposed_updates and a question to the human.
- All UI uses existing shadcn primitives + design tokens — no new colors.

## Open Question

The spec says "We have an Anthropic API key in the environment as `ANTHROPIC_API_KEY`" — but the project secrets list only shows `AIAGENTS` (existing Claude key) and `LOVABLE_API_KEY`. I will use `ANTHROPIC_API_KEY` if present, else fall back to `AIAGENTS`. If neither works at runtime, I'll prompt to add the secret. Confirm if you'd prefer I require explicit `ANTHROPIC_API_KEY` from the start.
