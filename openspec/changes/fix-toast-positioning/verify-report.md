## Verification Report: fix-toast-positioning

Verified against commit `c3c4493` ("fix: restore floating position for toast notifications").
Working tree clean at start of verification. `openspec validate fix-toast-positioning` → valid.

Note: `openspec instructions verify --change …` is not available in this repo's `spec-driven`
schema (valid artifacts: proposal, specs, design, tasks). Fell back to `openspec status --change`
plus `openspec instructions apply --change`, per CLAUDE.md's documented step 2.

### Completeness

`tasks.md` — 4 checkboxes, 4 done, 0 pending (matches `openspec instructions apply`'s
`progress: {total: 4, complete: 4, remaining: 0}`, `state: all_done`).

| Task | Status | Evidence in repo |
|---|---|---|
| 1.1 layer statement + vendor `@import` in `style.css` | DONE | `apps/frontend/src/style.css:1-3`, exactly the D1 text; the two pre-existing imports were not reordered |
| 2.1 manual dev-server check, incl. deliberate break | DONE (manual) | Not machine-reproducible; see Build & Tests for the artifact-level substitute |
| 2.2 remove `relative` from `Sonner.vue` | DONE | `grep -n relative apps/frontend/src/components/ui/sonner/Sonner.vue` → no match; diff confirms the single-token removal |
| 2.3 typecheck + test | DONE | Re-run this session, both exit 0 — see below |

No core implementation task is unchecked.

### Correctness

Delta spec: `openspec/changes/fix-toast-positioning/specs/global-error-handling/spec.md`, one
MODIFIED requirement. It correctly targets an existing requirement header
(`### Requirement: Global error notification for validation failures`, present at
`openspec/specs/global-error-handling/spec.md:6`) and preserves the original scenario verbatim
while adding one.

**Requirement text** — "The Toast SHALL render as a fixed-position overlay above page content,
outside the normal document flow": SATISFIED at the artifact level. In the emitted
`apps/frontend/dist/assets/index-C29qDeWP.css`, `[data-sonner-toaster]` carries `position:fixed`
inside the `@layer vendor` block (byte 7445, within the vendor block spanning 6425–21324), plus the
mobile-viewport `position:fixed` at 16115. `z-index` and the `--offset-*` custom properties ship
with it. 28 `data-sonner-toaster` and 90 `data-sonner-toast` selector occurrences survived
compilation intact.

**Scenario 1, "Malformed external data received"** — unchanged by this delta; pre-existing behavior,
not re-verified here (out of this change's blast radius).

**Scenario 2, "Toast renders as a floating overlay, not in document flow"** — see WARNING W3. The
mechanism is proven present in the shipped CSS and the layout outcome was confirmed by the user in
the running app, but no automated test exercises it at runtime.

### Coherence

- **D1 (import into a `vendor` layer declared before `utilities`, not via `main.ts`)** — HONORED and
  empirically confirmed, not merely asserted. `@layer` block order in the built CSS is
  `properties(66) → theme(1971) → base(2603) → components(6407) → vendor(6425) → utilities(21324)`.
  `vendor` precedes `utilities`, so `Sonner.vue`'s unimportant token utilities (`bg-surface`,
  `border-border-soft`, `shadow-modal`, `rounded-xl`, `text-fg`) outrank the vendor sheet's
  `[data-sonner-toast][data-styled=true]` defaults, while `position`/`z-index` — which no utility
  sets — still come from the vendor sheet. This is exactly D1's stated intent.
- **Rejected alternatives were genuinely not implemented.** `grep -rn "vue-sonner/style.css"
  apps/frontend/src/` returns exactly one hit, the `style.css` `@import` — no `main.ts` JS-side
  import. `grep -rn "data-sonner" apps/frontend/src/` returns nothing — no hand-written
  `[data-sonner-toaster] { position: fixed }` override, and no vendored copy of `lib/index.css`
  under `src/styles/`. The "add `!` to colliding utilities" alternative was likewise not taken: the
  colliding theming utilities in `Sonner.vue:20` remain unimportant (`group-[.toaster]:bg-surface`
  etc.), relying on the layer order as designed.
- **D2 (no purge/tree-shaking guard needed)** — CONFIRMED. The sheet ships in the entry CSS asset
  with all selectors intact; no `vite.config.ts` change was made or needed.
- **D3 (verification is manual and visual)** — followed as written, and its premise is sound:
  `happy-dom` computes neither cross-layer cascade nor layout geometry, so a vitest assertion here
  would be precisely the vacuous pass CLAUDE.md rule 3 warns about. D3 step 5 (build and grep the
  emitted CSS for `@layer vendor` and `data-sonner-toaster`) was independently re-executed this
  session and passes.
- **D4 (rules 1–7 not engaged)** — CONFIRMED. The diff touches two frontend presentation files and
  `turbo.json`; no TypeScript type, route, DuckDB view, ledger path, or `sourceProfile` declaration
  is involved.
- **D5 (remove hardcoded `relative`)** — HONORED, and its cascade diagnosis verified line-by-line in
  the built CSS. The vendor layer contains `[data-sonner-toast]{…position:absolute…}`; `@layer
  utilities` contains `.relative{position:relative}` (unimportant) and
  `.\!absolute{position:absolute!important}`. With `vendor` below `utilities` and neither the vendor
  rule nor `.relative` marked important, `.relative` would indeed have won and dropped the `<li>`
  back into flow, where its `!w-max !max-w-[60vw]` (both important, hence layer-immune) overflows the
  `<ol>`. Removing `relative` leaves the vendor `position:absolute` in effect, which is a valid
  containing block for the close button's `!absolute` — so nothing had to compensate, exactly as D5
  claims. D5's "same change, not a new one" justification holds: the collision was unreachable before
  D1 shipped.

### Architectural Rules

Checked against CLAUDE.md rules 1–9 (`.claude/skills/domain-architecture/SKILL.md` reviewed for
layering criteria; no layer boundary is crossed by this diff).

| Rule | Verdict |
|---|---|
| 1 — no `any` | PASS. `grep -nE ": any\|as any\|<any>\|, any>"` over both touched frontend files: no match. No TypeScript was added at all. |
| 2 — hexagonal layering | N/A. Presentation-only; no port, adapter, or `repositories/` directory involved. |
| 3 — domain imports nothing external | N/A. No `domain/` or `core-domain` file touched. |
| 4 — money never a raw float | N/A. No monetary value read, formatted, or converted. |
| 5 — discriminated unions | N/A. No new type or boolean+optional-payload shape. |
| 6 — tax FIFO vs. custody ordering | N/A. No FIFO view, ledger query, or transfer path touched. |
| 7 — `sourceProfile/` declarations | N/A. No source convention read or written. |
| **8 — long-term solutions, no patches** | **PASS, and this is the rule that binds.** The fix consumes `vue-sonner@2.0.9`'s own published `./style.css` export (`node_modules/.pnpm/vue-sonner@2.0.9/node_modules/vue-sonner/lib/index.css`, 18 KB) unmodified and unvendored. Zero hand-rolled `[data-sonner-*]` CSS in `src/`. The cascade problem was solved structurally once, by declaring a layer order, rather than by scattering `!important` at each collision — the alternative D1 explicitly rejects on rule-8 grounds. D5 likewise deletes a local override rather than adding a counter-override on top of it. |
| 9 — no comments restating code / naming tasks / pointing at specs | PASS for the diff (no comment added or changed). See SUGGESTION S2 for a pre-existing violation adjacent to the edit. |
| `domain-uiux` / `DESIGN.md` | PASS. No Tailwind class or token invented; the change only *removes* one utility. Color ownership stays with `Sonner.vue`'s token classes, which the layer order protects. |

### Build & Tests (real exit codes, not inferred)

All three commands executed this session under Node **v24.16.0** (nvm; the shell default v20.20.0
would not satisfy `engines`).

| Command | Exit | Result |
|---|---|---|
| `pnpm --filter @kryptofolio/frontend typecheck` (→ `vue-tsc --build --force`) | **0** | Clean. Uses `--build --force`, not the bare `--noEmit` that silently checks zero files on this repo's solution-style tsconfig. |
| `pnpm --filter @kryptofolio/frontend test` (→ `vitest run` v4.1.8) | **0** | **75 test files passed (75); 519 tests passed (519); 0 failed, 0 skipped.** Duration 24.07s. |
| `pnpm --filter @kryptofolio/frontend build` | **0** | Emitted `dist/assets/index-C29qDeWP.css`, used for the D3-step-5 cascade evidence above. |

Backend/packages were not typechecked: this change touches no file outside `apps/frontend/src/`
except `turbo.json`, which is not typechecked by any package.

No test in the suite exercises toast positioning — the 519 passing tests are the pre-existing
baseline and are unrelated to this change's behavior. Their green status proves no regression, not
the fix.

### Issues

**CRITICAL** — none.

**WARNING**

- **W1 — Undeclared change shipped in the same commit.** `turbo.json` flips `"ui": "tui"` →
  `"ui": "stream"`. This appears in the commit body but in no artifact: not in `proposal.md`'s
  Impact/What Changes, not in `design.md`, not in `tasks.md`, not in the spec delta. The change
  itself is benign and well-motivated (the interactive TUI hangs when Turbo runs non-interactively
  from the Husky pre-commit hook), but it is repo-wide developer-tooling scope riding along inside a
  frontend CSS fix, and it will be invisible to anyone reading only the change directory. It should
  be either declared in `proposal.md` before archive or split into its own commit.
- **W2 — `proposal.md` contradicts the shipped implementation and was never reconciled.** It states
  under *What Changes*: "No change to the `Toaster` wrapper
  (`apps/frontend/src/components/ui/sonner/Sonner.vue`)", and `design.md`'s Non-Goals repeat it
  ("No change to `Sonner.vue`"), as does the Migration Plan ("Single edit to
  `apps/frontend/src/style.css`"). D5 and task 2.2 supersede all three, but only D5 says so. A reader
  arriving at the proposal or the Non-Goals list gets a false statement. D5's own placement is fine;
  the stale assertions upstream of it are not.
- **W3 — The new spec scenario is UNTESTED at runtime.** "Toast renders as a floating overlay, not
  in document flow" is proven only by (a) inspection of the built CSS and (b) a manual user check
  ("ahora si"). No automated test asserts it, so nothing prevents a future regression — precisely the
  failure mode this change exists to fix, which had gone unnoticed until a human looked. D3's
  reasoning for skipping a `happy-dom` assertion is correct and should not be overturned, but a
  cheap, non-vacuous guard is available and absent: a build-artifact test that compiles
  `src/style.css` and asserts the `@layer vendor` block precedes `@layer utilities` and contains
  `[data-sonner-toaster]{…position:fixed…}`. That would have caught both the missing import and a
  future accidental deletion of the load-bearing line-1 layer statement — a risk `design.md` itself
  flags ("easy to delete"). Recorded as a warning, not a critical: the shipped behavior is correct
  and was confirmed by a human.

**SUGGESTION**

- **S1** — `openspec/changes/fix-toast-positioning/resume-apply.md` is committed working scratch from
  `/opsx:apply`. Delete it before `/opsx:archive` so it does not land in `openspec/changes/archive/`.
- **S2** — `apps/frontend/src/components/ui/sonner/Sonner.vue:2-4` carries
  `/** Sonner — Component description. */`, a comment that restates the filename and explains
  nothing (rule 9). Pre-existing, not introduced here, and therefore not a finding against this
  change — but it sits two lines above the line this change edited and is a free cleanup.
- **S3** — `openspec/specs/global-error-handling/spec.md:4` still reads "TBD - created by archiving
  change hex-arch-zod-refactor. Update Purpose after archive." Unrelated to this change; worth
  fixing whenever that capability is next touched.

### Verdict — PASS WITH WARNINGS

The implementation matches the proposal, the design decisions D1–D5, and the spec delta. The
cascade mechanism the design reasons about was verified empirically in the emitted stylesheet
rather than taken on trust, and every rejected alternative was confirmed genuinely absent from the
tree. Rule 8 is satisfied in the strong sense: the fix is the library's own supported wiring plus
the removal of a local override, with no hand-written positioning CSS anywhere in `src/`. Typecheck,
tests, and build were all executed this session and all exited 0.

The three warnings are documentation- and coverage-shaped, not correctness-shaped. W2 (stale
"no change to `Sonner.vue`" claims in `proposal.md` and `design.md`'s Non-Goals) should be corrected
before archive, since the delta merges into the authoritative specs and the proposal remains the
historical record. W1 should be declared or split out. W3 is a judgement call worth making
deliberately rather than by default.
