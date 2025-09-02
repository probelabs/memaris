import type { ClaudeMessage } from '../types/index.js';
import { ClaudeCodeAnalyzer } from '../analyzers/claude-code-analysis.js';

// Helper function to estimate tokens in a message (roughly 4 chars = 1 token)
export function estimateTokens(message: ClaudeMessage): number {
  let content = '';
  if (message.type === 'user') {
    // Extract user text content
    if (message.message?.content) {
      if (typeof message.message.content === 'string') {
        content = message.message.content;
      } else {
        content = message.message.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('\n');
      }
    }
  } else if (message.type === 'assistant') {
    // Extract assistant text content
    if (message.message?.content) {
      if (typeof message.message.content === 'string') {
        content = message.message.content;
      } else {
        content = message.message.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('\n');
      }
    }
  } else if (message.type === 'summary' && message.summary) {
    content = `[Session Summary: ${message.summary}]`;
  } else {
    content = '[Non-text message]';
  }
  
  return Math.ceil(content.length / 4); // Rough estimate: 4 chars ≈ 1 token
}

export interface BatchingOptions {
  batchSize: number;
  excludePatterns?: string[];
  debugMessages?: boolean;
  messageToSessionMap?: Map<ClaudeMessage, string>;
}

export async function processBatches(
  messages: ClaudeMessage[],
  options: BatchingOptions
): Promise<any> {
  
  // Calculate total tokens
  const totalTokens = messages.reduce((sum, msg) => sum + estimateTokens(msg), 0);
  console.log(`📊 Estimated total tokens: ${totalTokens.toLocaleString()}`);
  
  // Calculate batches needed
  const batchSize = options.batchSize;
  const batchesNeeded = Math.ceil(totalTokens / batchSize);
  const estimatedTotalMinutes = batchesNeeded * 1; // ~1 minute per batch
  console.log(`📦 Processing in ${batchesNeeded} batches of ~${batchSize.toLocaleString()} tokens each`);
  console.log(`⏱️  Estimated total time: ~${estimatedTotalMinutes} minutes\n`);
  
  // Process each batch with ETA tracking
  const batchResults: any[] = [];
  let processedMessages = 0;
  const startTime = Date.now();
  
  for (let batchNum = 1; batchNum <= batchesNeeded; batchNum++) {
    const remainingBatches = batchesNeeded - batchNum + 1;
    const estimatedMinutesRemaining = remainingBatches * 1; // ~1 minute per batch
    
    console.log(`🔄 Processing batch ${batchNum}/${batchesNeeded} (ETA: ~${estimatedMinutesRemaining} min)...`);
    
    // Collect messages for this batch
    const batchMessages: ClaudeMessage[] = [];
    let batchTokenCount = 0;
    
    while (processedMessages < messages.length && batchTokenCount < batchSize) {
      const msg = messages[processedMessages]!; // Assert non-null since we check length
      const msgTokens = estimateTokens(msg);
      
      if (batchTokenCount + msgTokens > batchSize && batchMessages.length > 0) {
        break; // Don't exceed batch size
      }
      
      batchMessages.push(msg);
      batchTokenCount += msgTokens;
      processedMessages++;
    }
    
    console.log(`   📊 Batch ${batchNum}: ${batchMessages.length} messages (~${batchTokenCount} tokens)`);
    
    // Analyze this batch
    const batchStartTime = Date.now();
    const claudeAnalyzer = new ClaudeCodeAnalyzer();
    
    const batchResult = await claudeAnalyzer.analyzeConversation(
      batchMessages, 
      batchMessages.length, 
      options.debugMessages, 
      options.messageToSessionMap, 
      options.excludePatterns
    );
    
    batchResults.push(batchResult);
    
    // Calculate actual elapsed time and adjust ETA for remaining batches
    const batchElapsedSeconds = Math.round((Date.now() - batchStartTime) / 1000);
    const totalElapsedMinutes = Math.round((Date.now() - startTime) / 60000);
    const avgBatchTimeMinutes = totalElapsedMinutes / batchNum;
    const remainingBatchesAfterThis = batchesNeeded - batchNum;
    const adjustedETA = Math.round(remainingBatchesAfterThis * avgBatchTimeMinutes);
    
    console.log(`   ✅ Batch ${batchNum} complete (${batchElapsedSeconds}s): ${batchResult.mistakes.length} mistakes, ${batchResult.successes.length} successes`);
    
    if (remainingBatchesAfterThis > 0) {
      console.log(`   ⏱️  Remaining: ${remainingBatchesAfterThis} batches (~${adjustedETA} min ETA)\n`);
    } else {
      console.log(`   🎉 All batches complete! Total time: ${totalElapsedMinutes} min\n`);
    }
  }
  
  // Merge all batch results
  console.log('🔄 Merging all batch results...');
  const mergedResult = mergeAnalysisResults(batchResults);
  console.log(`✅ Final merged results: ${mergedResult.mistakes.length} mistakes, ${mergedResult.successes.length} successes`);
  
  return mergedResult;
}

function mergeAnalysisResults(results: any[]): any {
  if (results.length === 0) return null;
  if (results.length === 1) return results[0];

  const merged = {
    mistakes: [] as any[],
    successes: [] as any[],
    userProfile: {
      environment: {
        os: results[0].userProfile.environment.os,
        restrictions: [] as string[],
        tools: [] as string[]
      },
      style: {
        verbosity: results[0].userProfile.style.verbosity,
        techLevel: results[0].userProfile.style.techLevel,
        patience: results[0].userProfile.style.patience
      },
      boundaries: [] as string[],
      preferences: [] as string[]
    },
    recommendations: [] as string[]
  };

  // Merge all mistakes and successes
  for (const result of results) {
    merged.mistakes.push(...(result.mistakes || []));
    merged.successes.push(...(result.successes || []));
    merged.recommendations.push(...(result.recommendations || []));
    
    // Merge user profile arrays
    if (result.userProfile) {
      merged.userProfile.boundaries.push(...(result.userProfile.boundaries || []));
      merged.userProfile.preferences.push(...(result.userProfile.preferences || []));
      merged.userProfile.environment.restrictions.push(...(result.userProfile.environment.restrictions || []));
      merged.userProfile.environment.tools.push(...(result.userProfile.environment.tools || []));
    }
  }

  // Deduplicate arrays
  merged.userProfile.boundaries = [...new Set(merged.userProfile.boundaries)];
  merged.userProfile.preferences = [...new Set(merged.userProfile.preferences)];
  merged.userProfile.environment.restrictions = [...new Set(merged.userProfile.environment.restrictions)];
  merged.userProfile.environment.tools = [...new Set(merged.userProfile.environment.tools)];
  merged.recommendations = [...new Set(merged.recommendations)];

  // Sort results by importance/frequency (but don't limit them)
  merged.mistakes = merged.mistakes
    .sort((a, b) => (b.lesson || '').length - (a.lesson || '').length);
  
  merged.successes = merged.successes
    .sort((a, b) => (b.lesson || '').length - (a.lesson || '').length);

  return merged;
}