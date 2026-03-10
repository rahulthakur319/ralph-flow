# Document Loop — Execution

## Using RalphFlow CLI

```bash
npx ralphflow run document
```

## Manual (on-demand, single run)

### Option 1: ralph-loop slash command

```
/ralph-loop "$(cat .ralph-flow/03-document-loop/prompt.md)" --max-iterations 1 --completion-promise "DOCUMENT COMPLETE"
```

### Option 2: Direct invocation (no while loop — runs once)

```bash
cat .ralph-flow/03-document-loop/prompt.md | claude --dangerously-skip-permissions --model claude-opus-4-6
```

---

## Notes

- This is an **on-demand** loop — it runs once to produce the final document, not in a recurring while loop
- Run this after the story loop has completed all stories
- The agent will ask for output format preferences if not specified in the research brief
- Output files are written to the project root directory
