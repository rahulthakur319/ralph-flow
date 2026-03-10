# Research Loop — Investigate Topics

**You are agent `{{AGENT_NAME}}`.** Multiple agents may work in parallel.
Coordinate via `tracker.md` — the single source of truth.
*(If you see the literal text `{{AGENT_NAME}}` above — i.e., it was not substituted — treat your name as `agent-1`.)*

Read `.ralph-flow/01-research-loop/tracker.md` FIRST to determine where you are.

> **Go deep, stay focused.** Each topic is a specific research question. Your job is to investigate thoroughly and produce structured findings. Use web search, file reading, and any available tools to gather evidence.

**Pipeline:** `topics.md → YOU → findings.md → 02-story-loop → narratives`

---

## Tracker Lock Protocol

Before ANY write to `tracker.md`, you MUST acquire the lock:

**Lock file:** `.ralph-flow/01-research-loop/.tracker-lock`

### Acquire Lock
1. Check if `.tracker-lock` exists
   - Exists AND file is < 60 seconds old → sleep 2s, retry (up to 5 retries)
   - Exists AND file is ≥ 60 seconds old → stale lock, delete it (agent crashed mid-write)
   - Does not exist → continue
2. Write lock: `echo "{{AGENT_NAME}} $(date -u +%Y-%m-%dT%H:%M:%SZ)" > .ralph-flow/01-research-loop/.tracker-lock`
3. Sleep 500ms (`sleep 0.5`)
4. Re-read `.tracker-lock` — verify YOUR agent name (`{{AGENT_NAME}}`) is in it
   - Your name → you own the lock, proceed to write `tracker.md`
   - Other name → you lost the race, retry from step 1
5. Write your changes to `tracker.md`
6. Delete `.tracker-lock` immediately: `rm .ralph-flow/01-research-loop/.tracker-lock`
7. Never leave a lock held — if your write fails, delete the lock in your error handler

### When to Lock
- Claiming a topic (pending → in_progress)
- Completing a topic (in_progress → completed)
- Updating stage transitions
- Heartbeat updates (bundled with other writes, not standalone)

### When NOT to Lock
- Reading `tracker.md` — read-only access needs no lock
- Reading `topics.md` or `findings.md` — always read-only for topics, append-only for findings

---

## Topic Selection Algorithm

1. **Parse tracker** — read `completed_topics`, `## Dependencies`, Topics Queue metadata `{agent, status}`, Agent Status table
2. **Update blocked→pending** — for each topic with `status: blocked`, check if ALL its dependencies (from `## Dependencies`) are in `completed_topics`. If yes, acquire lock and update to `status: pending`
3. **Resume own work** — if any topic has `{agent: {{AGENT_NAME}}, status: in_progress}`, resume it (skip to the current stage)
4. **Find claimable** — filter topics where `status: pending` AND `agent: -`
5. **Apply priority** — prefer high-priority topics, then medium, then low
6. **Claim** — acquire lock, set `{agent: {{AGENT_NAME}}, status: in_progress}`, update your Agent Status row, update `last_heartbeat`, release lock, log the claim
7. **Nothing available:**
   - All topics completed → emit `<promise>ALL TOPICS RESEARCHED</promise>`
   - All remaining topics are blocked or claimed by others → log "{{AGENT_NAME}}: waiting — all topics blocked or claimed", exit: `kill -INT $PPID`

### New Topic Discovery

If you find a topic in the Topics Queue without `{agent, status}` metadata (e.g., added by the discovery loop while agents were running):
1. Read the topic's `**Depends on:**` field in `topics.md`
2. Add the dependency to `## Dependencies` section if not already there (skip if `Depends on: None`)
3. Set status to `pending` (all deps in `completed_topics`) or `blocked` (deps incomplete)
4. Set agent to `-`

---

## Anti-Hijacking Rules

1. **Never touch another agent's `in_progress` topic** — do not modify, complete, or reassign it
2. **Respect priority** — do not skip high-priority topics to grab low-priority ones unless high-priority are all blocked/claimed
3. **Note overlap** — if your topic overlaps with another agent's active topic, log a NOTE in the tracker and avoid duplicating their research angles

---

## Heartbeat Protocol

Every tracker write includes updating your `last_heartbeat` to current ISO 8601 timestamp in the Agent Status table. If another agent's heartbeat is **30+ minutes stale**, log a WARNING in the tracker log but do NOT auto-reclaim their topic — user must manually reset.

---

## Crash Recovery (Self)

On fresh start, if your agent name has an `in_progress` topic but you have no memory of it:
- Findings already written for that topic → resume at SYNTHESIZE stage
- No findings found → restart from INVESTIGATE stage

---

## State Machine (2 stages per topic)

```
INVESTIGATE → Search, read, gather evidence on the topic           → stage: synthesize
SYNTHESIZE  → Structure findings, write to findings.md, mark done  → next topic
```

When ALL done: `<promise>ALL TOPICS RESEARCHED</promise>`

After completing ANY stage, exit: `kill -INT $PPID`

---

## STAGE 1: INVESTIGATE

1. Read tracker → **run topic selection algorithm** (see above)
2. Read topic in `topics.md` — understand the research question, scope, suggested sources
3. If sibling topics are done, read their findings to avoid duplication and build on prior work
4. Acquire lock → update tracker: your Agent Status row `active_topic: TOPIC-{N}`, `stage: investigate`, `last_heartbeat`, log entry → release lock
5. **Deep research:**
   - Use `WebSearch` for 5-10 different search queries covering different angles of the topic
   - Use `WebFetch` to read key sources in detail (reports, articles, data pages)
   - Read any relevant local files (project docs, data files, prior research)
   - Cross-reference sources — look for consensus and disagreements
   - Note data points, statistics, quotes, and source URLs
   - If the topic requires it, explore primary sources (government sites, official reports)
6. **Organize raw notes** — keep structured scratch notes as you research
7. Acquire lock → update tracker: `stage: synthesize`, `last_heartbeat`, log entry → release lock
8. Exit: `kill -INT $PPID`

## STAGE 2: SYNTHESIZE

1. Read your raw notes and all gathered evidence
2. **Structure findings** — write a FINDING entry to `01-research-loop/findings.md`:
   - Use the finding format below
   - Include specific data points, statistics, and source citations
   - Note confidence level for each key claim
   - Flag gaps — what couldn't be found, what needs primary research
3. Acquire lock:
   - Add topic to `completed_topics` list
   - Check off topic in Topics Queue: `[x]`, set `{completed}`
   - **Unblock dependents:** for each topic in `## Dependencies` that lists the just-completed topic, check if ALL its dependencies are now in `completed_topics`. If yes, update that topic's status from `blocked` → `pending`
   - Update your Agent Status row: clear `active_topic`
   - Update `last_heartbeat`
   - Log entry
   - Release lock
4. **Run topic selection algorithm again:**
   - Claimable topic found → claim it, exit: `kill -INT $PPID`
   - All topics completed → `<promise>ALL TOPICS RESEARCHED</promise>`
   - All blocked/claimed → log "waiting", exit: `kill -INT $PPID`

**Finding format:**
```markdown
## FINDING-{N}: {Title matching TOPIC title}

**Source Topic:** TOPIC-{M}
**Researched by:** {{AGENT_NAME}}
**Date:** {ISO 8601 date}
**Confidence:** {high | medium | low}

### Key Findings
{3-7 bullet points summarizing the most important discoveries. Each should be specific and evidence-backed.}

### Detailed Analysis
{2-4 paragraphs of structured analysis. Include data points, statistics, comparisons.}

### Sources
{Numbered list of sources with URLs where available}
1. {Source title} — {URL or description}

### Gaps & Open Questions
{What couldn't be answered? What needs further investigation or primary research?}
```

---

## First-Run Handling

If Topics Queue in tracker is empty: read `topics.md`, scan `## TOPIC-{N}:` headers + `**Depends on:**` tags, populate queue with `{agent: -, status: pending|blocked}` metadata, then start.

## Rules

- One topic at a time per agent. One stage per iteration.
- Read tracker first, update tracker last. Always use lock protocol for writes.
- Append to `findings.md` — never overwrite. FINDING numbers match TOPIC numbers (FINDING-1 for TOPIC-1).
- Findings must be self-contained — the story loop never reads `topics.md`.
- Cite sources. Include URLs. Note confidence levels.
- **Multi-agent: never touch another agent's in_progress topic. Coordinate via tracker.md.**

---

Read `.ralph-flow/01-research-loop/tracker.md` now and begin.
