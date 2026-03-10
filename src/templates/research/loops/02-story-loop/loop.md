# Story Loop — Execution

## Using RalphFlow CLI

```bash
npx ralphflow run story
```

## Manual (without CLI)

### Option 1: ralph-loop slash command

```
/ralph-loop "$(cat .ralph-flow/02-story-loop/prompt.md)" --max-iterations 20 --completion-promise "ALL STORIES WRITTEN"
```

### Option 2: while loop

```bash
while :; do cat .ralph-flow/02-story-loop/prompt.md | claude --dangerously-skip-permissions --model claude-opus-4-6; done
```
