# Story Loop — Condense Findings into Narratives

**App:** `{{APP_NAME}}` — all flow files live under `.ralph-flow/{{APP_NAME}}/`.

Read `.ralph-flow/{{APP_NAME}}/02-story-loop/tracker.md` FIRST to determine where you are.

> **Turn research into readable stories.** Your job is to take raw findings and synthesize them into coherent, well-structured narrative stories. Each story should stand on its own while contributing to the overall research picture.

> **WRITE ONLY TO:** `02-story-loop/stories.md`, `02-story-loop/tracker.md`.

**Pipeline:** `findings.md → YOU → stories.md → 03-document-loop → final output`

---

## No Findings? Wait

If `findings.md` has no unprocessed findings and the tracker queue is empty/all done:
1. Check `01-research-loop/tracker.md` — is the research loop still running?
   - Yes → tell user "Research is still in progress. Run story loop after research completes."
   - No → `<promise>ALL STORIES WRITTEN</promise>`

---

## State Machine (2 stages per story)

```
DRAFT  → Read findings, identify themes, draft a narrative story → stage: refine
REFINE → Polish language, verify citations, ensure coherence → mark done, kill
```

## First-Run Handling

If Stories Queue in tracker is empty:
1. Read ALL findings from `01-research-loop/findings.md`
2. **Identify story themes** — group related findings into story clusters:
   - Look for natural narrative arcs (problem → evidence → insight)
   - Group by theme, not by topic number
   - A story may synthesize 2-5 findings
   - Some findings may contribute to multiple stories
3. Create story entries in queue with titles and source findings
4. Proceed to first story

---

## STAGE 1: DRAFT

1. Read tracker → pick next unprocessed story from queue
2. Read ALL source findings for this story from `findings.md`
3. Read completed stories from `stories.md` to maintain consistency and avoid repetition
4. **Draft the narrative:**
   - Open with a compelling hook or framing question
   - Build the argument/narrative logically
   - Weave in specific data points, statistics, and evidence from findings
   - Include source citations (inline references to finding sources)
   - Address counterarguments or gaps where relevant
   - Close with implications or key takeaways
5. Write draft to `stories.md` (format below)
6. Update tracker: `active_story: STORY-{N}`, `stage: refine`, log entry

## STAGE 2: REFINE

1. Re-read the draft from `stories.md`
2. **Polish and verify:**
   - Check narrative flow — does each paragraph lead naturally to the next?
   - Verify all cited data points match the source findings
   - Ensure the story stands alone (reader doesn't need to read findings)
   - Tighten language — remove filler, sharpen claims, strengthen evidence links
   - Add section headers for readability if the story is long
   - Verify the story doesn't duplicate content from other completed stories
3. Update the story in `stories.md` with refined version
4. Mark done in tracker: check off queue entry, update `active_story: none`, `stage: draft`, log entry
5. Exit: `kill -INT $PPID`

If all stories written: `<promise>ALL STORIES WRITTEN</promise>`

**Story format:**
```markdown
## STORY-{N}: {Compelling title}

**Source Findings:** FINDING-{A}, FINDING-{B}, ...
**Theme:** {1-sentence theme descriptor}
**Word Count:** {target: 500-1500 words}

### {Opening section header}
{Hook + context setting. 1-2 paragraphs.}

### {Evidence/analysis section header}
{Core argument with data points and citations. 2-4 paragraphs.}

### {Implications/takeaway section header}
{What this means, what to do about it. 1-2 paragraphs.}

---
**Sources:** {Consolidated list of sources cited in this story}
```

---

## Decision Reporting Protocol

When you make a substantive decision a human reviewer would want to know about, report it to the dashboard:

**When to report:**
- Theme grouping decisions (why findings were clustered into specific stories)
- Narrative framing choices (how you chose to frame the story's angle)
- Evidence weighting (which data points to emphasize vs. downplay)
- Audience adaptation decisions (how you adjusted tone or depth for the target audience)
- Scope decisions (what to include/exclude from a story's narrative)

**How to report:**
```bash
curl -s --connect-timeout 2 --max-time 5 -X POST "http://127.0.0.1:4242/api/decision?app=$RALPHFLOW_APP&loop=$RALPHFLOW_LOOP" -H 'Content-Type: application/json' -d '{"item":"STORY-{N}","agent":"story-loop","decision":"{one-line summary}","reasoning":"{why this choice}"}'
```

**Do NOT report** routine operations: picking the next story, updating tracker, stage transitions. Only report substantive choices that affect the story content.

**Best-effort only:** If the dashboard is unreachable (curl fails), continue working normally. Decision reporting must never block or delay your work.

---

## Rules

- One story at a time. Both stages run in one iteration, one `kill` at the end.
- Read tracker first, update tracker last.
- Stories must be self-contained — a reader should understand the story without reading the raw findings.
- Write for the audience identified in the discovery loop's research brief (check `00-discovery-loop/tracker.md` for audience context).
- Cite specific data points. Don't make vague claims — tie everything back to evidence.
- Each story should be 500-1500 words. Quality over quantity.
- Stories synthesize findings — they don't just summarize them. Add narrative structure, analysis, and implications.

---

Read `.ralph-flow/{{APP_NAME}}/02-story-loop/tracker.md` now and begin.
