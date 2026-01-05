/**
 * Storybook API Server
 * 
 * Exposes Storybook stories via REST API
 * Supports Storybook 8, 9, and 10
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const chalk = require('chalk');

const { extractComponentDocs, extractStoryExamples, parseStoryFile, generateUsageExample } = require('./parsers');
const { detectFramework } = require('./utils');

/**
 * Create and configure the Express app
 */
function createApp(config) {
  const app = express();
  const { storybookUrl, projectDir, version } = config;
  const framework = detectFramework(projectDir);

  app.use(express.json());

  // ============================================
  // API Routes
  // ============================================

  // API Documentation
  app.get('/api', (req, res) => {
    res.json({
      success: true,
      name: 'Storybook API',
      version: '1.0.0',
      storybookVersion: version || 'unknown',
      framework,
      endpoints: {
        'GET /api': 'This documentation',
        'GET /api/stories': 'Get all stories',
        'GET /api/stories/:storyId': 'Get a specific story with details',
        'GET /api/docs/:storyId': 'Get full documentation with code examples',
        'GET /api/stories/kind/:kind': 'Get stories filtered by kind/category',
      },
      examples: {
        'List stories': '/api/stories',
        'Get story': '/api/stories/example-button--primary',
        'Get docs': '/api/docs/example-button--docs',
      },
    });
  });

  // Get all stories
  app.get('/api/stories', async (req, res) => {
    try {
      const response = await fetch(`${storybookUrl}/index.json`);
      if (!response.ok) {
        return res.status(503).json({ 
          success: false, 
          error: 'Storybook is not ready. Please wait...',
          hint: `Make sure Storybook is running at ${storybookUrl}` 
        });
      }

      const data = await response.json();
      const stories = Object.values(data.entries || {}).map(entry => ({
        id: entry.id,
        name: entry.name,
        title: entry.title,
        kind: entry.kind || entry.title,
        importPath: entry.importPath,
        tags: entry.tags || [],
        type: entry.type,
      }));

      res.json({
        success: true,
        count: stories.length,
        stories,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get specific story
  app.get('/api/stories/:storyId', async (req, res) => {
    try {
      const { storyId } = req.params;
      const response = await fetch(`${storybookUrl}/index.json`);
      if (!response.ok) {
        return res.status(503).json({ success: false, error: 'Storybook is not ready' });
      }

      const data = await response.json();
      const entry = data.entries?.[storyId];

      if (!entry) {
        return res.status(404).json({ success: false, error: `Story "${storyId}" not found` });
      }

      const story = {
        id: entry.id,
        name: entry.name,
        title: entry.title,
        kind: entry.kind || entry.title,
        importPath: entry.importPath,
        tags: entry.tags || [],
        type: entry.type,
      };

      // Parse story file for additional details
      if (entry.importPath) {
        const cleanPath = entry.importPath.replace(/^\.\//, '');
        const storyFilePath = path.join(projectDir, cleanPath);
        const parsed = parseStoryFile(storyFilePath, storyId, projectDir);
        if (parsed) {
          story.component = parsed.component;
          story.args = parsed.args || {};
          story.argTypes = parsed.argTypes || {};
          if (parsed.componentDocs) {
            story.docs = parsed.componentDocs;
          }
        }
      }

      res.json({ success: true, story });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get story documentation with code examples
  app.get('/api/docs/:storyId', async (req, res) => {
    try {
      const { storyId } = req.params;
      const response = await fetch(`${storybookUrl}/index.json`);
      if (!response.ok) {
        return res.status(503).json({ success: false, error: 'Storybook is not ready' });
      }

      const data = await response.json();
      const entry = data.entries?.[storyId];

      if (!entry) {
        return res.status(404).json({ success: false, error: `Story "${storyId}" not found` });
      }

      const docs = {
        storyId,
        title: entry.title,
        name: entry.name,
        type: entry.type,
        framework,
      };

      if (entry.importPath && !entry.importPath.endsWith('.mdx')) {
        const cleanPath = entry.importPath.replace(/^\.\//, '');
        const storyFilePath = path.join(projectDir, cleanPath);

        if (fs.existsSync(storyFilePath)) {
          const content = fs.readFileSync(storyFilePath, 'utf8');

          // Get component info
          const componentMatch = content.match(/component:\s*(\w+)/);
          if (componentMatch) {
            docs.component = componentMatch[1];

            const importMatch = content.match(new RegExp(`import\\s*\\{[^}]*${componentMatch[1]}[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`));
            if (importMatch) {
              const storyDir = path.dirname(storyFilePath);
              let componentFilePath = path.resolve(storyDir, importMatch[1]);
              
              // Try different extensions
              const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte'];
              for (const ext of extensions) {
                const fullPath = componentFilePath + ext;
                if (fs.existsSync(fullPath)) {
                  const componentDocs = extractComponentDocs(fullPath);
                  if (componentDocs) {
                    docs.selector = componentDocs.selector;
                    docs.template = componentDocs.template;
                    docs.componentCode = componentDocs.componentCode;
                    docs.properties = componentDocs.properties;
                    docs.componentDescription = componentDocs.description;
                  }
                  break;
                }
              }
            }
          }

          // Get story examples
          const storyExamples = extractStoryExamples(storyFilePath);
          if (storyExamples) {
            docs.imports = storyExamples.imports;
            docs.metaCode = storyExamples.meta;
            docs.storyExamples = storyExamples.stories;

            if (docs.selector && storyExamples.stories) {
              docs.usageExamples = {};
              Object.entries(storyExamples.stories).forEach(([name, story]) => {
                docs.usageExamples[name] = generateUsageExample(docs.selector, story.args, name, framework);
              });
            }
          }
        }
      } else if (entry.importPath && entry.importPath.endsWith('.mdx')) {
        // MDX documentation file
        const cleanPath = entry.importPath.replace(/^\.\//, '');
        const mdxPath = path.join(projectDir, cleanPath);
        if (fs.existsSync(mdxPath)) {
          docs.mdxContent = fs.readFileSync(mdxPath, 'utf8');
        }
      }

      res.json({ success: true, docs });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get stories by kind/category
  app.get('/api/stories/kind/:kind', async (req, res) => {
    try {
      const { kind } = req.params;
      const response = await fetch(`${storybookUrl}/index.json`);
      if (!response.ok) {
        return res.status(503).json({ success: false, error: 'Storybook is not ready' });
      }

      const data = await response.json();
      const stories = Object.values(data.entries || {})
        .filter(entry => entry.kind === kind || entry.title === kind)
        .map(entry => ({
          id: entry.id,
          name: entry.name,
          title: entry.title,
          kind: entry.kind || entry.title,
          type: entry.type,
        }));

      res.json({ success: true, count: stories.length, kind, stories });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return app;
}

/**
 * Start Storybook process
 */
function startStorybookProcess(config) {
  const { storybookPort, projectDir, version, framework } = config;

  console.log(chalk.blue('→') + ` Starting Storybook on port ${storybookPort}...`);

  let cmd = 'npx';
  let args = ['storybook', 'dev', '-p', storybookPort.toString(), '--no-open'];

  // For Angular projects with Storybook 8+, we need to use Angular builder
  if (framework === 'angular' && version >= 8) {
    const angularJsonPath = path.join(projectDir, 'angular.json');
    if (fs.existsSync(angularJsonPath)) {
      try {
        const angularJson = JSON.parse(fs.readFileSync(angularJsonPath, 'utf8'));
        // Find the project with storybook target
        for (const [projectName, project] of Object.entries(angularJson.projects || {})) {
          if (project.architect?.storybook) {
            cmd = 'npx';
            args = ['ng', 'run', `${projectName}:storybook`, '--port', storybookPort.toString()];
            console.log(chalk.dim(`   Using Angular builder for project: ${projectName}`));
            break;
          }
        }
      } catch (error) {
        console.log(chalk.yellow('⚠️  Could not read angular.json, falling back to standard Storybook CLI'));
      }
    } else {
      // No angular.json, but it's Angular - might be a minimal setup
      // Try using storybook dev with STORYBOOK_ANGULAR_LEGACY env var
      console.log(chalk.yellow('⚠️  No angular.json found. Angular projects with Storybook 8+ typically require angular.json configuration.'));
      console.log(chalk.dim('   Attempting to start with standard CLI...'));
    }
  }

  const storybook = spawn(cmd, args, {
    cwd: projectDir,
    shell: true,
    stdio: 'pipe',
    env: {
      ...process.env,
      // Ensure Storybook uses the correct port
      PORT: storybookPort.toString(),
    },
  });

  storybook.stdout.on('data', (data) => {
    const msg = data.toString();
    // Only log important messages
    if (msg.includes('Storybook') || msg.includes('started') || msg.includes('Local') || msg.includes('error') || msg.includes('Error')) {
      console.log(chalk.dim('[Storybook]'), msg.trim());
    }
  });

  storybook.stderr.on('data', (data) => {
    const msg = data.toString();
    if (!msg.includes('ExperimentalWarning') && !msg.includes('deprecated') && !msg.includes('punycode')) {
      if (msg.includes('error') || msg.includes('Error') || msg.includes('not supported')) {
        console.error(chalk.red('[Storybook Error]'), msg.trim());
        
        // If it's the deprecated builder error, provide helpful message
        if (msg.includes('not supported') || msg.includes('deprecated')) {
          console.log(chalk.yellow('\n⚠️  If you see errors about deprecated builders, make sure you\'re using Storybook 8+'));
          console.log(chalk.dim('   The standard "storybook dev" command should work for all frameworks.\n'));
        }
      }
    }
  });

  storybook.on('close', (code) => {
    if (code !== 0) {
      console.log(chalk.yellow(`[Storybook] Process exited with code ${code}`));
    }
  });

  return storybook;
}

/**
 * Start the server
 */
async function startServer(config) {
  const { port, storybookPort, storybookUrl, projectDir, proxy } = config;

  const app = createApp(config);
  let storybookProcess = null;

  if (proxy) {
    // Start Storybook
    storybookProcess = startStorybookProcess(config);

    // Add proxy middleware for all non-API requests
    app.use('/', createProxyMiddleware({
      target: storybookUrl,
      changeOrigin: true,
      ws: true,
      onError: (err, req, res) => {
        if (res.writeHead) {
          res.writeHead(503, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <head><title>Storybook Starting...</title></head>
              <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                <h1>⏳ Storybook is starting...</h1>
                <p>Please wait a moment and refresh this page.</p>
                <script>setTimeout(() => location.reload(), 3000);</script>
              </body>
            </html>
          `);
        }
      },
    }));
  }

  // Start the server
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log('');
      console.log(chalk.green('═══════════════════════════════════════════════════════════'));
      console.log(chalk.green('  ✓ Server started successfully!'));
      console.log(chalk.green('═══════════════════════════════════════════════════════════'));
      console.log('');
      console.log(`  ${chalk.bold('URL:')}          ${chalk.cyan(`http://localhost:${port}`)}`);
      console.log(`  ${chalk.bold('API:')}          ${chalk.cyan(`http://localhost:${port}/api`)}`);
      console.log(`  ${chalk.bold('Stories:')}      ${chalk.cyan(`http://localhost:${port}/api/stories`)}`);
      console.log('');
      console.log(chalk.dim('  Press Ctrl+C to stop'));
      console.log('');

      resolve(server);
    });

    // Handle shutdown
    const shutdown = () => {
      console.log(chalk.yellow('\n  Shutting down...'));
      if (storybookProcess) {
        storybookProcess.kill();
      }
      server.close(() => {
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}

module.exports = {
  createApp,
  startServer,
  startStorybookProcess,
};

