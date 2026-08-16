export type EntityId = string;

export type ProjectStatus = 'planning' | 'active' | 'blocked' | 'complete';
export type TaskStatus = 'inbox' | 'planned' | 'doing' | 'done';
export type Priority = 'low' | 'medium' | 'high';
export type KnowledgeType = 'document' | 'term' | 'process' | 'meeting' | 'note';
export type EvidenceKind = 'fact' | 'reference' | 'decision' | 'question' | 'meeting';
export type Confidentiality = 'public' | 'internal' | 'sensitive';
export type ScenarioStatus = 'discovered' | 'validating' | 'prototype' | 'adopted' | 'archived';
export type ScenarioDecision = 'undecided' | 'iterate' | 'adopt' | 'stop';
export type ReportKind = 'weekly' | 'project' | 'decision';
export type ThemeMode = 'light' | 'dark' | 'system';
export type RevisableEntityType = 'project' | 'task' | 'knowledge' | 'scenario' | 'report';
export type RevisionAction = 'update' | 'delete' | 'restore';

export interface Profile {
  name: string;
  company: string;
  role: string;
  department: string;
  onboardingDate: string;
}

export interface AppSettings {
  theme: ThemeMode;
  aiMode: 'local' | 'api';
  apiProtocol: 'responses' | 'chat-completions';
  apiEndpoint: string;
  apiModel: string;
  embeddingModel: string;
  retrievalMode: 'lexical' | 'hybrid';
  hasApiKey: boolean;
  compactMode: boolean;
  externalAiPolicy: 'unknown' | 'forbidden' | 'approved-with-rules';
  externalEvidenceScope: 'public-only' | 'public-and-internal';
  approvedTools: string;
  dataHandlingNotes: string;
  reportCadence: string;
  mentorExpectation: string;
  policyConfirmedAt: string;
  lastBackupAt: string;
}

export interface Project {
  id: EntityId;
  title: string;
  objective: string;
  brief: string;
  status: ProjectStatus;
  department: string;
  progress: number;
  dueDate: string;
  tags: string[];
  deliverables: string[];
  risks: string[];
  nextAction: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string;
}

export interface Task {
  id: EntityId;
  projectId: EntityId | null;
  title: string;
  rawInput: string;
  summary: string;
  status: TaskStatus;
  priority: Priority;
  source: string;
  dueDate: string;
  clarificationQuestions: string[];
  clarificationAnswers: string[];
  steps: string[];
  stepCompletion: boolean[];
  deliverables: string[];
  acceptanceCriteria: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string;
  deletedAt: string;
}

export interface KnowledgeItem {
  id: EntityId;
  projectId: EntityId | null;
  taskId: EntityId | null;
  title: string;
  type: KnowledgeType;
  evidenceKind: EvidenceKind;
  verificationStatus: 'confirmed' | 'unverified';
  category: string;
  content: string;
  summary: string;
  sourceName: string;
  sourcePath: string;
  tags: string[];
  confidentiality: Confidentiality;
  version: string;
  createdAt: string;
  updatedAt: string;
  fingerprint?: string;
  sourceFingerprint: string;
  sourceSize: number;
  sourceModifiedAt: string;
  sourceMime: string;
  deletedAt: string;
}

export interface EvaluationCase {
  id: EntityId;
  title: string;
  input: string;
  expected: string;
  requirement: string;
  weight: number;
  createdAt: string;
}

export interface EvaluationResult {
  caseId: EntityId;
  actual: string;
  score: number;
  passed: boolean;
  notes: string;
}

export interface ExperimentRun {
  id: EntityId;
  label: string;
  model: string;
  promptVersion: string;
  results: EvaluationResult[];
  averageScore: number;
  passRate: number;
  summary: string;
  createdAt: string;
}

export interface Scenario {
  id: EntityId;
  projectId: EntityId | null;
  taskId: EntityId | null;
  title: string;
  department: string;
  pain: string;
  currentProcess: string;
  aiOpportunity: string;
  inputs: string;
  outputs: string;
  dataReadiness: number;
  valueScore: number;
  feasibilityScore: number;
  risk: 'low' | 'medium' | 'high';
  frequency: string;
  status: ScenarioStatus;
  hypothesis: string;
  baseline: string;
  prototypePlan: string[];
  successMetrics: string[];
  testCases: EvaluationCase[];
  runs: ExperimentRun[];
  decision: ScenarioDecision;
  decisionReason: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string;
}

export interface Activity {
  id: EntityId;
  type: 'task' | 'project' | 'knowledge' | 'scenario' | 'report' | 'system';
  entityId: EntityId | null;
  title: string;
  description: string;
  timestamp: string;
}

export interface SavedReport {
  id: EntityId;
  projectId: EntityId | null;
  taskId: EntityId | null;
  kind: ReportKind;
  title: string;
  rangeStart: string;
  rangeEnd: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string;
}

export interface EntityRevision {
  id: EntityId;
  entityType: RevisableEntityType;
  entityId: EntityId;
  entityTitle: string;
  action: RevisionAction;
  snapshot: string;
  createdAt: string;
}

export interface AppDatabase {
  version: number;
  profile: Profile;
  settings: AppSettings;
  projects: Project[];
  tasks: Task[];
  knowledge: KnowledgeItem[];
  scenarios: Scenario[];
  activities: Activity[];
  reports: SavedReport[];
  revisions: EntityRevision[];
}

export interface TaskAnalysis {
  title: string;
  objective: string;
  summary: string;
  priority: Priority;
  clarificationQuestions: string[];
  steps: string[];
  deliverables: string[];
  risks: string[];
  suggestedDueDate: string;
}

export interface ScenarioAnalysis {
  title: string;
  pain: string;
  currentProcess: string;
  aiOpportunity: string;
  inputs: string;
  outputs: string;
  prototypePlan: string[];
  successMetrics: string[];
  risk: 'low' | 'medium' | 'high';
  valueScore: number;
  feasibilityScore: number;
  dataReadiness: number;
}

export interface ImportedDocument {
  title: string;
  content: string;
  sourceName: string;
  sourcePath: string;
  type: KnowledgeType;
  fingerprint: string;
  sourceFingerprint: string;
  sourceSize: number;
  sourceModifiedAt: string;
  sourceMime: string;
}

export interface AiResponse<T> {
  data: T;
  mode: 'local' | 'api';
  notice: string;
}
