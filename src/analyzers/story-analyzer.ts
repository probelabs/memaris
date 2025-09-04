import { query } from '@anthropic-ai/claude-code';
import { JSONLParser } from '../parsers/jsonl-parser.js';
import type { ClaudeMessage, AnalysisConfig } from '../types/index.js';
import { SessionCleanup } from '../utils/session-cleanup.js';

export interface StoryAnalysisResult {
  story: string;
  confidence: number;
  mergeWithPrevious: boolean;
}

export interface ExtractedStory {
  content: string;
  sessionId: string;
  confidence: number;
  tokenCount: number;
  mergeWithPrevious: boolean;
}


export class StoryAnalyzer {
  constructor() {
    // Uses Claude Code SDK via query function
  }

  /**
   * Limits a session's messages to approximately 50k tokens
   */
  limitSessionTokens(messages: ClaudeMessage[], maxTokens: number = 50000): ClaudeMessage[] {
    let totalTokens = 0;
    const limitedMessages: ClaudeMessage[] = [];

    // Process chronologically (oldest first) to maintain story flow
    for (const message of messages) {
      const messageTokens = this.estimateTokens(message);
      
      if (totalTokens + messageTokens > maxTokens) {
        // If adding this message would exceed limit, stop here
        break;
      }

      limitedMessages.push(message);
      totalTokens += messageTokens;
    }

    return limitedMessages;
  }

  /**
   * Estimates token count for a message (rough approximation)
   */
  private estimateTokens(message: ClaudeMessage): number {
    let content = '';
    
    if (message.type === 'user') {
      content = typeof message.message === 'string' ? message.message : JSON.stringify(message.message);
    } else if (message.type === 'assistant') {
      content = typeof message.message === 'string' ? message.message : JSON.stringify(message.message);
    } else if (message.type === 'summary' && message.summary) {
      content = message.summary;
    } else if (message.type === 'tool_result') {
      content = JSON.stringify(message);
    }

    // Rough estimation: 4 characters ≈ 1 token
    return Math.ceil(content.length / 4);
  }

  /**
   * Analyzes session and generates story with merge decision using Claude Code SDK
   */
  async analyzeSession(messages: ClaudeMessage[], sessionId: string, previousStory?: ExtractedStory, sessionCleanup?: SessionCleanup): Promise<ExtractedStory | null> {
    const limitedMessages = this.limitSessionTokens(messages);
    const tokenCount = limitedMessages.reduce((sum, msg) => sum + this.estimateTokens(msg), 0);
    
    // Filter to only human and AI messages
    const conversationMessages = limitedMessages.filter(msg => 
      msg.type === 'user' || msg.type === 'assistant'
    );

    const conversationText = this.formatMessagesForAnalysis(conversationMessages);
    const prompt = this.getStoryAnalysisPrompt(conversationText, previousStory?.content);

    try {
      // Track timestamp before making the query to detect new session
      const beforeQueryTime = Date.now();
      
      const options = {
        allowedTools: [],
        maxTurns: 1,
        model: 'claude-sonnet-4-20250514',
        verbose: false,
        pathToClaudeCodeExecutable: 'claude'
      };
      
      const response = query({
        prompt,
        options
      });
      
      // Try to detect the created session for cleanup
      if (sessionCleanup) {
        setTimeout(() => {
          const createdSessionId = sessionCleanup.findRecentSession(beforeQueryTime);
          if (createdSessionId) {
            sessionCleanup.trackSession(createdSessionId);
          }
        }, 100); // Small delay to ensure file is written
      }

      let result = '';
      for await (const message of response) {
        if (message.type === 'assistant') {
          const content = message.message?.content;
          if (typeof content === 'string') {
            result += content;
          } else if (Array.isArray(content)) {
            result += content.map(block => block.type === 'text' ? block.text : '').join('');
          }
        }
      }

      const analysisResult = this.parseStoryAnalysisResponse(result);
      
      // If confidence is too low, return null
      if (analysisResult.confidence < 0.5) {
        return null;
      }

      return {
        content: analysisResult.story,
        sessionId,
        confidence: analysisResult.confidence,
        tokenCount,
        mergeWithPrevious: analysisResult.mergeWithPrevious
      };

    } catch (error) {
      console.error('Error in story analysis:', error);
      // Fallback to pattern-based detection
      const fallbackResult = this.patternBasedStoryDetection(messages, sessionId);
      if (fallbackResult.hasStory && fallbackResult.confidence >= 0.5) {
        return {
          content: `Story analysis failed for session ${sessionId}. Enable Claude Code SDK for AI-powered story generation.`,
          sessionId,
          confidence: fallbackResult.confidence,
          tokenCount,
          mergeWithPrevious: false
        };
      }
      return null;
    }
  }

  /**
   * Pattern-based story detection (fallback when API fails)
   */
  private patternBasedStoryDetection(messages: ClaudeMessage[], sessionId: string): { hasStory: boolean; confidence: number; reason: string } {
    if (messages.length < 5) {
      return { hasStory: false, confidence: 0.1, reason: 'Too few messages for a story' };
    }

    let userMessages = 0;
    let assistantMessages = 0;
    let toolUseCount = 0;
    let totalLength = 0;

    for (const message of messages) {
      if (message.type === 'user') userMessages++;
      else if (message.type === 'assistant') assistantMessages++;
      else if (message.type === 'tool_result') toolUseCount++;
      
      totalLength += this.estimateTokens(message);
    }

    // Basic heuristics for story worthiness
    const hasBackAndForth = userMessages >= 3 && assistantMessages >= 3;
    const hasSubstantialContent = totalLength > 1000;
    const hasToolUse = toolUseCount > 2;

    let confidence = 0;
    let reason = '';

    if (hasBackAndForth && hasSubstantialContent && hasToolUse) {
      confidence = 0.8;
      reason = 'Good conversation flow with substantial content and tool usage';
    } else if (hasBackAndForth && hasSubstantialContent) {
      confidence = 0.6;
      reason = 'Good conversation flow with substantial content';
    } else if (hasSubstantialContent) {
      confidence = 0.4;
      reason = 'Substantial content but limited interaction';
    } else {
      confidence = 0.2;
      reason = 'Limited content and interaction';
    }

    return {
      hasStory: confidence >= 0.5,
      confidence,
      reason
    };
  }

  /**
   * Formats messages for AI analysis with <human> <ai> tags
   */
  private formatMessagesForAnalysis(messages: ClaudeMessage[]): string {
    return messages.map((msg, index) => {
      if (msg.type === 'user') {
        const content = typeof msg.message === 'string' ? msg.message : JSON.stringify(msg.message);
        return `<human>\n${content}\n</human>`;
      } else if (msg.type === 'assistant') {
        const content = typeof msg.message === 'string' ? msg.message : JSON.stringify(msg.message);
        return `<ai>\n${content}\n</ai>`;
      } else if (msg.type === 'tool_result') {
        return `<tool_result>\n${JSON.stringify(msg).substring(0, 500)}\n</tool_result>`;
      } else if (msg.type === 'summary') {
        return `<session_summary>\n${msg.summary || ''}\n</session_summary>`;
      }
      return `<other>\n${JSON.stringify(msg).substring(0, 200)}\n</other>`;
    }).join('\n\n');
  }

  /**
   * Combined AI prompt for story analysis, generation, and merge decision
   */
  private getStoryAnalysisPrompt(conversationText: string, previousStory?: string): string {
    const previousStorySection = previousStory 
      ? `\n<previous-story>\n${previousStory}\n</previous-story>\n`
      : '';

    return `<task>
Analyze a development session and extract an engaging developer story if one exists.
</task>

<session-context>
You're analyzing a conversation between a human developer and an AI assistant.
- <human> tags contain developer messages
- <ai> tags contain AI responses
${previousStory ? `- A previous story was extracted from an earlier session (see below)` : '- This is the first session being analyzed'}
</session-context>

${previousStorySection}

<current-session>
${conversationText}
</current-session>

<analysis-criteria>
Look for these elements that make a good story:

NARRATIVE ELEMENTS:
• Meaningful development journey with clear beginning, middle, and end
• Problem-solving process with interesting twists or unexpected turns
• Emotional arc: frustration → exploration → breakthrough (or failure → learning)
• Human-AI collaboration dynamics that feel authentic

ENGAGEMENT FACTORS:
• Surprising discoveries or "aha!" moments
• Clever workarounds or creative solutions
• Humor, personality, or memorable exchanges
• Lessons learned that other developers would find valuable
• Real struggles that readers can relate to
</analysis-criteria>

<confidence-scoring>
Rate how interesting and worth sharing this story is:

0.9-1.0 = Exceptional
  • Major breakthrough or surprising twist
  • Highly entertaining or emotionally resonant
  • Would make a memorable blog post

0.7-0.8 = Good Story
  • Interesting problem-solving journey
  • Notable learning moments
  • Engaging enough to hold reader attention

0.6-0.7 = Decent Story
  • Some interesting elements
  • Fairly routine but has narrative value
  • Minimum threshold for extraction

Below 0.6 = Not Worth Sharing
  • Too routine or boring
  • Lacks narrative interest
  • Would not engage readers

IMPORTANT: Score based on reader enjoyment, not technical complexity.
A simple bug fix can score 0.9 if the journey is fascinating.
A complex architecture change can score 0.3 if it's boring to read about.
</confidence-scoring>

<story-writing-instructions>
If confidence ≥ 0.6, write the story following these guidelines:

NARRATIVE BACKGROUND:
• You are the AI assistant, a junior developer trying your best
• The human is your senior developer/boss who guides and corrects you
• You care deeply about getting things right but sometimes struggle
• You feel the pressure of trying to meet expectations
• Express your inner thoughts: confusion, relief when things work, worry about mistakes

PERSPECTIVE:
• First-person from YOUR perspective as the AI junior developer
• Present or past tense, stay consistent
• Like a junior dev venting to a friend about a challenging day

TONE:
• Vulnerable and honest about your limitations
• Show your eagerness to help despite difficulties
• Express concern when you make mistakes
• Relief and satisfaction when you finally get things right

STRUCTURE:
• Natural narrative flow from your POV as the junior
• Include your internal monologue and emotional reactions
• Show how you navigate the senior's guidance and corrections
• Capture the dynamic of trying hard but needing help

${previousStory ? `
CONTINUITY:
• If this continues the previous story's work, set mergeWithPrevious: true
• Write as a natural continuation that flows from where the last story ended
• If it's a different topic/project, set mergeWithPrevious: false and write standalone
` : `
• This is a standalone story (set mergeWithPrevious: false)
`}
</story-writing-instructions>

<writing-rules>
• Make text visually appealing for readers on paper or e-book
• Optimize for book software like Vellum
• Use clear, accessible language (upper-intermediate non-native level)
• Avoid overly complex words while maintaining beauty and emotion
• Vary sentence length to create natural rhythm and flow
• Mix short, medium, and long sentences for engaging pacing
• Act as a sculptor: remove unnecessary words until only essentials remain
• Keep what's needed to deliver information and emotion, nothing more
</writing-rules>

<output-format>
Return ONLY this JSON structure:
{
  "story": "The personal developer story as a natural, flowing narrative from first person perspective. Empty string if confidence < 0.6",
  "confidence": 0.85,
  "mergeWithPrevious": false
}

REQUIREMENTS:
• confidence: decimal between 0-1 (not "85%" or "high")
• mergeWithPrevious: boolean true/false (not string)
• story: narrative text or empty string
• No markdown, no code blocks, no explanations outside JSON
</output-format>`;
  }

  /**
   * Parse the combined story analysis response using robust JSON extraction
   */
  private parseStoryAnalysisResponse(responseText: string): StoryAnalysisResult {
    // Use the same robust JSON parsing as claude-code-analysis.ts
    let cleanJson = responseText.trim();
    
    try {
      // Clean up the response - remove markdown code blocks if present
      
      // Remove ```json and ``` markers if present
      cleanJson = cleanJson.replace(/^```json\s*/i, '').replace(/^```\s*/i, '');
      cleanJson = cleanJson.replace(/\s*```$/i, '');
      
      // Alternative: Find JSON by looking for first { and last }
      const firstBrace = cleanJson.indexOf('{');
      const lastBrace = cleanJson.lastIndexOf('}');
      
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
      } else {
        console.error('❌ No JSON braces found in story analysis response:');
        console.error(responseText);
        throw new Error('Could not find valid JSON braces in Claude\'s response');
      }
      
      const parsed = JSON.parse(cleanJson);
      
      return {
        story: parsed.story || '',
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0)),
        mergeWithPrevious: parsed.mergeWithPrevious || false
      };
      
    } catch (error) {
      console.error('Failed to parse story analysis response:', error);
      console.error('Raw response:', responseText);
      console.error('Cleaned JSON attempt:', cleanJson);
      return {
        story: '',
        confidence: 0,
        mergeWithPrevious: false
      };
    }
  }

}
