import type {
  AiResponse,
  AppDatabase,
  ImportedDocument,
  ScenarioAnalysis,
  TaskAnalysis,
} from './models';

export interface AssistantRequest {
  instruction: string;
  context: string;
}

export interface DesktopBridge {
  data: {
    load: () => Promise<AppDatabase>;
    save: (database: AppDatabase) => Promise<{ ok: true }>;
    resetDemo: () => Promise<AppDatabase>;
  };
  ai: {
    analyzeTask: (rawInput: string, context: string) => Promise<AiResponse<TaskAnalysis>>;
    analyzeScenario: (rawInput: string, context: string) => Promise<AiResponse<ScenarioAnalysis>>;
    generateReport: (database: AppDatabase, rangeStart: string, rangeEnd: string) => Promise<AiResponse<string>>;
    ask: (request: AssistantRequest) => Promise<AiResponse<string>>;
    embed: (inputs: string[]) => Promise<{ vectors: number[][]; model: string }>;
    testConnection: () => Promise<{ ok: boolean; message: string; latencyMs?: number; protocol?: string }>;
  };
  files: {
    importDocuments: () => Promise<ImportedDocument[]>;
    exportBackup: (database: AppDatabase, passphrase: string) => Promise<{ canceled: boolean; path: string }>;
    selectBackup: () => Promise<{ canceled: boolean; encrypted: boolean; payload: unknown }>;
    decodeBackup: (payload: unknown, passphrase?: string) => Promise<AppDatabase>;
    verifySourceFile: (expectedFingerprint: string) => Promise<{ canceled: boolean; valid: boolean; fileName: string; fingerprint: string }>;
    exportMarkdown: (suggestedName: string, content: string) => Promise<{ canceled: boolean; path: string }>;
    verifyAuditFile: () => Promise<{ canceled: boolean; valid: boolean; message: string }>;
  };
  credentials: {
    setApiKey: (apiKey: string) => Promise<{ ok: boolean; message: string }>;
    clearApiKey: () => Promise<{ ok: boolean }>;
  };
  window: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<boolean>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    onQuickCapture: (callback: () => void) => () => void;
  };
  app: {
    getInfo: () => Promise<{ version: string; platform: string; dataPath: string }>;
  };
}
