#!/usr/bin/env node

/**
 * Storybook API CLI
 * 
 * Usage:
 *   npx storybook-api [options]
 *   npx storybook-api --port 6006
 *   npx storybook-api --storybook-port 6010
 */

const { Command } = require('commander');
const chalk = require('chalk');
const { startServer } = require('./server');
const { detectStorybookVersion, findStorybookConfig } = require('./utils');

const program = new Command();

program
  .name('storybook-rest-api')
  .description('Expose Storybook stories via REST API')
  .version('1.0.0')
  .option('-p, --port <number>', 'Port to run the API server on', '6006')
  .option('-s, --storybook-port <number>', 'Internal port for Storybook', '6010')
  .option('--no-proxy', 'Run API only (don\'t start/proxy Storybook)')
  .option('--storybook-url <url>', 'URL of running Storybook instance')
  .option('-d, --dir <path>', 'Project directory (default: current directory)', process.cwd())
  .action(async (options) => {
    console.log('');
    console.log(chalk.cyan('╔════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.bold.white('           Storybook API Server                        ') + chalk.cyan('║'));
    console.log(chalk.cyan('╚════════════════════════════════════════════════════════╝'));
    console.log('');

    const projectDir = options.dir;
    
    // Detect Storybook version
    const version = detectStorybookVersion(projectDir);
    if (version) {
      console.log(chalk.green('✓') + ` Detected Storybook version: ${chalk.bold(version)}`);
    } else {
      console.log(chalk.yellow('⚠') + ' Could not detect Storybook version');
    }

    // Find Storybook config
    const configDir = findStorybookConfig(projectDir);
    if (configDir) {
      console.log(chalk.green('✓') + ` Found Storybook config: ${chalk.dim(configDir)}`);
    } else {
      console.log(chalk.yellow('⚠') + ' Could not find .storybook directory');
    }

    console.log('');

    const config = {
      port: parseInt(options.port, 10),
      storybookPort: parseInt(options.storybookPort, 10),
      storybookUrl: options.storybookUrl || `http://localhost:${options.storybookPort}`,
      projectDir,
      configDir,
      proxy: options.proxy !== false,
      version,
    };

    try {
      await startServer(config);
    } catch (error) {
      console.error(chalk.red('Error starting server:'), error.message);
      process.exit(1);
    }
  });

program.parse();

