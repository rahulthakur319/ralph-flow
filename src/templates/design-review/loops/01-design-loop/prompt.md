# Design Loop — Produce Design Specs from Scoped Ideas

**App:** `{{APP_NAME}}` — all flow files live under `.ralph-flow/{{APP_NAME}}/`.

Read `.ralph-flow/{{APP_NAME}}/01-design-loop/tracker.md` FIRST to determine where you are.

> **Design for isolation and clarity — smaller units with one clear purpose, well-defined interfaces.** Every component should be replaceable without rippling through the system. Prefer boring, proven patterns over clever abstractions.

> **READ-ONLY FOR SOURCE CODE.** Only write to: `.ralph-flow/{{APP_NAME}}/01-design-loop/tracker.md`, `.ralph-flow/{{APP_NAME}}/01-design-loop/designs.md`. Read `ideas.md` for input.

**Pipeline:** `ideas.md → YOU → designs.md → 02-review-loop → reviewed specs`

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

## State Machine (3 stages per design)

**FIRST — Check completion.** Read the tracker. If the Designs Queue has entries
AND every entry is `[x]` (no pending designs):
1. **Re-scan `ideas.md`** — read all `## IDEA-{N}:` headers with `**Status:** scoped`
   and compare against the Designs Queue in the tracker.
2. **New scoped ideas found** (in `ideas.md` but not in the queue) → add them as
   `- [ ] DESIGN-{N}: {title}` to the Designs Queue (DESIGN number matches IDEA number),
   then proceed to process the lowest-numbered ready design.
3. **No new scoped ideas** → write `<promise>ALL DESIGNS WRITTEN</promise>`.

Pick the lowest-numbered `ready` design. NEVER process a `blocked` design.

---

```
ALTERNATIVES → Propose 2-3 approaches with trade-offs, recommend one  → stage: design
DESIGN       → Present design incrementally, get user approval         → stage: document
DOCUMENT     → Write full design spec as DESIGN entry, mark done       → kill
```

## First-Run / New Design Detection

If Designs Queue in tracker is empty OR all entries are `[x]`: read `ideas.md`,
scan `## IDEA-{N}:` headers with `**Status:** scoped`. For any scoped idea NOT
already in the queue, add as `- [ ] DESIGN-{N}: {title}` and build/update the
Dependency Graph from `**Depends on:**` tags. If new designs were added, proceed.
If the queue is still empty after scanning, write `<promise>ALL DESIGNS WRITTEN</promise>`.

---

## STAGE 1: ALTERNATIVES

1. Read tracker → pick lowest-numbered `ready` design
2. Read the corresponding IDEA from `00-explore-loop/ideas.md` — understand description, constraints, success criteria, in-scope/out-scope
3. **Explore the codebase** — read `CLAUDE.md` and **20+ key files** across affected areas to understand current architecture, patterns, and constraints
4. **Propose 2-3 alternative approaches** — for each approach:
   - Name and one-line summary
   - How it works (2-3 sentences)
   - Key trade-offs: complexity, performance, maintainability, risk
   - What it does well and where it falls short
5. **Render an Alternatives Comparison Table** — ASCII bordered table:
   ```
   ┌──────────────┬────────────┬─────────┬──────────────┐
   │ Approach      │ Complexity │ Risk    │ Maintenance  │
   ├──────────────┼────────────┼─────────┼──────────────┤
   │ A: {name}     │ Low        │ Low     │ Easy         │
   │ B: {name}     │ Medium     │ Medium  │ Moderate     │
   │ C: {name}     │ High       │ Low     │ Hard         │
   └──────────────┴────────────┴─────────┴──────────────┘
   ```
6. **Recommend one approach** with clear reasoning — why it best fits the constraints and success criteria from the IDEA
7. **Ask the user** via `AskUserQuestion`: present the comparison and recommendation, ask which approach to proceed with (or if they want a different direction)
8. Record the chosen approach in tracker log
9. Update tracker: `active_design: DESIGN-{N}`, `stage: design`, log entry

## STAGE 2: DESIGN

> **Present design incrementally. Get approval on each section before moving to the next.** Do not dump a complete design — walk the user through it piece by piece.

1. Using the chosen approach from ALTERNATIVES, build the design section by section:
2. **Architecture Overview** — render an ASCII architecture diagram showing major components, their responsibilities, and how they connect. Ask user: "Does this architecture make sense?"
3. **Component Breakdown** — for each component:
   - Name, responsibility (one sentence), inputs/outputs
   - Key design decisions within this component
   - Ask user after every 2-3 components: "Any concerns so far?"
4. **Data Flow** — render an ASCII data flow diagram showing how information moves through the system. Cover happy path and key error paths.
5. **Error Handling Strategy** — how errors propagate, where they are caught, what the user sees. Present as a bordered list.
6. **Testing Approach** — what to test, how to test it, what coverage looks like. Unit vs. integration vs. e2e breakdown.
7. **After each section**, ask the user via `AskUserQuestion` (multiple choice preferred):
   - "Approve and continue to next section"
   - "Revise this section (tell me what to change)"
   - "Go back to alternatives (this approach is not working)"
8. If the user wants to go back to alternatives, reset to ALTERNATIVES stage
9. Update tracker: `stage: document`, log entry with design decisions

## STAGE 3: DOCUMENT

1. Compile all approved sections into a formal DESIGN entry
2. Write the DESIGN entry to `01-design-loop/designs.md` using the format below
3. **Render a Design Summary** — ASCII status diagram showing:
   - All components with their status (`✓` designed)
   - Data flow overview in compact form
   - Success criteria mapping (which criteria each component addresses)
4. Mark done in tracker: check off queue, completed mapping, `active_design: none`, `stage: alternatives`, update Dependency Graph, log
5. Exit: `kill -INT $PPID`

**DESIGN entry format:**
```markdown
## DESIGN-{N}: {Title}

**Source:** IDEA-{N}
**Depends on:** {DESIGN-{M} or "None"}
**Approach:** {Name of chosen approach from alternatives}
**Status:** drafted

### Architecture Overview
{2-3 paragraphs describing the high-level architecture. Reference the components below.}

### Components

#### {Component Name}
- **Responsibility:** {One sentence}
- **Inputs:** {What it receives}
- **Outputs:** {What it produces}
- **Key Decisions:** {Design choices made for this component}

### Data Flow
{Description of how data moves through the system. Reference components by name.}

### Interfaces
{Public APIs, function signatures, event contracts, or file formats that other components depend on. Be specific — these are the contracts.}

### Error Handling
{How errors propagate, where they are caught, recovery strategies, what the user sees.}

### Testing Strategy
- **Unit:** {What to unit test, key scenarios}
- **Integration:** {What to integration test, component boundaries}
- **E2E:** {End-to-end scenarios to verify}

### File Structure Plan
{Which files to create, modify, or delete. Group by component.}

### Success Criteria Mapping
{Map each success criterion from the IDEA to the component(s) that address it.}
- [ ] {Criterion} → {Component(s)}
```

---

## Decision Reporting Protocol

When you make a substantive decision a human reviewer would want to know about, report it to the dashboard:

**When to report:**
- Approach selection (why one alternative was chosen over others)
- Architecture decisions (component boundaries, data flow choices)
- Trade-off resolutions (performance vs. simplicity, flexibility vs. complexity)
- Scope adjustments during design (things that turned out harder or simpler than expected)
- User feedback integration (how you incorporated user revisions into the design)

**How to report:**
```bash
curl -s --connect-timeout 2 --max-time 5 -X POST "http://127.0.0.1:4242/api/decision?app=$RALPHFLOW_APP&loop=$RALPHFLOW_LOOP" -H 'Content-Type: application/json' -d '{"item":"DESIGN-{N}","agent":"design-loop","decision":"{one-line summary}","reasoning":"{why this choice}"}'
```

**Do NOT report** routine operations: picking the next design, updating tracker, stage transitions. Only report substantive choices that affect the design spec.

**Best-effort only:** If the dashboard is unreachable (curl fails), continue working normally. Decision reporting must never block or delay your work.

---

## Rules

- One design at a time. All 3 stages run in one iteration, one `kill` at the end.
- Read tracker first, update tracker last.
- Append to `designs.md` — never overwrite. DESIGN numbers match IDEA numbers.
- **Design for isolation and clarity** — smaller units with one clear purpose, well-defined interfaces.
- Present design incrementally — get approval on each section before proceeding.
- Always propose alternatives before committing to an approach. Never jump to "the obvious solution."
- If the user rejects the approach during DESIGN, go back to ALTERNATIVES gracefully.
- Designs must be self-contained — the review loop should not need to read `ideas.md` to understand the spec.
- Include concrete interfaces — these are the contracts that implementation will follow.
- Map every success criterion to a component. If a criterion has no owner, the design is incomplete.

---

Read `.ralph-flow/{{APP_NAME}}/01-design-loop/tracker.md` now and begin.
