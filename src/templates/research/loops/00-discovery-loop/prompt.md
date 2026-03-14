# Discovery Loop — Identify Research Topics

**App:** `{{APP_NAME}}` — all flow files live under `.ralph-flow/{{APP_NAME}}/`.

Read `.ralph-flow/{{APP_NAME}}/00-discovery-loop/tracker.md` FIRST to determine where you are.

> **Map the territory before exploring it.** Your job is to take a broad research brief and decompose it into specific, researchable topics. Each topic should be independently investigable and contribute to the overall research goal.

> **WRITE ONLY TO:** `00-discovery-loop/topics.md`, `00-discovery-loop/tracker.md`, `01-research-loop/tracker.md`, `01-research-loop/findings.md`.

**Pipeline:** `user brief → YOU → topics.md → 01-research-loop → findings`

---

## No Brief? Collect One

If `topics.md` has no unprocessed topics and the tracker queue is empty/all done:
1. Tell the user: *"No research brief found. Tell me what you want to research — describe questions, problems, or domains you want to understand."*
2. Use `AskUserQuestion` to prompt: "What do you want to research or understand?" (open-ended)
3. As the user narrates, capture the research brief in tracker log under `## Research Brief`
4. **Confirm scope** — present the brief back. Use `AskUserQuestion` (up to 5 questions) to validate: correct scope? right depth? any areas to include/exclude? target audience? desired output format (PDF, PPT, document)?
5. Apply corrections, finalize brief, proceed to normal flow

---

## State Machine (3 stages)

```
SCOPE    → Understand the research brief, define boundaries → stage: explore
EXPLORE  → Search broadly for sub-domains, angles, key questions → stage: decompose
DECOMPOSE → Break into TOPIC entries, write to topics.md, seed research tracker → kill
```

## First-Run Handling

If Topics Queue in tracker is empty and Research Brief exists: proceed to SCOPE. If Topics Queue is populated, check for remaining unprocessed items.

---

## STAGE 1: SCOPE

1. Read tracker → check if a Research Brief exists
2. Read any existing context: `CLAUDE.md`, project files, existing research
3. **Define research boundaries:**
   - What is in scope vs. out of scope
   - What depth is needed (surface survey vs. deep dive)
   - Who is the audience (technical, executive, public)
   - What output format is expected
4. Update tracker: `stage: explore`, log entry with scope decisions

## STAGE 2: EXPLORE

1. **Broad exploration** — use `WebSearch`, `WebFetch`, file reads to survey the domain:
   - Search for 10+ different angles on the research question
   - Identify key sub-domains, stakeholders, competing perspectives
   - Note data sources, reports, standards, regulations that exist
   - Find gaps — what's hard to find, what's controversial, what needs primary research
2. **Cluster findings** — group related areas into potential topic clusters
3. Update tracker: `stage: decompose`, log entry with exploration summary

## STAGE 3: DECOMPOSE

1. Find next TOPIC numbers (check existing in `00-discovery-loop/topics.md`)
2. Break the research space into **5-15 specific topics**, each:
   - Independently researchable by a single agent
   - Specific enough to produce focused findings (not "research everything about X")
   - Clearly scoped with guiding questions
   - Tagged with priority (high/medium/low) and estimated depth
3. Append to `00-discovery-loop/topics.md` (format below)
4. **Seed `01-research-loop/tracker.md`:**
   1. Acquire `.ralph-flow/{{APP_NAME}}/01-research-loop/.tracker-lock`:
      - Exists + < 60s old → sleep 2s, retry up to 5 retries
      - Exists + ≥ 60s old → stale, delete it
      - Not exists → continue
      - Write lock: `echo "discovery-loop $(date -u +%Y-%m-%dT%H:%M:%SZ)" > .ralph-flow/{{APP_NAME}}/01-research-loop/.tracker-lock`
      - Sleep 500ms, re-read lock, verify `discovery-loop` is in it
   2. Add topics to `## Topics Queue` with metadata:
      - `{agent: -, status: pending}` for topics with no dependencies
      - `{agent: -, status: blocked}` for topics that depend on other topics
   3. Add dependency entries to `## Dependencies` section
   4. Release lock: `rm .ralph-flow/{{APP_NAME}}/01-research-loop/.tracker-lock`
5. Update own tracker: mark complete, `stage: scope`, log entry
6. Exit: `kill -INT $PPID`

If all topics have been discovered and queue is empty: `<promise>ALL TOPICS DISCOVERED</promise>`

**Topic format:**
```markdown
## TOPIC-{N}: {Concise title}

**Priority:** {high | medium | low}
**Depth:** {surface | moderate | deep}
**Depends on:** {TOPIC-{M} or "None"}

### Research Question
{The specific question(s) this topic should answer. 1-3 sentences.}

### Scope
{What to include and exclude. Key angles to cover.}

### Suggested Sources
{Types of sources to look for: government data, academic papers, news, industry reports, etc.}

### Success Criteria
- [ ] {What constitutes a complete investigation of this topic}
```

---

## Decision Reporting Protocol

When you make a substantive decision a human reviewer would want to know about, report it to the dashboard:

**When to report:**
- Scope boundary decisions (what's in/out of the research scope)
- Topic decomposition choices (why topics were split a certain way)
- Priority assignments (why a topic is high vs. medium vs. low priority)
- Depth decisions (surface vs. deep investigation for specific areas)
- Dependency structure choices (why certain topics must precede others)

**How to report:**
```bash
curl -s --connect-timeout 2 --max-time 5 -X POST "http://127.0.0.1:4242/api/decision?app=$RALPHFLOW_APP&loop=$RALPHFLOW_LOOP" -H 'Content-Type: application/json' -d '{"item":"TOPIC-{N}","agent":"discovery-loop","decision":"{one-line summary}","reasoning":"{why this choice}"}'
```

**Do NOT report** routine operations: updating tracker, stage transitions. Only report substantive choices that affect the research direction.

**Best-effort only:** If the dashboard is unreachable (curl fails), continue working normally. Decision reporting must never block or delay your work.

---

## Rules

- One research brief at a time. All 3 stages run in one iteration, one `kill` at the end.
- Read tracker first, update tracker last.
- Append to `topics.md` — never overwrite. Numbers globally unique and sequential.
- Topics must be self-contained — the research loop never reads the original brief directly.
- Each topic should take 1-3 research iterations to complete, not more.
- Mark inter-topic dependencies explicitly (some topics build on findings from others).

---

Read `.ralph-flow/{{APP_NAME}}/00-discovery-loop/tracker.md` now and begin.
