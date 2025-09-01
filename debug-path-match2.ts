#!/usr/bin/env node

const currentPath = '/Users/leonidbugaev/go/src/claude-story';
const claudeProjectDir = '-Users-leonidbugaev-go-src-claude-story';

console.log('=== Analysis of Claude Code Path Encoding ===');
console.log('Current path:', currentPath);
console.log('Claude project dir:', claudeProjectDir);
console.log('');

// Method 1: Simple replacement
const method1 = '/' + claudeProjectDir.substring(1).replace(/-/g, '/');
console.log('Method 1 (replace all dashes):', method1);
console.log('Method 1 match?', method1 === currentPath);
console.log('');

// Method 2: Keep last segment intact  
const pathWithoutLeading = claudeProjectDir.substring(1);
const segments = pathWithoutLeading.split('-');
console.log('Segments:', segments);

// Try reconstructing by assuming the last segment might have dashes
for (let i = 1; i <= 3; i++) {
  if (segments.length >= i) {
    const pathSegments = segments.slice(0, -i);
    const lastSegments = segments.slice(-i);
    const reconstructed = '/' + pathSegments.join('/') + '/' + lastSegments.join('-');
    console.log(`Method 2.${i} (last ${i} segments as one):`, reconstructed);
    console.log(`Method 2.${i} match?`, reconstructed === currentPath);
  }
}

console.log('');
console.log('=== Testing with known working example ===');
const knownExample = '-Users-leonidbugaev-Documents-Cline-MCP-big-brain';
const knownPath = '/Users/leonidbugaev/Documents/Cline/MCP/big-brain';
console.log('Known Claude dir:', knownExample);
console.log('Expected path:', knownPath);

const knownMethod1 = '/' + knownExample.substring(1).replace(/-/g, '/');
console.log('Known Method 1:', knownMethod1);
console.log('Known Method 1 match?', knownMethod1 === knownPath);

// Test with segments
const knownSegments = knownExample.substring(1).split('-');
console.log('Known segments:', knownSegments);

for (let i = 1; i <= 3; i++) {
  if (knownSegments.length >= i) {
    const pathSeg = knownSegments.slice(0, -i);
    const lastSeg = knownSegments.slice(-i);
    const reconst = '/' + pathSeg.join('/') + '/' + lastSeg.join('-');
    console.log(`Known Method 2.${i}:`, reconst);
    console.log(`Known Method 2.${i} match?`, reconst === knownPath);
  }
}