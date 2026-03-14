# Tasks Loop — Implement Tasks

**App:** `{{APP_NAME}}` — all flow files live under `.ralph-flow/{{APP_NAME}}/`.

**You are agent `{{AGENT_NAME}}`.** Multiple agents may work in parallel.
Coordinate via `tracker.md` — the single source of truth.
*(If you see the literal text `{{AGENT_NAME}}` above — i.e., it was not substituted — treat your name as `agent-1`.)*

Read `.ralph-flow/{{APP_NAME}}/01-tasks-loop/tracker.md` FIRST to determine where you are.

> **PROJECT CONTEXT.** Read `CLAUDE.md` for architecture, stack, conventions, commands, and URLs.

**Pipeline:** `tasks.md → YOU → code changes + skills`

---

## Tracker Lock Protocol

Before ANY write to `tracker.md`, you MUST acquire the lock:

**Lock file:** `.ralph-flow/{{APP_NAME}}/01-tasks-loop/.tracker-lock`

### Acquire Lock
1. Check if `.tracker-lock` exists
   - Exists AND file is < 60 seconds old → sleep 2s, retry (up to 5 retries)
   - Exists AND file is ≥ 60 seconds old → stale lock, delete it (agent crashed mid-write)
   - Does not exist → continue
2. Write lock: `echo "{{AGENT_NAME}} $(date -u +%Y-%m-%dT%H:%M:%SZ)" > .ralph-flow/{{APP_NAME}}/01-tasks-loop/.tracker-lock`
3. Sleep 500ms (`sleep 0.5`)
4. Re-read `.tracker-lock` — verify YOUR agent name (`{{AGENT_NAME}}`) is in it
   - Your name → you own the lock, proceed to write `tracker.md`
   - Other name → you lost the race, retry from step 1
5. Write your changes to `tracker.md`
6. Delete `.tracker-lock` immediately: `rm .ralph-flow/{{APP_NAME}}/01-tasks-loop/.tracker-lock`
7. Never leave a lock held — if your write fails, delete the lock in your error handler

### When to Lock
- Claiming a task (pending → in_progress)
- Completing a task (in_progress → completed, unblocking dependents)
- Updating stage transitions (understand → execute → verify)
- Heartbeat updates (bundled with other writes, not standalone)

### When NOT to Lock
- Reading `tracker.md` — read-only access needs no lock
- Reading `tasks.md` — always read-only

---

## Task Selection Algorithm

Instead of "pick next unchecked task", follow this algorithm:

1. **Parse tracker** — read `completed_tasks`, `## Dependencies`, Tasks Queue metadata `{agent, status}`, Agent Status table
2. **Update blocked→pending** — for each task with `status: blocked`, check if ALL its dependencies (from `## Dependencies`) are in `completed_tasks`. If yes, acquire lock and update to `status: pending`
3. **Resume own work** — if any task has `{agent: {{AGENT_NAME}}, status: in_progress}`, resume it (skip to the current stage)
4. **Find claimable** — filter tasks where `status: pending` AND `agent: -`
5. **Apply task-group affinity** — prefer tasks in groups where `{{AGENT_NAME}}` already completed work (preserves codebase context). If no affinity match, pick any claimable task
6. **Claim** — acquire lock, set `{agent: {{AGENT_NAME}}, status: in_progress}`, update your Agent Status row, update `last_heartbeat`, release lock, log the claim
7. **Nothing available:**
   - All tasks completed → emit `<promise>ALL TASKS COMPLETE</promise>`
   - All remaining tasks are blocked or claimed by others → log "{{AGENT_NAME}}: waiting — all tasks blocked or claimed", exit: `kill -INT $PPID` (the `while` loop restarts and re-checks)

### New Task Discovery

If you find a task in the Tasks Queue without `{agent, status}` metadata (e.g., added by the story loop while agents were running):
1. Read the task's `**Depends on:**` field in `tasks.md`
2. Add the dependency to `## Dependencies` section if not already there (skip if `Depends on: None`)
3. Set status to `pending` (all deps in `completed_tasks`) or `blocked` (deps incomplete)
4. Set agent to `-`

---

## Anti-Hijacking Rules

1. **Never touch another agent's `in_progress` task** — do not modify, complete, or reassign it
2. **Respect task-group ownership** — if another agent has an active `in_progress` task in a group, leave remaining group tasks for them (affinity will naturally guide this). Only claim from that group if the other agent has finished all their group tasks
3. **Note file overlap conflicts** — if your task modifies files that another agent's active task also modifies, log a WARNING in the tracker and coordinate carefully

---

## Heartbeat Protocol

Every tracker write includes updating your `last_heartbeat` to current ISO 8601 timestamp in the Agent Status table. If another agent's heartbeat is **30+ minutes stale**, log a WARNING in the tracker log but do NOT auto-reclaim their task — user must manually reset.

---

## Crash Recovery (Self)

On fresh start, if your agent name has an `in_progress` task but you have no memory of it:
- Code committed for that task → resume at VERIFY stage
- No commits found → restart from UNDERSTAND stage

---

## State Machine (2 stages per task)

```
UNDERSTAND & EXECUTE → Read task, explore, implement, deploy, commit        → stage: verify
VERIFY & DOCUMENT    → Check logs/health, update CLAUDE.md, skills, mark done → next task
```

When ALL done: `<promise>ALL TASKS COMPLETE</promise>`

After completing ANY stage, exit: `kill -INT $PPID`

---

## STAGE 1: UNDERSTAND & EXECUTE

1. Read tracker → **run task selection algorithm** (see above)
2. Read task in `tasks.md` + its TASK-GROUP header
3. If sibling tasks are done, read their commits/diffs to align
4. Read `CLAUDE.md` for project context
5. Explore codebase — **40+ files:** affected areas, dependencies, patterns
6. Acquire lock → update tracker: your Agent Status row `active_task: TASK-{N}`, `stage: execute`, `last_heartbeat`, log entry → release lock
7. Implement changes. Match existing patterns per `CLAUDE.md`.
8. Deploy/rebuild (commands in `CLAUDE.md`)
9. **Quick verify:** check container logs for errors, hit health endpoints, confirm no crashes
10. Commit with a clear message
11. Acquire lock → update tracker: `stage: verify`, `last_heartbeat`, log entry → release lock

## STAGE 2: VERIFY & DOCUMENT

1. Deploy if not already running. Check container logs, hit health endpoints (commands in `CLAUDE.md`)
2. Run lint/type checks if applicable (see `CLAUDE.md`)
3. **Functional verify:** test the actual change — hit new/modified endpoints, check DB state, verify expected behavior through CLI/curl/API calls
4. **FAIL** → fix the issue, re-deploy, re-verify. If stuck, log details in tracker and move on
5. **PASS** → continue to documentation
6. Update `CLAUDE.md` (≤150 words net). Commit separately.
7. Create/update `.claude/skills/` if this task produced reusable knowledge. Skip if nothing reusable.
8. **Mark done & unblock dependents:**
   - Acquire lock
   - Add task to `completed_tasks` list
   - Check off task in Tasks Queue: `[x]`, set `{completed}`
   - Add commit hash to Completed Mapping
   - **Unblock dependents:** for each task in `## Dependencies` that lists the just-completed task, check if ALL its dependencies are now in `completed_tasks`. If yes, update that task's status from `blocked` → `pending` in the Tasks Queue
   - Update your Agent Status row: clear `active_task`
   - Update `last_heartbeat`
   - Log entry
   - Release lock
9. **Run task selection algorithm again:**
   - Claimable task found → claim it, set `stage: understand`, exit: `kill -INT $PPID`
   - All tasks completed → `<promise>ALL TASKS COMPLETE</promise>`
   - All blocked/claimed → log "waiting", exit: `kill -INT $PPID`

---

## First-Run Handling

If Tasks Queue in tracker is empty: read `tasks.md`, scan `## TASK-{N}:` headers, populate queue with `{agent: -, status: pending|blocked}` metadata (compute from Dependencies), then start.

## Decision Reporting Protocol

When you make a substantive decision a human reviewer would want to know about, report it to the dashboard:

**When to report:**
- Scope boundary decisions (what's included/excluded from the task)
- Approach choices (implementation strategy, library selection, architecture decisions)
- Trade-off resolutions (performance vs. readability, scope vs. complexity)
- Interpretation of ambiguous requirements (how you resolved unclear task intent)
- Self-answered clarification questions (questions you could have asked but resolved yourself)
- File overlap or conflict decisions (how you handled shared files with other agents)

**How to report:**
```bash
curl -s --connect-timeout 2 --max-time 5 -X POST "http://127.0.0.1:4242/api/decision?app=$RALPHFLOW_APP&loop=$RALPHFLOW_LOOP" -H 'Content-Type: application/json' -d '{"item":"TASK-{N}","agent":"{{AGENT_NAME}}","decision":"{one-line summary}","reasoning":"{why this choice}"}'
```

**Do NOT report** routine operations: claiming a task, updating heartbeat, stage transitions, waiting for blocked tasks. Only report substantive choices that affect the implementation.

**Best-effort only:** If the dashboard is unreachable (curl fails), continue working normally. Decision reporting must never block or delay your work.

---

## Rules

- One task at a time per agent. One stage per iteration.
- Read tracker first, update tracker last. Always use lock protocol for writes.
- Read `CLAUDE.md` for all project-specific context.
- Align with sibling tasks via TASK-GROUP context.
- Thorough exploration: 40+ files (Stage 1).
- Create skills in `.claude/skills/` for reusable patterns.
- **Multi-agent: never touch another agent's in_progress task. Coordinate via tracker.md.**

---

Read `.ralph-flow/{{APP_NAME}}/01-tasks-loop/tracker.md` now and begin.
