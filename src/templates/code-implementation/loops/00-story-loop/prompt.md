# Story Loop — Break Stories into Structured Tasks

**App:** `{{APP_NAME}}` — all flow files live under `.ralph-flow/{{APP_NAME}}/`.

Read `.ralph-flow/{{APP_NAME}}/00-story-loop/tracker.md` FIRST to determine where you are.

> **Describe the destination, not the route.** Focus on what the user will experience, not how you'll build it. Surface anything that could go wrong — broken flows, overlooked edge cases, data at risk.

> **READ-ONLY FOR SOURCE CODE.** Only write to: `.ralph-flow/{{APP_NAME}}/01-tasks-loop/tasks.md`, `.ralph-flow/{{APP_NAME}}/01-tasks-loop/tracker.md`, `.ralph-flow/{{APP_NAME}}/00-story-loop/tracker.md`, `.ralph-flow/{{APP_NAME}}/00-story-loop/stories.md`.

**Pipeline:** `stories.md → YOU → tasks.md → 01-tasks-loop → code`

---

## State Machine (3 stages per story)

**FIRST — Check completion.** Read the tracker. If the Stories Queue has entries
AND every entry is `[x]` (no pending stories), do NOT write the completion promise yet.
Instead, go to **"No Stories? Collect Them"** to ask the user for new stories.
Only write `<promise>ALL STORIES PROCESSED</promise>` when the user explicitly
confirms they have no more stories to add.

Pick the lowest-numbered `ready` story. NEVER process a `blocked` story.

---

## No Stories? Collect Them

**Triggers when:**
- `stories.md` has no stories at all (first run, empty queue with no entries), OR
- All stories in the queue are completed (`[x]`) and there are no `pending` stories left

**Flow:**
1. Tell the user: *"No pending stories. Tell me what you want to build — describe features, problems, or goals in your own words."*
2. Use `AskUserQuestion` to prompt: "What do you want to build or fix next?" (open-ended)
3. As the user narrates, capture each distinct idea as a `## STORY-{N}: {Title}` in `stories.md` (continue numbering from existing stories) with description and `**Depends on:** None` (or dependencies if mentioned)
4. **Confirm stories & dependencies** — present all captured stories back. Use `AskUserQuestion` (up to 5 questions) to validate: correct stories? right dependency order? any to split/merge? priority adjustments?
5. Apply corrections, finalize `stories.md`, add new entries to tracker queue, proceed to normal flow

---

```
ANALYZE   → Read story, explore codebase, map scope → stage: clarify
CLARIFY   → Ask user up to 20 questions (5 at a time) → stage: decompose
DECOMPOSE → Break into TASK-GROUP(s) + tasks, append to tasks.md, mark done → kill
```

## First-Run Handling

If Stories Queue in tracker is empty: read `stories.md`, scan `## STORY-{N}:` headers + `**Depends on:**` tags, populate queue as `- [ ] STORY-{N}: {title}`, build Dependency Graph.

---

## STAGE 1: ANALYZE

1. Read tracker → pick lowest-numbered `ready` story
2. Read the story from `stories.md` (+ any referenced screenshots)
3. **Explore the codebase** — read `CLAUDE.md` for project context, then **20+ key files** across the areas this story touches. Understand current behavior, patterns, conventions, and what needs to change.
4. Update tracker: `active_story: STORY-{N}`, `stage: clarify`, log entry

## STAGE 2: CLARIFY

1. Formulate questions about scope, priorities, edge cases, design choices
2. **Ask up to 20 questions, 5 at a time** via `AskUserQuestion` (with options where possible):
   - Round 1: Scope, intent, must-haves
   - Round 2+: Design choices, edge cases, preferences — based on prior answers
   - Stop early if clear enough
3. Save Q&A summary in tracker log
4. Update tracker: `stage: decompose`, log entry with key decisions

## STAGE 3: DECOMPOSE

1. Find next TASK-GROUP and TASK numbers (check existing in `01-tasks-loop/tasks.md`)
2. **Read already-written tasks** — if sibling tasks exist, read them to align scope boundaries
3. Break story into TASK-GROUP(s) — one per distinct functional area, 2-6 tasks each
4. For each task, ask yourself: *What does success look like? How would someone confirm? What could silently break?*
5. **Sanity-check:** Do NOT embed specific file paths in tasks — describe *what* changes, not *where*. The tasks loop will explore the codebase itself.
6. Append to `01-tasks-loop/tasks.md` (format below)
7. **Update `01-tasks-loop/tracker.md` (with lock protocol):**
   1. Acquire `.ralph-flow/{{APP_NAME}}/01-tasks-loop/.tracker-lock`:
      - Exists + < 60s old → sleep 2s, retry up to 5 times
      - Exists + ≥ 60s old → stale, delete it
      - Not exists → continue
      - Write lock: `echo "story-loop $(date -u +%Y-%m-%dT%H:%M:%SZ)" > .ralph-flow/{{APP_NAME}}/01-tasks-loop/.tracker-lock`
      - Sleep 500ms, re-read lock, verify `story-loop` is in it
   2. Add new Task Groups to `## Task Groups`
   3. Add new tasks to `## Tasks Queue` with multi-agent metadata:
      - Compute status: check if each task's `**Depends on:**` targets are all in `completed_tasks`
      - All deps satisfied or `Depends on: None` → `{agent: -, status: pending}`
      - Any dep not satisfied → `{agent: -, status: blocked}`
      - Example: `- [ ] TASK-15: New Task Title {agent: -, status: pending}`
   4. Add dependency entries to `## Dependencies` section (for tasks with dependencies only):
      - Example: `- TASK-15: [TASK-12]`
      - Tasks with `Depends on: None` are NOT added to Dependencies
   5. Release lock: `rm .ralph-flow/{{APP_NAME}}/01-tasks-loop/.tracker-lock`
8. Mark done in tracker: check off queue, completed mapping, `active_story: none`, `stage: analyze`, update Dependency Graph, log
9. Exit: `kill -INT $PPID`

**TASK-GROUP header:**
```markdown
# TASK-GROUP-{X}: {Title}

**Source:** STORY-{N}
**Goal:** {1-3 sentences — the outcome, not the implementation}
**Milestones:**
- [ ] {Checkpoint} (TASK-{A}, TASK-{B})
**Shared Context:**
{Domain knowledge, constraints, relationships between tasks in this group}
```

**Task format:**
```markdown
## TASK-{N}: {Concise title}

**Source:** STORY-{M}
**Task-Group:** TASK-GROUP-{X}
**Depends on:** {TASK-{Y} or "None"}

### Intent
{The purpose — the problem being solved and who benefits. 2-4 sentences.}

### Today
{How things work right now. Reference behavior, not file paths.}

### After
{The end-user experience once delivered. Describe the outcome, not the implementation.}

### Verification
{Concrete steps to confirm the change works — navigate here, do this, expect that.}

### Acceptance Criteria
- [ ] {Specific, observable condition — at least 3}
```

---

## Decision Reporting Protocol

When you make a substantive decision a human reviewer would want to know about, report it to the dashboard:

**When to report:**
- Scope boundary decisions (included/excluded functionality from a story)
- Approach choices (why you decomposed tasks one way vs. another)
- Trade-off resolutions (prioritizing one concern over another)
- Interpretation of ambiguous requirements (how you resolved unclear user intent)
- Self-answered clarification questions (questions you could have asked but resolved yourself)

**How to report:**
```bash
curl -s --connect-timeout 2 --max-time 5 -X POST "http://127.0.0.1:4242/api/decision?app=$RALPHFLOW_APP&loop=$RALPHFLOW_LOOP" -H 'Content-Type: application/json' -d '{"item":"STORY-{N}","agent":"story-loop","decision":"{one-line summary}","reasoning":"{why this choice}"}'
```

**Do NOT report** routine operations: picking the next story, updating tracker, stage transitions, heartbeat updates. Only report substantive choices that affect the work product.

**Best-effort only:** If the dashboard is unreachable (curl fails), continue working normally. Decision reporting must never block or delay your work.

---

## Rules

- One story at a time. All 3 stages run in one iteration, one `kill` at the end.
- Read tracker first, update tracker last.
- Append to `tasks.md` — never overwrite. Numbers globally unique and sequential.
- Tasks must be self-contained — the tasks loop never reads `stories.md`.
- Split into multiple groups when story spans distinct areas.
- Each task ≈ one implementable unit. No Scope or Risks sections — the tasks loop handles those in phase plans.
- Mark inter-task dependencies explicitly.

---

Read `.ralph-flow/{{APP_NAME}}/00-story-loop/tracker.md` now and begin.
