import Anthropic from '@anthropic-ai/sdk';
import cliProgress from 'cli-progress';
import type { ClaudeMessage } from '../types/index.js';
import { JSONLParser } from '../parsers/jsonl-parser.js';

interface AIAnalysisResult {
  insights: Array<{
    type: 'uncertainty' | 'correction' | 'learning' | 'assumption' | 'confusion' | 'realization' | 'pattern';
    description: string;
    evidence: string;
    confidence: number;
    timestamp?: string;
  }>;
  userPatterns: Array<{
    type: 'repetitive' | 'correction' | 'workflow' | 'preference' | 'communication';
    pattern: string;
    frequency: number;
    examples: string[];
  }>;
  summary: {
    totalInsights: number;
    topChallenges: string[];
    collaborationStyle: string;
    aiEvolution: string;
  };
}

export class AIPoweredAnalyzer {
  private anthropic: Anthropic;
  private progressBar: cliProgress.SingleBar;

  constructor() {
    // Initialize Anthropic client - will use ANTHROPIC_API_KEY env var
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    this.progressBar = new cliProgress.SingleBar({
      format: 'Analyzing |{bar}| {percentage}% | {value}/{total} chunks | ETA: {eta}s | {status}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });
  }

  private readonly ANALYSIS_PROMPT = `
You are analyzing a Claude Code conversation to extract deep insights about AI reasoning patterns and user collaboration styles.

Analyze this conversation chunk and identify:

**AI INSIGHTS:**
- **Uncertainty moments**: Where Claude shows doubt, needs to explore, or is unsure
- **Course corrections**: Where Claude realizes mistakes and changes approach  
- **Learning moments**: Where Claude discovers new info about the project/codebase
- **Assumptions**: Where Claude takes shortcuts or assumes without verification
- **Confusion points**: Where Claude gets lost or misunderstands intent
- **Realization moments**: Breakthrough understanding or "aha" moments
- **Behavioral patterns**: How Claude's approach evolves through the conversation

**USER PATTERNS:**
- **Repetitive requests**: Things user asks for multiple times
- **Correction style**: How user redirects Claude when off-track
- **Workflow preferences**: User's preferred development processes  
- **Communication patterns**: How user prefers to interact with AI
- **Technical preferences**: Technologies, approaches, styles user consistently chooses

**META ANALYSIS:**
- What are the biggest collaboration challenges?
- How does the AI-human partnership evolve?
- What does Claude learn about this specific user?
- What recurring misconceptions appear?

Return your analysis as a JSON object with this structure:
{
  "insights": [
    {
      "type": "uncertainty|correction|learning|assumption|confusion|realization|pattern",
      "description": "What happened and why it's significant",
      "evidence": "Direct quote or paraphrase showing this pattern", 
      "confidence": 0.8,
      "timestamp": "optional timestamp if relevant"
    }
  ],
  "userPatterns": [
    {
      "type": "repetitive|correction|workflow|preference|communication",
      "pattern": "Description of the pattern",
      "frequency": 3,
      "examples": ["example 1", "example 2"]
    }
  ],
  "summary": {
    "totalInsights": 12,
    "topChallenges": ["challenge 1", "challenge 2"],
    "collaborationStyle": "Description of how they work together",
    "aiEvolution": "How Claude's understanding developed"
  }
}

CONVERSATION:
{conversation}
`;

  async analyzeConversation(
    messages: ClaudeMessage[], 
    maxDepth: number = 100,
    tokensPerChunk: number = 45000 // Leave room for prompt overhead
  ): Promise<AIAnalysisResult> {
    
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }

    // Limit messages by depth
    const limitedMessages = messages.slice(-maxDepth) || [];
    
    // Create chunks based on token estimation
    const chunks = this.createTokenAwareChunks(limitedMessages, tokensPerChunk);
    
    console.log(`\n🧠 Starting AI-powered analysis with ${chunks.length} chunks (${limitedMessages.length} messages, max depth: ${maxDepth})`);
    
    this.progressBar.start(chunks.length, 0, { status: 'Initializing...' });

    const allResults: AIAnalysisResult[] = [];

    try {
      for (let i = 0; i < chunks.length; i++) {
        this.progressBar.update(i, { status: `Analyzing chunk ${i + 1}/${chunks.length}` });
        
        const chunk = chunks[i];
        if (!chunk || chunk.length === 0) continue;
        
        const formattedConversation = this.formatChunkForAnalysis(chunk);
        
        try {
          const response = await this.anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 4000,
            temperature: 0.1,
            messages: [{
              role: 'user',
              content: this.ANALYSIS_PROMPT.replace('{conversation}', formattedConversation)
            }]
          });

          const content = response.content[0];
          if (content && content.type === 'text') {
            try {
              const result = JSON.parse((content as any).text) as AIAnalysisResult;
              allResults.push(result);
            } catch (parseError) {
              console.warn(`Failed to parse JSON response for chunk ${i + 1}`);
            }
          }

          // Rate limiting - be respectful
          if (i < chunks.length - 1) {
            await this.delay(1000);
          }

        } catch (apiError) {
          console.warn(`API error for chunk ${i + 1}:`, apiError);
          continue;
        }
      }

      this.progressBar.update(chunks.length, { status: 'Aggregating results...' });
      
      // Aggregate all results
      const aggregatedResult = this.aggregateResults(allResults);
      
      this.progressBar.stop();
      console.log('\n✅ Analysis complete!\n');
      
      return aggregatedResult;

    } catch (error) {
      this.progressBar.stop();
      console.error('\n❌ Analysis failed:', error);
      throw error;
    }
  }

  private createTokenAwareChunks(messages: ClaudeMessage[], maxTokens: number): ClaudeMessage[][] {
    const chunks: ClaudeMessage[][] = [];
    let currentChunk: ClaudeMessage[] = [];
    let currentTokens = 0;

    for (const message of messages) {
      const messageText = this.extractMessageContent(message);
      const estimatedTokens = Math.ceil(messageText.length / 4); // Rough estimation: 4 chars per token
      
      if (currentTokens + estimatedTokens > maxTokens && currentChunk.length > 0) {
        chunks.push([...currentChunk]);
        currentChunk = [];
        currentTokens = 0;
      }
      
      currentChunk.push(message);
      currentTokens += estimatedTokens;
    }
    
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }

  private formatChunkForAnalysis(messages: ClaudeMessage[]): string {
    return messages.map(msg => {
      const role = msg.type === 'user' ? 'Human' : 'Assistant';
      const content = this.extractMessageContent(msg);
      const timestamp = new Date(msg.timestamp).toLocaleTimeString();
      
      return `[${timestamp}] ${role}: ${content}`;
    }).join('\n\n---\n\n');
  }

  private extractMessageContent(message: ClaudeMessage): string {
    if (message.type === 'user') {
      return JSONLParser.extractUserText(message);
    } else if (message.type === 'assistant') {
      const textBlocks = JSONLParser.extractAssistantText(message);
      return textBlocks.join('\n');
    } else if (message.type === 'summary' && message.summary) {
      return `[Session Summary: ${message.summary}]`;
    }
    return '[Non-text message]';
  }

  private aggregateResults(results: AIAnalysisResult[]): AIAnalysisResult {
    const allInsights = results.flatMap(r => r.insights);
    const allUserPatterns = results.flatMap(r => r.userPatterns);
    
    // Merge similar patterns
    const mergedPatterns = this.mergeUserPatterns(allUserPatterns);
    
    // Extract top challenges across all chunks
    const allChallenges = results.flatMap(r => r.summary.topChallenges);
    const challengeCounts = allChallenges.reduce((acc, challenge) => {
      acc[challenge] = (acc[challenge] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const topChallenges = Object.entries(challengeCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([challenge]) => challenge);

    return {
      insights: allInsights,
      userPatterns: mergedPatterns,
      summary: {
        totalInsights: allInsights.length,
        topChallenges,
        collaborationStyle: this.synthesizeCollaborationStyle(results),
        aiEvolution: this.synthesizeEvolution(results)
      }
    };
  }

  private mergeUserPatterns(patterns: AIAnalysisResult['userPatterns']): AIAnalysisResult['userPatterns'] {
    const merged = new Map<string, AIAnalysisResult['userPatterns'][0]>();
    
    for (const pattern of patterns) {
      const key = `${pattern.type}:${pattern.pattern}`;
      const existing = merged.get(key);
      
      if (existing) {
        existing.frequency += pattern.frequency;
        existing.examples.push(...pattern.examples);
      } else {
        merged.set(key, { ...pattern });
      }
    }
    
    return Array.from(merged.values())
      .sort((a, b) => b.frequency - a.frequency);
  }

  private synthesizeCollaborationStyle(results: AIAnalysisResult[]): string {
    const styles = results.map(r => r.summary.collaborationStyle).filter(Boolean);
    return styles[0] || 'Collaborative and iterative approach';
  }

  private synthesizeEvolution(results: AIAnalysisResult[]): string {
    const evolutions = results.map(r => r.summary.aiEvolution).filter(Boolean);
    return evolutions[0] || 'Claude adapted to user preferences over time';
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}