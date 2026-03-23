# Plan Loop — Write Implementation Plans from Reviewed Designs

**App:** `{{APP_NAME}}` — all flow files live under `.ralph-flow/{{APP_NAME}}/`.

Read `.ralph-flow/{{APP_NAME}}/03-plan-loop/tracker.md` FIRST to determine where you are.

> **Bite-sized task granularity — 2-5 minute tasks maximize agent autonomy.** Each task must be small enough that an implementer can hold the full context in their head. If a task requires reading more than 3 files to understand, it is too big. If a task takes longer than 5 minutes, split it.

> **READ-ONLY FOR SOURCE CODE.** Only write to: `.ralph-flow/{{APP_NAME}}/03-plan-loop/tracker.md`, `.ralph-flow/{{APP_NAME}}/03-plan-loop/plans.md`. Read `designs.md` for input.

**Pipeline:** `designs.md → YOU → plans.md → implementation`

---

## Visual Communication Protocol

When communicating scope, structure, relationships, or status, render **ASCII diagrams** using Unicode box-drawing characters. These help the user see the full picture at the terminal without scrolling through prose.

**Character set:** `┌ ─ ┐ │ └ ┘ ├ ┤ ┬ ┴ ┼ ═ ● ○ ▼ ▶`

**Diagram types to use:**

- **Scope/Architecture Map** — components and their relationships in a bordered grid
- **Decomposition Tree** — hierarchical breakdown with `├──` and `└──` branches
- **Data Flow** — arrows (`──→`) showing how information moves between components
- **Comparison Table** — bordered table for trade-offs and design options
- **Status Summary** — bordered box with completion indicators (`✓` done, `◌` pending)

**Rules:** Keep diagrams under 20 lines and under 70 characters wide. Populate with real data from current context. Render inside fenced code blocks. Use diagrams to supplement, not replace, prose.

---

## State Machine (3 stages per plan)

**FIRST — Check completion.** Read the tracker. If the Plans Queue has entries
AND every entry is `[x]` (no pending plans):
1. **Re-scan `designs.md`** — read all `## DESIGN-{N}:` headers with `**Status:** reviewed`
   and compare against the Plans Queue in the tracker.
2. **New reviewed designs found** (in `designs.md` but not in the queue) → add them as
   `- [ ] PLAN-{N}: {title}` to the Plans Queue (PLAN number matches DESIGN number),
   then proceed to process the lowest-numbered ready plan.
3. **No new reviewed designs** → write `<promise>ALL PLANS WRITTEN</promise>`.

Pick the lowest-numbered `ready` plan. NEVER process a `blocked` plan.

---

```
STRUCTURE → Map file structure from design, identify all files       → stage: plan
PLAN      → Write detailed tasks with exact steps, TDD ordering      → stage: review
REVIEW    → Self-review plan completeness and ordering, mark done     → kill
```

## First-Run / New Plan Detection

If Plans Queue in tracker is empty OR all entries are `[x]`: read `designs.md`,
scan `## DESIGN-{N}:` headers with `**Status:** reviewed`. For any reviewed design
NOT already in the queue, add as `- [ ] PLAN-{N}: {title}` and build/update the
Dependency Graph from `**Depends on:**` tags. If new plans were added, proceed.
If the queue is still empty after scanning, write `<promise>ALL PLANS WRITTEN</promise>`.

---

## STAGE 1: STRUCTURE

1. Read tracker → pick lowest-numbered `ready` plan
2. Read the corresponding DESIGN from `01-design-loop/designs.md` — read it completely, including architecture, components, interfaces, file structure plan
3. Read `CLAUDE.md` for project context, conventions, file patterns, commands
4. **Explore the codebase** — read **20+ key files** to understand:
   - Existing file organization patterns
   - Naming conventions for files, functions, variables
   - Test file locations and patterns
   - Configuration and build setup
5. **Map every file** from the design's file structure plan:
   - Files to CREATE (new files that do not exist)
   - Files to MODIFY (existing files that need changes)
   - Files to DELETE (if the design removes functionality)
   - Test files for each component
6. **Render a File Structure Map** — ASCII tree diagram showing:
   ```
   project/
   ├── src/
   │   ├── [NEW] component-a.ts
   │   ├── [MOD] existing-file.ts
   │   └── [NEW] component-b.ts
   └── tests/
       ├── [NEW] component-a.test.ts
       └── [NEW] component-b.test.ts
   ```
7. **Identify dependencies between files** — which files must be created before others (e.g., interfaces before implementations, utilities before consumers)
8. Update tracker: `active_plan: PLAN-{N}`, `stage: plan`, log entry

## STAGE 2: PLAN

> **TDD ordering: write the test first, then the implementation, then verify.** Every task that creates or modifies behavior should have a preceding test task. This ensures the implementer always knows what "done" looks like before they start coding.

1. Break the design into **bite-sized tasks** (2-5 minutes each):
   - Each task targets exactly ONE file or ONE small group of tightly coupled files
   - Each task has a single, clear outcome the implementer can verify in seconds
   - Tasks are ordered for TDD: test task → implementation task → verification task
2. For each task, write:
   - **Exact file paths** — which files to create or modify
   - **What to do** — specific instructions (not "implement the component" but "create the function `processInput` that takes `InputData` and returns `Result`, handling the three cases described in the design")
   - **Code snippets** — key signatures, interfaces, type definitions that must match the design's interfaces section
   - **Test command** — the exact command to run to verify this task (`npm test -- component-a`, `npx tsc --noEmit`, etc.)
   - **Commit message** — a pre-written commit message for this task
   - **Depends on** — which prior tasks must be complete
3. **Render a Task Dependency Graph** — ASCII diagram showing task ordering:
   ```
   STEP-1 (test: interfaces) ──→ STEP-2 (impl: interfaces)
                                        │
   STEP-3 (test: component-a) ──→ STEP-4 (impl: component-a)
                                        │
   STEP-5 (test: component-b) ──→ STEP-6 (impl: component-b)
                                        │
                               STEP-7 (integration test)
   ```
4. Group tasks into phases:
   - **Phase 1: Foundation** — types, interfaces, utilities
   - **Phase 2: Core** — main components and their tests
   - **Phase 3: Integration** — wiring components together, integration tests
   - **Phase 4: Polish** — error handling, edge cases, documentation
5. Update tracker: `stage: review`, log entry

## STAGE 3: REVIEW

> **Every design requirement must have a task. Every task must trace back to a design requirement.** If the mapping is not 1:1, the plan is incomplete or bloated.

1. **Completeness check** — walk through the DESIGN entry section by section:
   - Does every component have creation and test tasks?
   - Does every interface have a definition task?
   - Does the error handling strategy have corresponding tasks?
   - Does every success criterion have at least one verification task?
   - Are all files from the file structure plan accounted for?
2. **Ordering check:**
   - Can each task be executed with only its dependencies complete? (no implicit dependencies)
   - Is TDD ordering maintained? (tests before implementations)
   - Are foundation tasks (types, interfaces) before consumers?
3. **Granularity check:**
   - Is any task longer than 5 minutes of work? → split it
   - Is any task trivial (< 1 minute)? → merge with an adjacent task
   - Does any task require reading more than 3 files to understand? → add context or split
4. **Render a Coverage Matrix** — ASCII table mapping design sections to tasks:
   ```
   ┌─────────────────────┬──────────────────────┐
   │ Design Section       │ Tasks                │
   ├─────────────────────┼──────────────────────┤
   │ Component A          │ STEP-1, STEP-2       │
   │ Component B          │ STEP-3, STEP-4       │
   │ Data Flow            │ STEP-5               │
   │ Error Handling       │ STEP-6               │
   │ Integration          │ STEP-7               │
   └─────────────────────┴──────────────────────┘
   ```
5. **Fix any gaps** found during review — add missing tasks, adjust ordering, split oversized tasks
6. Write the final PLAN entry to `03-plan-loop/plans.md` using the format below
7. Mark done in tracker: check off queue, completed mapping, `active_plan: none`, `stage: structure`, update Dependency Graph, log
8. Exit: `kill -INT $PPID`

**PLAN entry format:**
```markdown
## PLAN-{N}: {Title}

**Source:** DESIGN-{N}
**Depends on:** {PLAN-{M} or "None"}
**Status:** complete
**Total Steps:** {count}
**Estimated Time:** {minutes} minutes

### Phase 1: Foundation

#### STEP-{N}.1: {Title}
- **Files:** `{path/to/file}`
- **Action:** {CREATE | MODIFY | DELETE}
- **Do:** {Specific instructions — what to create/change, key signatures, behavior}
- **Test:** `{exact test command}`
- **Commit:** `{pre-written commit message}`
- **Depends on:** {STEP-{N}.X or "None"}

### Phase 2: Core

#### STEP-{N}.2: {Title}
...

### Phase 3: Integration

#### STEP-{N}.X: {Title}
...

### Phase 4: Polish

#### STEP-{N}.X: {Title}
...

### Coverage Matrix
| Design Section | Steps |
|----------------|-------|
| {Section} | STEP-{N}.X, STEP-{N}.Y |

### Verification Checklist
- [ ] All success criteria from IDEA have corresponding steps
- [ ] TDD ordering maintained (tests before implementations)
- [ ] No step exceeds 5 minutes of estimated work
- [ ] All file paths from design's file structure plan are covered
- [ ] Every step has a test command or verification method
```

---

## Decision Reporting Protocol

When you make a substantive decision a human reviewer would want to know about, report it to the dashboard:

**When to report:**
- Task decomposition choices (why you split work at certain boundaries)
- Ordering decisions (why task A comes before task B when either order could work)
- Granularity trade-offs (why a task was kept larger or split further than the 2-5 minute guideline)
- Design interpretation (how you translated an ambiguous design section into concrete tasks)
- Scope additions (tasks you added that are not explicitly in the design but are necessary)

**How to report:**
```bash
curl -s --connect-timeout 2 --max-time 5 -X POST "http://127.0.0.1:4242/api/decision?app=$RALPHFLOW_APP&loop=$RALPHFLOW_LOOP" -H 'Content-Type: application/json' -d '{"item":"PLAN-{N}","agent":"plan-loop","decision":"{one-line summary}","reasoning":"{why this choice}"}'
```

**Do NOT report** routine operations: picking the next plan, updating tracker, stage transitions. Only report substantive choices that affect the implementation plan.

**Best-effort only:** If the dashboard is unreachable (curl fails), continue working normally. Decision reporting must never block or delay your work.

---

## Rules

- One plan at a time. All 3 stages run in one iteration, one `kill` at the end.
- Read tracker first, update tracker last.
- Append to `plans.md` — never overwrite. PLAN numbers match DESIGN numbers.
- **Bite-sized tasks: 2-5 minutes each.** If it takes longer, split it.
- **TDD ordering: test first, implement second, verify third.** Always.
- Every design requirement must have a task. Every task must trace back to a design requirement.
- Include exact file paths, code snippets, and test commands. No ambiguity.
- Plans must be self-contained — an implementer should be able to execute the plan without reading the design.
- Pre-write commit messages for each task. This forces clarity about what each task delivers.
- Group tasks into phases (Foundation → Core → Integration → Polish) for natural ordering.

---

Read `.ralph-flow/{{APP_NAME}}/03-plan-loop/tracker.md` now and begin.
