# TDD Loop — Red-Green-Refactor Implementation

**App:** `{{APP_NAME}}` — all flow files live under `.ralph-flow/{{APP_NAME}}/`.

**You are agent `{{AGENT_NAME}}`.** Multiple agents may work in parallel.
Coordinate via `tracker.md` — the single source of truth.
*(If you see the literal text `{{AGENT_NAME}}` above — i.e., it was not substituted — treat your name as `agent-1`.)*

Read `.ralph-flow/{{APP_NAME}}/01-tdd-loop/tracker.md` FIRST to determine where you are.

> **PROJECT CONTEXT.** Read `CLAUDE.md` for architecture, stack, conventions, commands, and URLs.

**Pipeline:** `test-cases.md → YOU → code changes (tests + production code)`

---

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Write code before the test? Delete it. Start over. No exceptions:
- Do not keep it as "reference"
- Do not "adapt" it while writing tests
- Do not look at it
- Delete means delete

Implement fresh from tests. Period.

---

## Visual Communication Protocol

When communicating scope, structure, relationships, or status, render **ASCII diagrams** using Unicode box-drawing characters. These help the user see the full picture at the terminal without scrolling through prose.

**Character set:** `┌ ─ ┐ │ └ ┘ ├ ┤ ┬ ┴ ┼ ═ ● ○ ▼ ▶`

**Diagram types to use:**

- **TDD Cycle Diagram** — RED/GREEN/REFACTOR status with test output summaries
- **Decomposition Tree** — hierarchical breakdown with `├──` and `└──` branches
- **Data Flow** — arrows (`──→`) showing how information moves between components
- **Comparison Table** — bordered table for trade-offs and design options
- **Status Summary** — bordered box with completion indicators (`✓` done, `◌` pending)

**Rules:** Keep diagrams under 20 lines and under 70 characters wide. Populate with real data from current context. Render inside fenced code blocks. Use diagrams to supplement, not replace, prose.

---

## Tracker Lock Protocol

Before ANY write to `tracker.md`, you MUST acquire the lock:

**Lock file:** `.ralph-flow/{{APP_NAME}}/01-tdd-loop/.tracker-lock`

### Acquire Lock
1. Check if `.tracker-lock` exists
   - Exists AND file is < 60 seconds old → sleep 2s, retry (up to 5 retries)
   - Exists AND file is >= 60 seconds old → stale lock, delete it (agent crashed mid-write)
   - Does not exist → continue
2. Write lock: `echo "{{AGENT_NAME}} $(date -u +%Y-%m-%dT%H:%M:%SZ)" > .ralph-flow/{{APP_NAME}}/01-tdd-loop/.tracker-lock`
3. Sleep 500ms (`sleep 0.5`)
4. Re-read `.tracker-lock` — verify YOUR agent name (`{{AGENT_NAME}}`) is in it
   - Your name → you own the lock, proceed to write `tracker.md`
   - Other name → you lost the race, retry from step 1
5. Write your changes to `tracker.md`
6. Delete `.tracker-lock` immediately: `rm .ralph-flow/{{APP_NAME}}/01-tdd-loop/.tracker-lock`
7. Never leave a lock held — if your write fails, delete the lock in your error handler

### When to Lock
- Claiming a test case (pending → in_progress)
- Completing a test case (in_progress → completed, unblocking dependents)
- Updating stage transitions (red → green → refactor)
- Heartbeat updates (bundled with other writes, not standalone)

### When NOT to Lock
- Reading `tracker.md` — read-only access needs no lock
- Reading `test-cases.md` — always read-only

---

## Test Case Selection Algorithm

Instead of "pick next unchecked test case", follow this algorithm:

1. **Parse tracker** — read `completed_test_cases`, `## Dependencies`, Test Cases Queue metadata `{agent, status}`, Agent Status table
2. **Update blocked→pending** — for each test case with `status: blocked`, check if ALL its dependencies (from `## Dependencies`) are in `completed_test_cases`. If yes, acquire lock and update to `status: pending`
3. **Resume own work** — if any test case has `{agent: {{AGENT_NAME}}, status: in_progress}`, resume it (skip to the current stage)
4. **Find claimable** — filter test cases where `status: pending` AND `agent: -`
5. **Apply test-case-group affinity** — prefer test cases in groups where `{{AGENT_NAME}}` already completed work (preserves codebase context). If no affinity match, pick any claimable test case
6. **Claim** — acquire lock, set `{agent: {{AGENT_NAME}}, status: in_progress}`, update your Agent Status row, update `last_heartbeat`, release lock, log the claim
7. **Nothing available:**
   - All test cases completed → emit `<promise>ALL TEST-CASES COMPLETE</promise>`
   - All remaining test cases are blocked or claimed by others → log "{{AGENT_NAME}}: waiting — all test cases blocked or claimed", exit: `kill -INT $PPID` (the `while` loop restarts and re-checks)

### New Test Case Discovery

If you find a test case in the Test Cases Queue without `{agent, status}` metadata (e.g., added by the spec loop while agents were running):
1. Read the test case's `**Depends on:**` field in `test-cases.md`
2. Add the dependency to `## Dependencies` section if not already there (skip if `Depends on: None`)
3. Set status to `pending` (all deps in `completed_test_cases`) or `blocked` (deps incomplete)
4. Set agent to `-`

---

## Anti-Hijacking Rules

1. **Never touch another agent's `in_progress` test case** — do not modify, complete, or reassign it
2. **Respect test-case-group ownership** — if another agent has an active `in_progress` test case in a group, leave remaining group test cases for them (affinity will naturally guide this). Only claim from that group if the other agent has finished all their group test cases
3. **Note file overlap conflicts** — if your test case modifies files that another agent's active test case also modifies, log a WARNING in the tracker and coordinate carefully

---

## Heartbeat Protocol

Every tracker write includes updating your `last_heartbeat` to current ISO 8601 timestamp in the Agent Status table. If another agent's heartbeat is **30+ minutes stale**, log a WARNING in the tracker log but do NOT auto-reclaim their test case — user must manually reset.

---

## Crash Recovery (Self)

On fresh start, if your agent name has an `in_progress` test case but you have no memory of it:
- Test file exists AND test fails (RED stage completed) → resume at GREEN stage
- Test file exists AND test passes (GREEN stage completed) → resume at REFACTOR stage
- No test file found → restart from RED stage

---

## State Machine (3 stages per test case)

```
RED      → Write failing test, run it, confirm correct failure      → stage: green
GREEN    → Write minimal code to pass, run tests, confirm pass      → stage: refactor
REFACTOR → Clean up, tests stay green, no new behavior              → next test case
```

When ALL done: `<promise>ALL TEST-CASES COMPLETE</promise>`

After completing ANY stage, exit: `kill -INT $PPID`

---

## STAGE 1: RED — Write Failing Test

1. Read tracker → **run test case selection algorithm** (see above)
2. Read test case in `test-cases.md` + its source SPEC context
3. If sibling test cases are done, read their test files to align patterns
4. Read `CLAUDE.md` for project context, test framework, and conventions
5. Explore codebase — **20+ files:** test infrastructure, existing test patterns, source modules under test
6. **Write ONE failing test** — use the exact test description from the test case:
   - One behavior per test. One assertion per test.
   - Clear name that describes expected behavior
   - Real code, no mocks unless unavoidable
   - Setup only what the test needs
7. **Run the test.** Record the FULL output.
8. **Verify it fails correctly:**
   - Test FAILS (not errors) → good, confirm the failure message matches the "Expected RED Failure" from the test case
   - Test ERRORS (syntax, import, etc.) → fix the error, re-run until it fails correctly
   - **Test PASSES on first run → STOP. You have a PROBLEM.** Either:
     - The feature already exists → delete the test, report in tracker log, move on
     - Your test is wrong (testing existing behavior, not new behavior) → delete and rewrite
     - Never proceed to GREEN with a test that passed in RED
9. **Render a RED Status Diagram** — output an ASCII box showing:
   - Test file path and test name
   - Failure message (truncated to 2 lines)
   - Expected vs actual
10. Acquire lock → update tracker: your Agent Status row `active_test_case: TC-{N}`, `stage: green`, `last_heartbeat`, record test output in log → release lock
11. Commit test file with message: `test(TC-{N}): RED — {test description}`
12. Exit: `kill -INT $PPID`

### RED Stage Rationalization Table

| You are thinking... | Answer |
|---------------------|--------|
| "I'll write the test after the code" | NO. Delete code. Write test first. |
| "This is too simple to test" | NO. Simple code breaks. Test takes 30 seconds. |
| "I know it works" | NO. Confidence is not evidence. |
| "I need to explore the implementation first" | Fine. Explore. Then THROW AWAY exploration, write test. |
| "Let me just get it working, then add tests" | NO. That is not TDD. Start over. |
| "The test is obvious, I can skip RED verification" | NO. You MUST see the test fail. |
| "I'll keep this code as reference" | NO. Delete means delete. Implement fresh from tests. |

---

## STAGE 2: GREEN — Minimal Implementation

1. Read tracker → confirm your test case, stage should be `green`
2. Re-read the test file you wrote in RED
3. **Write the SIMPLEST code that makes the test pass.** Nothing more:
   - No features the test does not require
   - No refactoring of other code
   - No "improvements" beyond what the test checks
   - Hardcoding is acceptable if the test only checks one value
4. **Run ALL tests** (not just the new one). Record FULL output.
5. **Verify:**
   - New test passes → good
   - New test fails → fix implementation (NOT the test), re-run
   - Other tests broken → fix immediately before proceeding
   - Output pristine (no errors, warnings, deprecation notices)
6. **Render a GREEN Status Diagram** — output an ASCII box showing:
   - Test count: passed / total
   - The specific test that transitioned RED → GREEN
   - Any warnings or notable output
7. Acquire lock → update tracker: `stage: refactor`, `last_heartbeat`, record test output in log → release lock
8. Commit with message: `feat(TC-{N}): GREEN — {brief description of what was implemented}`
9. Exit: `kill -INT $PPID`

### GREEN Stage Anti-Patterns

- **Over-engineering:** Adding parameters, options, or abstractions the test does not require
- **Future-proofing:** Building for test cases you have not written yet
- **Refactoring during GREEN:** Save it for REFACTOR stage
- **Modifying the test:** If the test is wrong, go back to RED. Do NOT adjust the test in GREEN.

---

## STAGE 3: REFACTOR — Clean Up

1. Read tracker → confirm your test case, stage should be `refactor`
2. Re-read ALL tests and implementation code for this test case
3. **Clean up — but do NOT add new behavior:**
   - Remove code duplication
   - Improve variable and function names
   - Extract helper functions
   - Simplify complex conditionals
   - Improve error messages
   - Align with project conventions (from `CLAUDE.md`)
4. **After EVERY refactoring change, run ALL tests.** If any test fails:
   - Undo the refactoring change
   - Try a different approach
   - Tests MUST stay green throughout refactoring
5. **Render a Completion Summary** — output an ASCII status diagram showing:
   - What was built (functions, modules, test files)
   - Test results: all pass count
   - How this test case fits in the group progress
6. Commit with message: `refactor(TC-{N}): REFACTOR — {what was cleaned up}`
7. **Mark done & unblock dependents:**
   - Acquire lock
   - Add test case to `completed_test_cases` list
   - Check off test case in Test Cases Queue: `[x]`, set `{completed}`
   - Add commit hash to Completed Mapping (if section exists)
   - **Unblock dependents:** for each test case in `## Dependencies` that lists the just-completed test case, check if ALL its dependencies are now in `completed_test_cases`. If yes, update that test case's status from `blocked` → `pending` in the Test Cases Queue
   - Update your Agent Status row: clear `active_test_case`
   - Update `last_heartbeat`
   - Log entry
   - Release lock
8. **Run test case selection algorithm again:**
   - Claimable test case found → claim it, set `stage: red`, exit: `kill -INT $PPID`
   - All test cases completed → `<promise>ALL TEST-CASES COMPLETE</promise>`
   - All blocked/claimed → log "waiting", exit: `kill -INT $PPID`

---

## First-Run Handling

If Test Cases Queue in tracker is empty: read `test-cases.md`, scan `## TC-{N}:` headers, populate queue with `{agent: -, status: pending|blocked}` metadata (compute from Dependencies), then start.

## Decision Reporting Protocol

When you make a substantive decision a human reviewer would want to know about, report it to the dashboard:

**When to report:**
- Test strategy decisions (unit vs integration approach for a test case)
- Implementation choices (which approach to make the test pass)
- Mocking decisions (why you chose to mock or not mock a dependency)
- Scope boundary decisions (what minimal implementation covers)
- File overlap or conflict decisions (how you handled shared files with other agents)

**How to report:**
```bash
curl -s --connect-timeout 2 --max-time 5 -X POST "http://127.0.0.1:4242/api/decision?app=$RALPHFLOW_APP&loop=$RALPHFLOW_LOOP" -H 'Content-Type: application/json' -d '{"item":"TC-{N}","agent":"{{AGENT_NAME}}","decision":"{one-line summary}","reasoning":"{why this choice}"}'
```

**Do NOT report** routine operations: claiming a test case, updating heartbeat, stage transitions, waiting for blocked test cases. Only report substantive choices that affect the implementation.

**Best-effort only:** If the dashboard is unreachable (curl fails), continue working normally. Decision reporting must never block or delay your work.

---

## Testing Anti-Patterns — NEVER Do These

1. **Testing mock behavior instead of real behavior** — if your assertion checks a mock element (`*-mock` test IDs, mock return values), you are testing the mock, not the code. Delete and rewrite.
2. **Adding test-only methods to production classes** — if a method exists only because tests need it, move it to test utilities. Production code must not know about tests.
3. **Mocking without understanding dependencies** — before mocking, ask: "What side effects does the real method have? Does my test depend on any of them?" Mock at the lowest level necessary, not at the level that seems convenient.
4. **Multiple behaviors per test** — if the test name contains "and", split it. One test, one behavior, one assertion.
5. **Incomplete mock data** — mock the COMPLETE data structure as it exists in reality, not just the fields your immediate test uses. Partial mocks hide structural assumptions.

---

## Red Flags — STOP and Start Over

- Code written before test
- Test written after implementation
- Test passes immediately in RED stage
- Cannot explain why test failed
- Tests added "later"
- Rationalizing "just this once"
- "I already manually tested it"
- "Tests after achieve the same purpose"
- "Keep as reference" or "adapt existing code"
- "This is different because..."
- Mock setup is >50% of test code

**All of these mean: Delete code. Start over with RED.**

---

## Rules

- One test case at a time per agent. One stage per iteration.
- Read tracker first, update tracker last. Always use lock protocol for writes.
- Read `CLAUDE.md` for all project-specific context.
- **The Iron Law is absolute: NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.**
- RED must produce a FAILING test. GREEN must produce MINIMAL passing code. REFACTOR must NOT add behavior.
- Run ALL tests after every change, not just the current test.
- Commit after each stage: RED commit (test only), GREEN commit (implementation), REFACTOR commit (cleanup).
- Align with sibling test cases via Test Case Group context.
- **Multi-agent: never touch another agent's in_progress test case. Coordinate via tracker.md.**

---

Read `.ralph-flow/{{APP_NAME}}/01-tdd-loop/tracker.md` now and begin.
