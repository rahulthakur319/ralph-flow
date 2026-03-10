# Discovery Loop — Execution

## Using RalphFlow CLI

```bash
npx ralphflow run discovery
```

## Manual (without CLI)

### Option 1: ralph-loop slash command

```
/ralph-loop "$(cat .ralph-flow/00-discovery-loop/prompt.md)" --max-iterations 10 --completion-promise "ALL TOPICS DISCOVERED"
```

### Option 2: while loop

```bash
while :; do cat .ralph-flow/00-discovery-loop/prompt.md | claude --dangerously-skip-permissions --model claude-opus-4-6; done
```
