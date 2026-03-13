// Pipeline config (parsed from ralphflow.yaml)

export interface RalphFlowConfig {
  name: string;
  description: string;
  version: number;
  dir: string;
  entities: Record<string, EntityConfig>;
  loops: Record<string, LoopConfig>;
}

export interface EntityConfig {
  prefix: string;
  data_file: string;
}

export interface LoopConfig {
  order: number;
  name: string;
  prompt: string;
  tracker: string;
  data_files?: string[];
  directories?: string[];
  entities?: string[];
  stages: string[];
  completion: string;
  feeds?: string[];
  fed_by?: string[];
  multi_agent: MultiAgentConfig | false;
  model?: string;
  lock?: LockConfig;
  worktree?: WorktreeConfig;
  cadence: number;
}

export interface MultiAgentConfig {
  enabled: boolean;
  max_agents: number;
  strategy: string;
  agent_placeholder: string;
}

export interface LockConfig {
  file: string;
  type: string;
  stale_seconds: number;
}

export interface WorktreeConfig {
  strategy: string;
  auto_merge: boolean;
}

// Runtime

export interface RunOptions {
  model?: string;
  maxIterations: number;
  multiAgent: boolean;
  flow?: string;
  cwd: string;
}

export interface ClaudeResult {
  output: string;
  exitCode: number | null;
  signal: string | null;
}

export interface TrackerStatus {
  loop: string;
  stage: string;
  active: string;
  completed: number;
  total: number;
  agents?: AgentStatus[];
}

export interface AgentStatus {
  name: string;
  activeTask: string;
  stage: string;
  lastHeartbeat: string;
}
