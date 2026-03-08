# Story Loop — Execution

## Using RalphFlow CLI

```bash
npx ralphflow run story
```

## Manual (without CLI)

### Option 1: ralph-loop slash command

```
/ralph-loop "$(cat .ralph-flow/00-story-loop/prompt.md)" --max-iterations 30 --completion-promise "ALL STORIES PROCESSED"
```

### Option 2: while loop

```bash
while :; do cat .ralph-flow/00-story-loop/prompt.md | claude --dangerously-skip-permissions --model claude-opus-4-6; done
```
