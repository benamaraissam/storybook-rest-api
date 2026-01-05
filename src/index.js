/**
 * Storybook API - Programmatic interface
 * 
 * @example
 * const { createApp, startServer } = require('storybook-api');
 */

const { createApp, startServer, startStorybookProcess } = require('./server');
const { detectStorybookVersion, findStorybookConfig, detectFramework } = require('./utils');
const { extractComponentDocs, extractStoryExamples, parseStoryFile, generateUsageExample } = require('./parsers');

module.exports = {
  // Server
  createApp,
  startServer,
  startStorybookProcess,
  
  // Utils
  detectStorybookVersion,
  findStorybookConfig,
  detectFramework,
  
  // Parsers
  extractComponentDocs,
  extractStoryExamples,
  parseStoryFile,
  generateUsageExample,
};

