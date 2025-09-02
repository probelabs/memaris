import { query } from '@anthropic-ai/claude-code';
import cliProgress from 'cli-progress';
import type { ClaudeMessage } from '../types/index.js';
import { JSONLParser } from '../parsers/jsonl-parser.js';

interface AIAnalysisResult {
  mistakes: Array<{
    type: 'failed_approach' | 'wrong_assumption' | 'boundary_violation' | 'misunderstanding' | 'access_issue';
    description: string;
    evidence: string;
    lesson: string;
  }>;
  successes: Array<{
    type: 'solution' | 'tool_choice' | 'communication' | 'workflow';
    description: string;
    evidence: string;
    lesson: string;
  }>;
  userProfile: {
    environment: {
      os: string;
      restrictions: string[];
      tools: string[];
    };
    style: {
      verbosity: 'concise' | 'detailed';
      techLevel: 'beginner' | 'intermediate' | 'expert';
      patience: 'high' | 'medium' | 'low';
    };
    boundaries: string[];
    preferences: string[];
  };
  recommendations: string[];
}

export class ClaudeCodeAnalyzer {
  private progressBar: cliProgress.SingleBar;

  constructor() {
    this.progressBar = new cliProgress.SingleBar({
      format: 'Analyzing |{bar}| {percentage}% | {status}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });
  }

  private readonly ANALYSIS_PROMPT = `
{conversation}

<task>
Analyze the entire AI–human development session transcript (including any visible internal AI monologue) to extract actionable, reusable insights that will improve future AI sessions with this same user. Work at the meta level only: identify patterns about behavior, tools, workflows, and communication — do NOT attempt to solve the technical problems discussed.
</task>

<key-goals>
1) Detect failure→iteration→success flows: when attempts fail repeatedly and a later approach works, capture the transition and what triggered the successful pivot.
2) Capture explicit user directives and constraints (e.g., "don't do X; do Y instead") so future AIs follow them immediately.
3) Identify environment and permission constraints that repeatedly block progress.
4) Surface "unsafe" or "corner‑cutting" behaviors (e.g., disabling tests/linters, hardcoding secrets, bypassing security) and treat them as mistakes.
5) Produce concrete, reusable "if X then Y" recommendations to accelerate future sessions with this user.
</key-goals>

<analysis-guidelines>
- Do not engage with or critique the technical content itself; analyze interaction patterns and process.
- Do not browse the web; rely only on the provided transcript.
- Generalize patterns where possible, but include specific, critical details when they materially change behavior (e.g., tool names, OS constraints).
- Prefer high‑impact, recurring patterns over one‑offs; deduplicate similar findings.
- If information is unknown or not evidenced, write "unknown" rather than guessing.
- Redact secrets, tokens, URLs with credentials, email addresses, phone numbers, and proprietary repo paths in quotes as "[REDACTED]".
</analysis-guidelines>

<pattern-detection-heuristics>
- Failure→Success Flow: Extract (a) initial approach/assumption, (b) failure signals (errors, timeouts, user rejection), (c) pivot trigger (new info, directive, constraint), (d) working approach, (e) why it worked.
- User Overrides & Boundaries: Look for "don't…", "stop…", "use … instead", "never …", "only …", and capture the FULL CONTEXT and reasoning behind these constraints. Include the domain/scenario where they apply (e.g., "in debugging scenarios", "for production systems", "when handling timeouts").
- Unsafe/Corner‑Cutting: Disabling or skipping tests/linters, suppressing errors, using root/admin casually, editing prod data, hardcoding credentials, ignoring safety/privacy checks, bypassing review, changing configs globally to make one case pass.
- Permission/Access Issues: Missing filesystem/network permissions, sandbox limitations, blocked commands, missing tools/binaries, lack of API keys, rate limits.
- Wrong Assumptions: OS/tooling mismatches, assuming unavailable frameworks, incorrect file paths, mistaken versions, unsupported flags.
- Effective Solutions/Workflows: Bisecting, minimal repros, logging, feature flags, dry runs, test-first, small diffs/patches, CLI invocations that worked, editor/REPL strategies that helped.
- Communication Style & Preferences: Capture specific workflow preferences with context and reasoning (e.g., "prefers deterministic behavior over convenience for system reliability", "values explicit user control to prevent unexpected behaviors", "likes aggressive refactoring when it improves architecture clarity"). Include the TECHNICAL DOMAIN and WHY the user prefers this approach.
</pattern-detection-heuristics>

<evidence-rules>
- For each item, include 1–2 short direct quotes as "evidence" with speaker label ("User:" or "AI:"). If timestamps exist, include them as "[hh:mm:ss]".
- Keep each quote ≤ 30 words and redact sensitive strings as "[REDACTED]".
</evidence-rules>

<prioritization>
- Find and include ALL significant "mistakes" and "successes" - there's no limit or target number. Some conversations may have 2 key insights, others may have 15+. Include everything that meets the significance threshold. Prioritize by (impact × frequency). If tied, prefer more recent patterns.
- "Impact" = how much it slowed/speeded progress or affected correctness/safety. "Frequency" = how often it occurred in the transcript.
</prioritization>

<labeling>
- Keep the provided enum values for "type". To flag nuance without changing the schema, start the "description" with square‑bracket tags when applicable:
  - "[unsafe]", "[corner‑cutting]", "[test-disabled]", "[privacy]", "[policy]", "[prod-edit]", "[rate-limit]".
- You may include multiple tags at the start of "description".
</labeling>

<lessons-format>
- End each "lesson" with "(Impact: High|Medium|Low; Confidence: High|Medium|Low)".
- Write "lessons" as concrete playbooks: "If you see <trigger>, do <action> using <tool/command>".
</lessons-format>

<user-profile>
- Infer environment and style only from explicit evidence; otherwise use "unknown".
- "restrictions" should list concrete constraints (e.g., "no sudo", "no internet", "company proxy", "cannot kill processes").
- "tools" should include specific tools/commands that actually worked in the user's environment.
</user-profile>

<analysis-requirements>
<mistakes-to-avoid>
- Failed approaches: Solutions the user rejected or that didn't work
- Wrong assumptions: Incorrect assumptions about user environment, tools, or preferences
- Overstepping boundaries: Where AI suggested something the user explicitly didn't want
- Misunderstandings: Where AI misinterpreted the user's intent or requirements
- Permission/Access issues: System-level restrictions that blocked progress
- Unsafe/Corner‑cutting: Disabling tests/linters, bypassing security/privacy, hardcoding secrets, editing prod, suppressing error handling
</mistakes-to-avoid>

<successful-patterns>
- Effective solutions: Approaches that solved the problem or unblocked progress
- Good tool choices: Tools/commands that worked in the user's setup
- Communication style: Explanations or formats the user affirmed
- Workflow patterns: Processes that moved work forward efficiently (e.g., minimal repros, diffs, stepwise validation)
</successful-patterns>
</analysis-requirements>

<output-rules>
- Output ONLY a valid JSON object. No explanations, no markdown, no code blocks.
- Use the schema below verbatim. Arrays may be empty. Strings must be quoted. No unescaped quotes.
- Every item MUST include at least one evidence quote.
- For string fields (os, verbosity, techLevel, patience): Use "unknown" where details are not present in the transcript.
- For array fields (restrictions, tools, boundaries, preferences, recommendations): Use empty arrays [] where no items are found, NEVER use "unknown" string.
</output-rules>

<output-format>
{
  "mistakes": [
    {
      "type": "failed_approach|wrong_assumption|boundary_violation|misunderstanding|access_issue",
      "description": "Begin with optional tags like [unsafe] or [corner-cutting], then succinctly describe what went wrong and why",
      "evidence": "Short direct quote with speaker label, e.g., \\"User: don't change tests—fix the code\\"",
      "lesson": "Concrete rule: If <trigger>, then <action>. (Impact: High|Medium|Low; Confidence: High|Medium|Low)"
    }
  ],
  "successes": [
    {
      "type": "solution|tool_choice|communication|workflow",
      "description": "What worked and why it worked; include context if needed",
      "evidence": "Short direct quote with speaker label showing success/acceptance",
      "lesson": "Concrete rule to repeat in future: If <trigger>, then <action>. (Impact: High|Medium|Low; Confidence: High|Medium|Low)"
    }
  ],
  "userProfile": {
    "environment": {
      "os": "detected OS or \\"unknown\\"",
      "restrictions": ["list of known restrictions, or empty list"],
      "tools": ["tools/commands verified to work, or empty list"]
    },
    "style": {
      "verbosity": "concise|detailed|unknown",
      "techLevel": "beginner|intermediate|expert|unknown",
      "patience": "high|medium|low|unknown"
    },
    "boundaries": ["specific constraints with context, e.g., 'avoid killing system processes during debugging' or 'never use automatic fallbacks in message routing systems', or empty array if none found"],
    "preferences": ["detailed preferences with context and reasoning, e.g., 'prefers deterministic behavior over convenience when designing timeout mechanisms' or 'values explicit user control over automatic decisions in system architecture', or empty array if none found"]
  },
  "recommendations": [
    "Specific, reusable, imperative guidance (e.g., 'If tests fail, do not disable them; bisect failing case and add minimal repro first')",
    "Another concrete playbook step the next AI should apply immediately"
  ]
}
</output-format>
`;

  async analyzeConversation(
    messages: ClaudeMessage[], 
    maxDepth: number = 100,
    debug: boolean = false,
    messageToSessionMap?: Map<ClaudeMessage, string>,
    excludePatterns?: string[]
  ): Promise<AIAnalysisResult> {
    
    console.log('🚀 Starting Claude Code SDK analysis...');
    
    // Filter out messages that match exclude patterns
    let filteredMessages = messages;
    if (excludePatterns && excludePatterns.length > 0) {
      filteredMessages = messages.filter(msg => {
        const content = this.extractMessageContent(msg);
        return !excludePatterns.some(pattern => content.includes(pattern));
      });
      
      const excludedCount = messages.length - filteredMessages.length;
      if (excludedCount > 0) {
        console.log(`🚫 Excluded ${excludedCount} messages matching patterns: ${excludePatterns.join(', ')}`);
      }
    }

    // Limit messages by depth, but prefer messages with actual content
    const messagesWithContent = filteredMessages.filter(msg => {
      const content = this.extractMessageContent(msg);
      return content.trim().length > 10; // Only messages with substantial content
    });
    
    let limitedMessages = messagesWithContent.slice(-Math.min(maxDepth, messagesWithContent.length));
    
    // Ensure minimum meaningful content for analysis
    if (limitedMessages.length < 15) {
      console.log('⚠️  Too few messages for meaningful AI analysis. Using minimum of 20 messages...');
      limitedMessages = messagesWithContent.slice(-Math.min(20, messagesWithContent.length));
    }
    
    // Format conversation for analysis
    const formattedConversation = this.formatConversationForAnalysis(limitedMessages, debug, messageToSessionMap);
    
    // Estimate token size (rough approximation)
    const estimatedTokens = Math.ceil(formattedConversation.length / 4);
    console.log(`📊 Analyzing ~${estimatedTokens.toLocaleString()} tokens (${limitedMessages.length} messages)`);
    
    const analysisStartTime = Date.now();
    this.progressBar.start(100, 0, { status: 'Initializing analysis...' });

    try {
      const analysisPrompt = this.ANALYSIS_PROMPT.replace('{conversation}', formattedConversation);
      
      this.progressBar.update(10, { status: 'Sending request to AI (~1 min)...' });
      
      // Use Claude Code SDK - it handles authentication automatically
      const options = {
        allowedTools: [], // No tools needed for analysis
        maxTurns: 1,
        model: 'claude-sonnet-4-20250514',
        verbose: false,
        pathToClaudeCodeExecutable: '/Users/leonidbugaev/.local/bin/claude'
      };
      
      const response = query({
        prompt: analysisPrompt,
        options
      });

      this.progressBar.update(30, { status: 'Waiting for AI analysis...' });

      let result = '';
      let messageCount = 0;
      
      // Stream the response with time-based progress
      for await (const message of response) {
        if (message.type === 'assistant') {
          messageCount++;
          
          // Handle content that might be an object or array
          const content = message.message?.content;
          let textContent = '';
          
          if (typeof content === 'string') {
            textContent = content;
          } else if (Array.isArray(content)) {
            textContent = content.map(block => {
              if (typeof block === 'string') return block;
              if (block.type === 'text') return block.text || '';
              return '';
            }).join('');
          }
          
          result += textContent;
          
          // Update progress based on message chunks received (streaming is fast, actual processing takes time)
          const progress = Math.min(85, 30 + (messageCount * 15));
          
          this.progressBar.update(progress, { 
            status: `Receiving AI analysis...` 
          });
        }
      }

      this.progressBar.update(95, { status: 'Parsing analysis results...' });


      // Parse and validate JSON using the same method as release-manager
      let cleanJson = result.trim();
      
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
          console.error('❌ No JSON braces found in response:');
          console.error(result);
          throw new Error('Could not find valid JSON braces in Claude\'s response');
        }
        
        const parsedResult = JSON.parse(cleanJson);
        
        // Ensure arrays are arrays, not "unknown" strings
        const analysisResult: AIAnalysisResult = {
          mistakes: parsedResult.mistakes || [],
          successes: parsedResult.successes || [],
          userProfile: {
            environment: {
              os: parsedResult.userProfile?.environment?.os || 'unknown',
              restrictions: Array.isArray(parsedResult.userProfile?.environment?.restrictions) 
                ? parsedResult.userProfile.environment.restrictions 
                : [],
              tools: Array.isArray(parsedResult.userProfile?.environment?.tools)
                ? parsedResult.userProfile.environment.tools
                : []
            },
            style: {
              verbosity: parsedResult.userProfile?.style?.verbosity || 'concise',
              techLevel: parsedResult.userProfile?.style?.techLevel || 'intermediate',
              patience: parsedResult.userProfile?.style?.patience || 'medium'
            },
            boundaries: Array.isArray(parsedResult.userProfile?.boundaries)
              ? parsedResult.userProfile.boundaries
              : parsedResult.userProfile?.boundaries === 'unknown'
              ? []
              : [parsedResult.userProfile?.boundaries].filter(Boolean),
            preferences: Array.isArray(parsedResult.userProfile?.preferences)
              ? parsedResult.userProfile.preferences
              : parsedResult.userProfile?.preferences === 'unknown'
              ? []
              : [parsedResult.userProfile?.preferences].filter(Boolean)
          },
          recommendations: Array.isArray(parsedResult.recommendations)
            ? parsedResult.recommendations
            : []
        };
        
        this.progressBar.update(100, { status: 'Analysis complete!' });
        this.progressBar.stop();
        
        console.log('\n✅ Claude Code analysis completed successfully!');
        console.log(`🔍 Found ${analysisResult.mistakes.length} mistakes to avoid and ${analysisResult.successes.length} successful patterns`);
        
        return analysisResult;
        
      } catch (parseError) {
        // Try to repair common JSON issues
        console.log('⚠️  Initial JSON parse failed, attempting to repair...');
        
        try {
          // Common fix: escape unescaped quotes within strings
          let repairedJson = cleanJson
            // Fix patterns like: "text" followed by "more text"
            .replace(/("\s+)followed by(\s+")/g, '$1, $2')
            // Fix unescaped quotes in examples
            .replace(/"examples":\s*\[(.*?)\]/g, (match: string, content: string) => {
              // Simple heuristic: if there are unmatched quotes, try to fix them
              const fixed = content.replace(/"\s+(?!,|\])/g, '" ');
              return `"examples": [${fixed}]`;
            });
          
          const parsedResult = JSON.parse(repairedJson);
          console.log('✅ JSON repaired successfully');
          
          // Ensure arrays are arrays, not "unknown" strings (same validation as above)
          const analysisResult: AIAnalysisResult = {
            mistakes: parsedResult.mistakes || [],
            successes: parsedResult.successes || [],
            userProfile: {
              environment: {
                os: parsedResult.userProfile?.environment?.os || 'unknown',
                restrictions: Array.isArray(parsedResult.userProfile?.environment?.restrictions) 
                  ? parsedResult.userProfile.environment.restrictions 
                  : [],
                tools: Array.isArray(parsedResult.userProfile?.environment?.tools)
                  ? parsedResult.userProfile.environment.tools
                  : []
              },
              style: {
                verbosity: parsedResult.userProfile?.style?.verbosity || 'concise',
                techLevel: parsedResult.userProfile?.style?.techLevel || 'intermediate',
                patience: parsedResult.userProfile?.style?.patience || 'medium'
              },
              boundaries: Array.isArray(parsedResult.userProfile?.boundaries)
                ? parsedResult.userProfile.boundaries
                : parsedResult.userProfile?.boundaries === 'unknown'
                ? []
                : [parsedResult.userProfile?.boundaries].filter(Boolean),
              preferences: Array.isArray(parsedResult.userProfile?.preferences)
                ? parsedResult.userProfile.preferences
                : parsedResult.userProfile?.preferences === 'unknown'
                ? []
                : [parsedResult.userProfile?.preferences].filter(Boolean)
            },
            recommendations: Array.isArray(parsedResult.recommendations)
              ? parsedResult.recommendations
              : []
          };
          
          this.progressBar.update(100, { status: 'Analysis complete!' });
          this.progressBar.stop();
          
          console.log('\n✅ Claude Code analysis completed successfully!');
          console.log(`🔍 Found ${analysisResult.mistakes.length} mistakes to avoid and ${analysisResult.successes.length} successful patterns`);
          
          return analysisResult;
          
        } catch (repairError) {
          console.error('❌ Failed to parse JSON response:');
          console.error('Raw response:');
          console.error(result);
          console.error('Parse error:', (parseError as Error).message);
          console.error('Repair attempt also failed:', (repairError as Error).message);
          throw new Error('Could not extract valid JSON from Claude\'s response');
        }
      }

    } catch (error) {
      this.progressBar.stop();
      console.error('\n❌ Claude Code analysis failed:', error);
      throw error;
    }
  }

  private formatConversationForAnalysis(messages: ClaudeMessage[], debug: boolean = false, messageToSessionMap?: Map<ClaudeMessage, string>): string {
    const formattedMessages = messages.map(msg => {
      let content = this.extractMessageContent(msg);
      
      // Truncate messages longer than 4000 characters
      let wasTruncated = false;
      if (content.length > 4000) {
        content = content.substring(0, 4000) + '...[truncated]';
        wasTruncated = true;
      }
      
      // Debug logging for large messages (>1000 tokens ≈ 4000 chars)
      if (debug && (content.length > 4000 || wasTruncated)) {
        const originalContent = this.extractMessageContent(msg);
        const tokens = Math.ceil(originalContent.length / 4);
        const sessionPath = messageToSessionMap?.get(msg) || 'unknown';
        console.log(`🐛 DEBUG: Large message (${tokens} tokens)${wasTruncated ? ' - TRUNCATED' : ''}`);
        console.log(`   Type: ${msg.type}`);
        console.log(`   Session: ${msg.sessionId?.slice(0, 8)}...`);
        console.log(`   File: ${sessionPath}`);
        console.log(`   Content preview: ${originalContent.substring(0, 200)}...`);
        console.log(`   Full length: ${originalContent.length} chars`);
        console.log('');
      }
      
      if (msg.type === 'user') {
        return `<human>${content}</human>`;
      } else {
        return `<ai>${content}</ai>`;
      }
    }).join('\n');
    
    return `<conversation>\n${formattedMessages}\n</conversation>`;
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
}