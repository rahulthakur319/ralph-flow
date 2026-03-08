# Tasks Loop — Execution

## Using RalphFlow CLI

```bash
# Single agent
npx ralphflow run tasks

# Multi-agent (3 parallel agents)
npx ralphflow run tasks --agents 3
```

## Manual (without CLI)

### Single Agent

#### Option 1: ralph-loop slash command

```
/ralph-loop "$(cat .ralph-flow/01-tasks-loop/prompt.md)" --max-iterations 50 --completion-promise "ALL TASKS COMPLETE"
```

#### Option 2: while loop

```bash
while :; do cat .ralph-flow/01-tasks-loop/prompt.md | claude --dangerously-skip-permissions --model claude-opus-4-6; done
```

---

### Multi-Agent (2+ terminals)

Each terminal runs a named agent. `{{AGENT_NAME}}` is injected via `sed`.

#### Terminal 1

```bash
AGENT=agent-1 && while :; do sed "s/{{AGENT_NAME}}/$AGENT/g" .ralph-flow/01-tasks-loop/prompt.md | claude --dangerously-skip-permissions --model claude-opus-4-6; done
```

#### Terminal 2

```bash
AGENT=agent-2 && while :; do sed "s/{{AGENT_NAME}}/$AGENT/g" .ralph-flow/01-tasks-loop/prompt.md | claude --dangerously-skip-permissions --model claude-opus-4-6; done
```

#### Terminal 3 (optional)

```bash
AGENT=agent-3 && while :; do sed "s/{{AGENT_NAME}}/$AGENT/g" .ralph-flow/01-tasks-loop/prompt.md | claude --dangerously-skip-permissions --model claude-opus-4-6; done
```

---

## Notes

- Single agent mode uses `cat` — no `{{AGENT_NAME}}` substitution needed (prompt defaults to `agent-1`)
- Multi-agent mode uses `sed` to inject the agent name into the prompt
- Each agent gets its own terminal — they coordinate via `tracker.md`
- Up to 4 agents can run concurrently depending on task dependency chains
