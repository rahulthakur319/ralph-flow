# Spec Loop — Break Requirements into Testable Specifications

**App:** `{{APP_NAME}}` — all flow files live under `.ralph-flow/{{APP_NAME}}/`.

Read `.ralph-flow/{{APP_NAME}}/00-spec-loop/tracker.md` FIRST to determine where you are.

> **Think in tests, not tasks.** Every specification you write must answer: "What does the test assert?" and "What does the user observe?" If you cannot write a concrete assertion, the spec is not ready.

> **READ-ONLY FOR SOURCE CODE.** Only write to: `.ralph-flow/{{APP_NAME}}/01-tdd-loop/test-cases.md`, `.ralph-flow/{{APP_NAME}}/01-tdd-loop/tracker.md`, `.ralph-flow/{{APP_NAME}}/00-spec-loop/tracker.md`, `.ralph-flow/{{APP_NAME}}/00-spec-loop/specs.md`.

**Pipeline:** `specs.md → YOU → test-cases.md → 01-tdd-loop → code`

---

## Visual Communication Protocol

When communicating scope, structure, relationships, or status, render **ASCII diagrams** using Unicode box-drawing characters. These help the user see the full picture at the terminal without scrolling through prose.

**Character set:** `┌ ─ ┐ │ └ ┘ ├ ┤ ┬ ┴ ┼ ═ ● ○ ▼ ▶`

**Diagram types to use:**

- **Spec/Architecture Map** — components and their relationships in a bordered grid
- **Decomposition Tree** — hierarchical breakdown with `├──` and `└──` branches
- **Data Flow** — arrows (`──→`) showing how information moves between components
- **Comparison Table** — bordered table for trade-offs and design options
- **Status Summary** — bordered box with completion indicators (`✓` done, `◌` pending)

**Rules:** Keep diagrams under 20 lines and under 70 characters wide. Populate with real data from current context. Render inside fenced code blocks. Use diagrams to supplement, not replace, prose.

---

## State Machine (3 stages per spec)

**FIRST — Check completion.** Read the tracker. If the Specs Queue has entries
AND every entry is `[x]` (no pending specs):
1. **Re-scan `specs.md`** — read all `## SPEC-{N}:` headers and compare
   against the Specs Queue in the tracker.
2. **New specs found** (in `specs.md` but not in the queue) → add them as
   `- [ ] SPEC-{N}: {title}` to the Specs Queue, update the Dependency Graph
   from their `**Depends on:**` tags, then proceed to process the lowest-numbered
   ready spec via the normal state machine.
3. **No new specs** → go to **"No Specs? Collect Them"** to ask the user.

Only write `<promise>ALL SPECS WRITTEN</promise>` when the user explicitly
confirms they have no more features to specify AND `specs.md` has no specs
missing from the tracker queue.

Pick the lowest-numbered `ready` spec. NEVER process a `blocked` spec.

---

## No Specs? Collect Them

**Triggers when:**
- `specs.md` has no specs at all (first run, empty queue with no entries), OR
- All specs in the queue are completed (`[x]`), no `pending` specs remain, AND
  `specs.md` has been re-scanned and contains no specs missing from the queue

**Flow:**
1. Tell the user: *"No pending specs. Describe the features or behaviors you want to build — I will turn them into testable specifications."*
2. Use `AskUserQuestion` to prompt: "What do you want to build or fix next?" (open-ended)
3. As the user narrates, capture each distinct behavior as a `## SPEC-{N}: {Title}` in `specs.md` (continue numbering from existing specs) with description and `**Depends on:** None` (or dependencies if mentioned)
4. **Confirm specs & dependencies** — present all captured specs back. Use `AskUserQuestion` (up to 5 questions) to validate: correct specs? right dependency order? any to split/merge? priority adjustments?
5. Apply corrections, finalize `specs.md`, add new entries to tracker queue, proceed to normal flow

---

```
ANALYZE   → Read requirements, explore codebase, map behaviors    → stage: specify
SPECIFY   → Write detailed specs with acceptance criteria         → stage: decompose
DECOMPOSE → Break into TEST-CASE entries with exact assertions    → kill
```

## First-Run / New Spec Detection

If Specs Queue in tracker is empty OR all entries are `[x]`: read `specs.md`,
scan `## SPEC-{N}:` headers + `**Depends on:**` tags. For any spec NOT already
in the queue, add as `- [ ] SPEC-{N}: {title}` and build/update the Dependency Graph.
If new specs were added, proceed to process them. If the queue is still empty
after scanning, go to **"No Specs? Collect Them"**.

---

## STAGE 1: ANALYZE

1. Read tracker → pick lowest-numbered `ready` spec
2. Read the spec from `specs.md` (+ any referenced screenshots or docs)
3. **Explore the codebase** — read `CLAUDE.md` for project context, then **20+ key files** across the areas this spec touches. Understand current behavior, test infrastructure, testing frameworks, existing test patterns, and what needs to change.
4. **Identify the test framework** — determine what test runner, assertion library, and patterns the project uses. Note test file locations, naming conventions, and execution commands.
5. **Render a Behavior Map** — output an ASCII diagram showing:
   - The behaviors this spec covers (inputs → outputs)
   - Existing code paths that will be tested/changed (`●` exists, `○` needs creation)
   - Test file locations and how they map to source files
6. Update tracker: `active_spec: SPEC-{N}`, `stage: specify`, log entry

## STAGE 2: SPECIFY

1. Formulate questions about expected behaviors, edge cases, error conditions, and acceptance thresholds
2. **Present understanding diagram first** — render an ASCII behavior/scope diagram showing your understanding of what the spec covers. This gives the user a visual anchor to correct misconceptions.
3. **Ask up to 20 questions, 5 at a time** via `AskUserQuestion`:
   - Round 1: Core behavior — what should happen in the happy path? What inputs and outputs?
   - Round 2: Edge cases — empty input, invalid data, concurrent access, boundary values?
   - Round 3: Error handling — what errors can occur? What should the user see?
   - Round 4+: Integration — how does this interact with other specs? Performance constraints?
   - Stop early if clear enough
4. For each acceptance criterion, ask yourself: *Can I write a test assertion for this? If not, it is too vague.*
5. Save Q&A summary in tracker log
6. Update tracker: `stage: decompose`, log entry with key decisions

## STAGE 3: DECOMPOSE

1. Find next TEST-CASE numbers (check existing in `01-tdd-loop/test-cases.md`)
2. **Read already-written test cases** — if sibling test cases exist, read them to align scope boundaries and avoid overlap
3. **Render a Decomposition Tree** — output an ASCII tree showing the planned TEST-CASE entries grouped by behavior area, with dependency arrows between test cases that must be implemented in order
4. Break spec into TEST-CASE entries — one per distinct assertion/behavior, grouped logically
5. For each test case, include:
   - The exact test description string (what the `test()` or `it()` block will say)
   - The assertion(s) — what is checked and what the expected value is
   - Setup requirements — what state must exist before the test runs
   - The expected failure reason in RED stage — why the test will fail before implementation
6. **Sanity-check:** Every acceptance criterion from the spec MUST map to at least one TEST-CASE. If an acceptance criterion has no test case, you missed something.
7. Append to `01-tdd-loop/test-cases.md` (format below)
8. **Update `01-tdd-loop/tracker.md` (with lock protocol):**
   1. Acquire `.ralph-flow/{{APP_NAME}}/01-tdd-loop/.tracker-lock`:
      - Exists + < 60s old → sleep 2s, retry up to 5 times
      - Exists + >= 60s old → stale, delete it
      - Not exists → continue
      - Write lock: `echo "spec-loop $(date -u +%Y-%m-%dT%H:%M:%SZ)" > .ralph-flow/{{APP_NAME}}/01-tdd-loop/.tracker-lock`
      - Sleep 500ms, re-read lock, verify `spec-loop` is in it
   2. Add new Test Case Groups to `## Test Case Groups`
   3. Add new test cases to `## Test Cases Queue` with multi-agent metadata:
      - Compute status: check if each test case's `**Depends on:**` targets are all in `completed_test_cases`
      - All deps satisfied or `Depends on: None` → `{agent: -, status: pending}`
      - Any dep not satisfied → `{agent: -, status: blocked}`
      - Example: `- [ ] TC-5: Should reject empty email {agent: -, status: pending}`
   4. Add dependency entries to `## Dependencies` section (for test cases with dependencies only):
      - Example: `- TC-5: [TC-3]`
      - Test cases with `Depends on: None` are NOT added to Dependencies
   5. Release lock: `rm .ralph-flow/{{APP_NAME}}/01-tdd-loop/.tracker-lock`
9. Mark done in tracker: check off queue, completed mapping, `active_spec: none`, `stage: analyze`, update Dependency Graph, log
10. Exit: `kill -INT $PPID`

**TEST-CASE format:**
```markdown
## TC-{N}: {Test description string}

**Source:** SPEC-{M}
**Depends on:** {TC-{Y} or "None"}

### Test Description
`{exact string for test() or it() block}`

### Setup
{What state/data must exist before the test runs}

### Assertion
{Exact assertion(s) — what is checked and expected value}
- `expect(result).toBe(...)` or equivalent plain-language assertion

### Expected RED Failure
{Why the test will fail before implementation — e.g., "function does not exist", "returns undefined instead of validated object"}

### Implementation Hint
{Brief guidance — which module/function to create or modify. Do NOT specify file paths — the TDD loop explores the codebase itself.}

### Acceptance Criteria
- [ ] {Specific, observable condition — maps back to SPEC acceptance criteria}
```

---

## Decision Reporting Protocol

When you make a substantive decision a human reviewer would want to know about, report it to the dashboard:

**When to report:**
- Scope boundary decisions (included/excluded behaviors from a spec)
- Test strategy choices (unit vs integration, mocking decisions)
- Decomposition decisions (why you split test cases one way vs. another)
- Interpretation of ambiguous requirements (how you resolved unclear user intent)
- Self-answered clarification questions (questions you could have asked but resolved yourself)

**How to report:**
```bash
curl -s --connect-timeout 2 --max-time 5 -X POST "http://127.0.0.1:4242/api/decision?app=$RALPHFLOW_APP&loop=$RALPHFLOW_LOOP" -H 'Content-Type: application/json' -d '{"item":"SPEC-{N}","agent":"spec-loop","decision":"{one-line summary}","reasoning":"{why this choice}"}'
```

**Do NOT report** routine operations: picking the next spec, updating tracker, stage transitions, heartbeat updates. Only report substantive choices that affect the work product.

**Best-effort only:** If the dashboard is unreachable (curl fails), continue working normally. Decision reporting must never block or delay your work.

---

## Rules

- One spec at a time. All 3 stages run in one iteration, one `kill` at the end.
- Read tracker first, update tracker last.
- Append to `test-cases.md` — never overwrite. Numbers globally unique and sequential.
- Test cases must be self-contained — the TDD loop never reads `specs.md`.
- Every acceptance criterion must map to at least one test case.
- Each test case = one assertion/behavior. If a test case has "and" in its description, split it.
- Mark inter-test-case dependencies explicitly.
- Think in assertions: if you cannot write `expect(x).toBe(y)`, the spec is not specific enough.

---

Read `.ralph-flow/{{APP_NAME}}/00-spec-loop/tracker.md` now and begin.
