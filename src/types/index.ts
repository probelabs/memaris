export interface ClaudeMessage {
  type: 'user' | 'assistant' | 'summary' | 'tool_result';
  message?: {
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
    id?: string;
    model?: string;
    usage?: TokenUsage;
  };
  summary?: string;
  uuid: string;
  timestamp: string;
  parentUuid?: string | null;
  sessionId: string;
  cwd: string;
  gitBranch?: string;
  version?: string;
}

export interface ContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: any;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface ProjectInfo {
  path: string;
  name: string;
  lastModified: number;
  sessionCount: number;
  sessions: SessionInfo[];
  recentActivity: number;
}

export interface SessionInfo {
  id: string;
  filePath: string;
  lastModified: number;
  messageCount: number;
  lastMessageTime: string;
  size: number;
}

export interface AIInsight {
  id: string;
  timestamp: string;
  content: string;
  type: 'uncertainty' | 'correction' | 'learning' | 'assumption' | 'confusion' | 'realization';
  context: string;
  confidence: number;
  sessionId: string;
  messageUuid: string;
}

export interface UserPattern {
  id: string;
  type: 'repetitive_request' | 'correction' | 'workflow' | 'preference';
  pattern: string;
  frequency: number;
  examples: PatternExample[];
  firstSeen: string;
  lastSeen: string;
}

export interface PatternExample {
  sessionId: string;
  timestamp: string;
  content: string;
  context: string;
}

export interface AnalysisReport {
  projectName: string;
  totalSessions: number;
  totalMessages: number;
  analysisDate: string;
  timeRange: {
    from: string;
    to: string;
  };
  aiInsights: AIInsight[];
  userPatterns: UserPattern[];
  summary: {
    topInsightTypes: Array<{ type: string; count: number }>;
    topPatterns: Array<{ pattern: string; frequency: number }>;
    activityTrend: 'increasing' | 'decreasing' | 'stable';
  };
}

export interface AnalysisConfig {
  projectPath?: string;
  analyzeAll?: boolean;
  recent?: boolean;
  deep?: boolean;
  outputFormat?: 'json' | 'markdown' | 'csv';
  outputPath?: string;
  dateRange?: {
    from?: string;
    to?: string;
  };
}