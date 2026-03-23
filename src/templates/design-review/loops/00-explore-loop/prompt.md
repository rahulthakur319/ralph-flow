# Explore Loop — Discover and Scope Ideas Before Design

**App:** `{{APP_NAME}}` — all flow files live under `.ralph-flow/{{APP_NAME}}/`.

Read `.ralph-flow/{{APP_NAME}}/00-explore-loop/tracker.md` FIRST to determine where you are.

> **Design-first thinking starts with understanding.** Before any design or code, explore what exists, clarify what the user wants, and define sharp boundaries. Ambiguity killed here saves days of rework later.

> **READ-ONLY FOR SOURCE CODE.** Only write to: `.ralph-flow/{{APP_NAME}}/00-explore-loop/tracker.md`, `.ralph-flow/{{APP_NAME}}/00-explore-loop/ideas.md`.

**Pipeline:** `ideas.md → YOU → designs.md → 01-design-loop → design specs`

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

## State Machine (3 stages per idea)

**FIRST — Check completion.** Read the tracker. If the Ideas Queue has entries
AND every entry is `[x]` (no pending ideas):
1. **Re-scan `ideas.md`** — read all `## IDEA-{N}:` headers and compare
   against the Ideas Queue in the tracker.
2. **New ideas found** (in `ideas.md` but not in the queue) → add them as
   `- [ ] IDEA-{N}: {title}` to the Ideas Queue, update the Dependency Graph
   from their `**Depends on:**` tags, then proceed to process the lowest-numbered
   ready idea via the normal state machine.
3. **No new ideas** → go to **"No Ideas? Collect Them"** to ask the user.

Only write `<promise>ALL IDEAS SCOPED</promise>` when the user explicitly
confirms they have no more ideas to add AND `ideas.md` has no ideas
missing from the tracker queue.

Pick the lowest-numbered `ready` idea. NEVER process a `blocked` idea.

---

## No Ideas? Collect Them

**Triggers when:**
- `ideas.md` has no ideas at all (first run, empty queue with no entries), OR
- All ideas in the queue are completed (`[x]`), no `pending` ideas remain, AND
  `ideas.md` has been re-scanned and contains no ideas missing from the queue

**Flow:**
1. Tell the user: *"No pending ideas. Tell me what you want to build — describe features, problems, or goals in your own words."*
2. Use `AskUserQuestion` to prompt: "What do you want to build or change?" (open-ended)
3. As the user narrates, capture each distinct concept as a `## IDEA-{N}: {Title}` in `ideas.md` (continue numbering from existing ideas) with a brief description and `**Depends on:** None` (or dependencies if mentioned)
4. **Confirm ideas & dependencies** — present all captured ideas back. Use `AskUserQuestion` (up to 3 questions) to validate: correct ideas? right dependency order? any to split/merge?
5. Apply corrections, finalize `ideas.md`, add new entries to tracker queue, proceed to normal flow

---

```
CONTEXT → Explore project state, read docs, understand what exists → stage: clarify
CLARIFY → Ask questions one at a time, nail down intent and constraints → stage: scope
SCOPE   → Define boundaries, write structured IDEA entry, mark done    → kill
```

## First-Run / New Idea Detection

If Ideas Queue in tracker is empty OR all entries are `[x]`: read `ideas.md`,
scan `## IDEA-{N}:` headers + `**Depends on:**` tags. For any idea NOT already
in the queue, add as `- [ ] IDEA-{N}: {title}` and build/update the Dependency Graph.
If new ideas were added, proceed to process them. If the queue is still empty
after scanning, go to **"No Ideas? Collect Them"**.

---

## STAGE 1: CONTEXT

1. Read tracker → pick lowest-numbered `ready` idea
2. Read the idea from `ideas.md` (if it exists — on first run it may be empty)
3. **Explore the project state:**
   - Read `CLAUDE.md` for project context, architecture, conventions, stack
   - Read **15+ key files** across the project: configs, entry points, core modules, recent changes
   - Check recent git commits (`git log --oneline -20`) to understand momentum and active areas
   - Identify existing patterns, conventions, and architectural decisions
4. **Render a Project State Map** — output an ASCII architecture diagram showing:
   - Current project structure (major components and modules)
   - Active areas of development (`●` = stable, `○` = recently changed)
   - Where this idea might touch the codebase
5. Update tracker: `active_idea: IDEA-{N}`, `stage: clarify`, log entry

## STAGE 2: CLARIFY

> **One question at a time, multiple choice preferred.** Reduce cognitive load on the user. Do not dump a wall of questions — guide the conversation.

1. Formulate questions about purpose, constraints, success criteria, and scope
2. **Present understanding first** — render an ASCII scope diagram showing your current understanding of the idea. Give the user a visual anchor before asking questions.
3. **Ask up to 20 questions, 5 at a time** via `AskUserQuestion`:
   - **Round 1 — Purpose & Intent:**
     - What problem does this solve? Who benefits?
     - What does success look like? (measurable criteria)
     - Are there existing solutions or workarounds?
   - **Round 2 — Constraints & Boundaries:**
     - What must NOT change? (protected areas, APIs, contracts)
     - Performance, security, or compatibility requirements?
     - Timeline or effort constraints?
   - **Round 3 — Scope & Priority:**
     - What is the smallest useful version? (MVP thinking)
     - What can be deferred to a follow-up?
     - Dependencies on other work?
   - **Round 4+ — Clarification:** Based on prior answers, dig deeper
   - **Stop early** if the idea is clear enough
   - For multi-option decisions: numbered list with one-line descriptions
   - For trade-offs: include a comparison table
4. **Flag scope concerns:** If the idea seems too large for a single design cycle, suggest splitting it. Present a decomposition tree showing how it could break down.
5. Save Q&A summary in tracker log
6. Update tracker: `stage: scope`, log entry with key decisions

## STAGE 3: SCOPE

1. Synthesize all context and clarification into a structured IDEA entry
2. **Render a Scope Boundary Diagram** — ASCII diagram showing:
   - In-scope items (`✓`) vs. out-of-scope items (`✗`)
   - Dependencies on existing systems or components
   - Data flow for the proposed change
3. Write the IDEA entry to `ideas.md` (or update if skeleton exists) using the format below
4. **Present the scoped idea to the user** — show the IDEA summary and ask for confirmation via `AskUserQuestion`: "Does this capture what you want? Anything to add, remove, or change?"
5. Apply any corrections from the user
6. Mark done in tracker: check off queue, completed mapping, `active_idea: none`, `stage: context`, update Dependency Graph, log
7. Exit: `kill -INT $PPID`

**IDEA entry format:**
```markdown
## IDEA-{N}: {Title}

**Depends on:** {IDEA-{M} or "None"}
**Status:** scoped

### Description
{2-4 sentences describing what this idea is about — the problem, the user need, the opportunity.}

### Constraints
{Bullet list of hard constraints: must not break X, must work with Y, performance budget, etc.}

### Success Criteria
- [ ] {Specific, measurable condition — at least 3}
- [ ] {Observable outcome the user can verify}
- [ ] {Edge case or failure mode that must be handled}

### In Scope
- {Concrete deliverable or behavior change}
- {Another concrete deliverable}

### Out of Scope
- {Explicitly deferred item — with brief reason}
- {Another deferred item}

### Open Questions
- {Any remaining ambiguity that the design loop should resolve}
```

---

## Decision Reporting Protocol

When you make a substantive decision a human reviewer would want to know about, report it to the dashboard:

**When to report:**
- Scope boundary decisions (what is in vs. out of scope for an idea)
- Splitting or merging ideas (decomposition choices)
- Interpretation of ambiguous user intent (how you resolved unclear descriptions)
- Constraint identification (constraints you surfaced that the user did not mention)
- Priority or ordering decisions (why one idea comes before another)

**How to report:**
```bash
curl -s --connect-timeout 2 --max-time 5 -X POST "http://127.0.0.1:4242/api/decision?app=$RALPHFLOW_APP&loop=$RALPHFLOW_LOOP" -H 'Content-Type: application/json' -d '{"item":"IDEA-{N}","agent":"explore-loop","decision":"{one-line summary}","reasoning":"{why this choice}"}'
```

**Do NOT report** routine operations: picking the next idea, updating tracker, stage transitions. Only report substantive choices that affect the scoped idea.

**Best-effort only:** If the dashboard is unreachable (curl fails), continue working normally. Decision reporting must never block or delay your work.

---

## Rules

- One idea at a time. All 3 stages run in one iteration, one `kill` at the end.
- Read tracker first, update tracker last.
- Append to `ideas.md` — never overwrite. Numbers globally unique and sequential.
- Ideas must be self-contained — the design loop should not need to re-ask the user basic intent questions.
- Flag ideas that are too large — suggest splitting before scoping.
- **One question at a time, multiple choice preferred.** Reduce cognitive load.
- Always present your understanding visually before asking questions.
- Capture explicit out-of-scope items — these prevent scope creep downstream.

---

Read `.ralph-flow/{{APP_NAME}}/00-explore-loop/tracker.md` now and begin.
