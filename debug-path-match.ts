#!/usr/bin/env node

const currentPath = '/Users/leonidbugaev/go/src/claude-story';
const claudeProjectDir = '-Users-leonidbugaev-go-src-claude-story';

console.log('Current path:', currentPath);
console.log('Claude project dir:', claudeProjectDir);

const normalizedClaudePath = claudeProjectDir
  .replace(/^-/, '')  // Remove leading dash
  .replace(/-/g, '/'); // Convert dashes to slashes

console.log('Normalized Claude path:', normalizedClaudePath);
console.log('Current path (no trailing slash):', currentPath.replace(/\/$/, ''));

console.log('Match?', normalizedClaudePath === currentPath.replace(/\/$/, ''));

// Let's also check what we get from process.cwd()
console.log('process.cwd():', process.cwd());
console.log('process.cwd() match?', normalizedClaudePath === process.cwd().replace(/\/$/, ''));