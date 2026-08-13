export type BrowserSessionStatus = 'completed' | 'running' | 'incomplete_capture' | 'recoverable' | 'failed' | 'cancelled' | 'dry_run' | 'surface_blocked';

export type BrowserSessionMode = 'consult' | 'create';

export type BrowserProviderName = 'oracle' | 'native';

export type NativeBrowserChannel = 'chrome' | 'chrome-beta' | 'chrome-dev' | 'chrome-canary';

export type ThinkingLevel = 'light' | 'standard' | 'extended' | 'heavy';

export type BrowserWriteOutputPolicy = 'cli' | 'mcp';

export interface BrowserFileInput {
  path: string;
  delivery?: 'inline';
}

export interface BrowserCreateSessionContext {
  repository: string;
  defaultBranch: string;
  baseCommit: string;
  targetBranch: string;
  planPath: string;
  contractPath: string;
  draftPr: boolean;
  requestedApp: string;
  creationReportPath: string;
}

export type BrowserCreateOutcome = 'pending' | 'dry_run' | 'reported' | 'surface_blocked' | 'provider_failed' | 'recoverable';

export interface BrowserCreatePullRequestEvidence {
  number?: number;
  url?: string;
  draft?: boolean;
  baseBranch?: string;
  headBranch?: string;
  headSha?: string;
}

export interface BrowserCreateReportedGitHubEvidence {
  trust: 'assistant_reported';
  repository: string;
  defaultBranch: string;
  baseCommit: string;
  branch: string;
  targetBranchExisted: boolean;
  commitSha: string;
  pullRequest?: BrowserCreatePullRequestEvidence;
  changedFiles: string[];
  toolEvents: string[];
}

export type BrowserCreateReadBackOutcome =
  | 'dry_run'
  | 'matched'
  | 'mismatch'
  | 'surface_blocked'
  | 'provider_failed'
  | 'recoverable';

export interface BrowserCreateComparisonEvidence {
  baseCommit: string;
  headCommit: string;
  status: 'ahead' | 'identical' | 'diverged';
  aheadBy?: number;
  behindBy?: number;
}

export interface BrowserCreateReadBackEvidence {
  trust: 'assistant_reported_readback';
  repository: string;
  defaultBranch: string;
  baseCommit: string;
  branch: string;
  branchHead: string;
  commitSha: string;
  commitExists: boolean;
  pullRequest?: BrowserCreatePullRequestEvidence;
  changedFiles: string[];
  comparison: BrowserCreateComparisonEvidence;
  readActions: string[];
}

export interface BrowserCreateReadBackMeta {
  sessionId: string;
  outcome: BrowserCreateReadBackOutcome;
  requestedApp: string;
  evidence?: BrowserCreateReadBackEvidence;
  error?: {
    code: string;
    message: string;
    recovery?: string;
  };
}

export interface BrowserCreateSessionMeta extends BrowserCreateSessionContext {
  outcome: BrowserCreateOutcome;
  appSelection: {
    requestedApp: string;
    reportedSelectedApp?: string;
    verified: false;
    source: 'prompt_contract_only';
  };
  reportedGitHub?: BrowserCreateReportedGitHubEvidence;
  readBack?: BrowserCreateReadBackMeta;
}

export interface BrowserConsultInput {
  repoRoot: string;
  title?: string;
  prompt: string;
  sourceSessionId?: string;
  providerSessionId?: string;
  parentProviderSessionId?: string;
  oracleBin?: string;
  gitleaksBin?: string;
  requireSecretScan?: boolean;
  files?: BrowserFileInput[];
  followups?: string[];
  model?: string;
  thinking?: ThinkingLevel;
  /** Generic browser transport never selects a ChatGPT app. Create overrides this with its prompt-contract field. */
  chatgptApp?: never;
  provider?: BrowserProviderName;
  chatgptUrl?: string;
  timeoutMs?: number;
  heartbeatSeconds?: number;
  dryRun?: boolean;
  writeOutput?: string;
  writeOutputPolicy?: BrowserWriteOutputPolicy;
  allowAbsoluteOutput?: boolean;
  overwriteOutput?: boolean;
  sessionRoot?: string;
  maxInlineChars?: number;
  manualLogin?: boolean;
  profileDir?: string;
  profileDirectory?: string;
  browserChannel?: NativeBrowserChannel;
  keepBrowser?: boolean;
  headless?: boolean;
  sessionMode?: BrowserSessionMode;
  createContext?: BrowserCreateSessionContext;
}

export interface BrowserCreateInput extends Omit<
  BrowserConsultInput,
  'chatgptApp' | 'files' | 'provider' | 'requireSecretScan' | 'sessionMode' | 'createContext'
> {
  chatgptApp: string;
  repository: string;
  defaultBranch: string;
  baseCommit: string;
  targetBranch: string;
  planPath: string;
  contractPath: string;
  draftPr?: boolean;
  files?: BrowserFileInput[];
  provider?: 'oracle';
}

export interface BrowserCreateReadBackInput extends Omit<
  BrowserConsultInput,
  'prompt' | 'files' | 'followups' | 'provider' | 'sourceSessionId' | 'providerSessionId' | 'parentProviderSessionId' | 'chatgptApp'
> {
  sessionId: string;
  chatgptApp?: string;
  provider?: 'oracle';
}

export interface BrowserCreateReadBackResult {
  createSessionId: string;
  readBackSessionId: string;
  status: BrowserSessionStatus;
  paths: BrowserSessionPaths;
  meta: BrowserSessionMeta;
  create: BrowserCreateSessionMeta;
  dryRun?: BrowserConsultResult['dryRun'];
  error?: BrowserConsultResult['error'];
}

export interface BrowserImportedArtifact {
  sourcePath: string;
  fileName: string;
  size: number;
}

export interface PromptBundleFile {
  path: string;
  delivery: 'inline';
  size: number;
  sha256: string;
  chars: number;
  content: string;
}

export interface PromptBundle {
  prompt: string;
  rendered: string;
  files: PromptBundleFile[];
  followups: string[];
  totalChars: number;
}

export interface PromptSecretScanReceipt {
  scanner: 'gitleaks';
  version: string;
  source: '--gitleaks-bin' | 'REPO_HARNESS_GITLEAKS_BIN' | 'PATH';
  status: 'passed';
  payloads: Array<{
    kind: 'prompt' | 'followup';
    index: number;
    bytes: number;
    sha256: string;
  }>;
}

export interface BrowserSessionPaths {
  sessionDir: string;
  prompt: string;
  transcript: string;
  output: string;
  events: string;
  artifactsDir: string;
}

export interface BrowserSessionMeta {
  version: 1;
  sessionId: string;
  engine: 'chatgpt-browser';
  mode: BrowserSessionMode;
  provider: BrowserProviderName;
  status: BrowserSessionStatus;
  repo: string;
  createdAt: string;
  updatedAt: string;
  model: {
    requested?: string;
    thinking?: ThinkingLevel;
    verified: boolean;
  };
  browser: {
    mode: 'manual-login';
    chatgptUrl: string;
    /** Legacy read compatibility only; current sessions do not populate this field. */
    chatgptApp?: string;
    channel?: NativeBrowserChannel;
    profileDir?: string;
    profileDirectory?: string;
    selectedProfilePath?: string;
    conversationUrl?: string;
  };
  input: {
    promptPath: string;
    files: Array<{ path: string; delivery: 'inline'; sha256: string; size: number }>;
    followups: number;
  };
  output: {
    outputPath: string;
    transcriptPath: string;
    artifactsDir: string;
    writeOutput?: string;
    artifacts: Array<{ fileName: string; size: number; sourcePath?: string }>;
  };
  diagnostics: {
    dryRun: boolean;
    reattachable: boolean;
    lastCaptureAt: string;
  };
  security?: {
    promptSecretScan: PromptSecretScanReceipt;
  };
  create?: BrowserCreateSessionMeta;
  sourceSessionId?: string;
  providerSessionId?: string;
  parentProviderSessionId?: string;
  oracle?: {
    binary?: string;
    version?: string;
    captureStatus?: 'completed' | 'recoverable';
  };
  error?: {
    code: string;
    message: string;
    recovery?: string;
  };
}

export interface StoredBrowserSessionSummary {
  sessionId: string;
  mode: BrowserSessionMode;
  status: BrowserSessionStatus;
  provider: BrowserProviderName;
  createdAt: string;
  updatedAt: string;
  title?: string;
  outputPath: string;
  transcriptPath: string;
  conversationUrl?: string;
  createOutcome?: BrowserCreateOutcome;
}

export interface StoredBrowserSession {
  meta: BrowserSessionMeta;
  prompt: string;
  transcript: string;
  output: string;
}

export interface BrowserConsultResult {
  sessionId: string;
  status: BrowserSessionStatus;
  output?: string;
  conversationUrl?: string;
  paths: BrowserSessionPaths;
  meta: BrowserSessionMeta;
  dryRun?: {
    promptChars: number;
    totalChars: number;
    files: Array<{ path: string; size: number; chars: number; sha256: string }>;
    command?: string[];
    secretScan?: PromptSecretScanReceipt;
  };
  error?: {
    code: string;
    message: string;
    recovery?: string;
  };
  artifacts?: BrowserImportedArtifact[];
}
