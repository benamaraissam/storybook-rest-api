#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const EXAMPLES_DIR = path.join(__dirname, '..', 'examples');
const TIMEOUT = 120000; // 2 minutes per test

// Parse CLI args
const args = process.argv.slice(2);
const onlyIndex = args.indexOf('--only');
const onlyExample = onlyIndex !== -1 ? args[onlyIndex + 1] : null;

let examples = [
  { name: 'test-sb8', expectedVersion: 8, port: 6006 },
  { name: 'test-sb9', expectedVersion: 9, port: 6009 },
  { name: 'test-sb10', expectedVersion: 10, port: 6008 },
];

if (onlyExample) {
  examples = examples.filter(e => e.name === onlyExample);
  if (examples.length === 0) {
    console.error(`Example not found: ${onlyExample}`);
    process.exit(1);
  }
}

const results = [];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetch(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await import('node-fetch').then(m => m.default(url));
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      await sleep(2000);
    }
  }
}

async function testExample(example) {
  const { name, expectedVersion, port } = example;
  const exampleDir = path.join(EXAMPLES_DIR, name);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name} (expected Storybook ${expectedVersion})`);
  console.log(`${'='.repeat(60)}`);

  const result = {
    name,
    expectedVersion,
    actualVersion: null,
    versionMatch: false,
    apiWorking: false,
    storiesCount: 0,
    storyDetailsWorking: false,
    docsWorking: false,
    errors: [],
  };

  // Check if example exists
  if (!fs.existsSync(exampleDir)) {
    result.errors.push(`Example directory not found: ${exampleDir}`);
    results.push(result);
    return;
  }

  // Install dependencies if needed
  const nodeModules = path.join(exampleDir, 'node_modules');
  if (!fs.existsSync(nodeModules)) {
    console.log(`📦 Installing dependencies for ${name}...`);
    try {
      execSync('npm install', { cwd: exampleDir, stdio: 'inherit' });
    } catch (error) {
      result.errors.push(`Failed to install dependencies: ${error.message}`);
      results.push(result);
      return;
    }
  }

  // Start storybook-rest-api
  console.log(`🚀 Starting storybook-rest-api on port ${port}...`);
  
  const cliPath = path.join(__dirname, '..', 'src', 'cli.js');
  const serverProcess = spawn('node', [cliPath, '--port', port.toString(), '--dir', exampleDir], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  let serverOutput = '';
  serverProcess.stdout.on('data', (data) => {
    serverOutput += data.toString();
  });
  serverProcess.stderr.on('data', (data) => {
    serverOutput += data.toString();
  });

  try {
    // Wait for server to start
    console.log('⏳ Waiting for server to start...');
    let storybookReady = false;
    const startTime = Date.now();
    
    while (!storybookReady && (Date.now() - startTime) < TIMEOUT) {
      await sleep(10000);
      
      // Check for version detection in output
      const versionMatch = serverOutput.match(/Detected Storybook version:\s*(\d+)/);
      if (versionMatch && !result.actualVersion) {
        result.actualVersion = parseInt(versionMatch[1], 10);
        result.versionMatch = result.actualVersion === expectedVersion;
        console.log(`✓ Detected version: ${result.actualVersion} (expected: ${expectedVersion})`);
      }

      // Try to get stories - this confirms everything is ready
      try {
        const response = await fetch(`http://localhost:${port}/api/stories`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.stories && data.stories.length > 0) {
            storybookReady = true;
            result.storiesCount = data.count || data.stories.length;
            console.log(`✓ Storybook ready - found ${result.storiesCount} stories`);
          }
        }
      } catch (e) {
        // Not ready yet, keep waiting
        console.log('   Waiting for Storybook...');
      }
    }

    if (!storybookReady) {
      result.errors.push('Storybook failed to start or populate stories within timeout');
      throw new Error('Server timeout');
    }

    // API is working since we got stories above
    result.apiWorking = true;
    console.log(`✓ API working - ${result.storiesCount} stories`);


    // Test /api/stories/:id
    console.log('📖 Testing /api/stories/:id...');
    try {
      const storyResponse = await fetch(`http://localhost:${port}/api/stories/example-button--primary`);
      const storyData = await storyResponse.json();
      
      if (storyData.success && storyData.story) {
        result.storyDetailsWorking = true;
        console.log('✓ Story details endpoint working');
        console.log(`  - Component: ${storyData.story.component || 'N/A'}`);
        console.log(`  - Args: ${JSON.stringify(storyData.story.args || {})}`);
      }
    } catch (error) {
      result.errors.push(`Story details endpoint failed: ${error.message}`);
    }

    // Test /api/docs/:id
    console.log('📚 Testing /api/docs/:id...');
    try {
      const docsResponse = await fetch(`http://localhost:${port}/api/docs/example-button--docs`);
      const docsData = await docsResponse.json();
      
      if (docsData.success && docsData.docs) {
        result.docsWorking = true;
        console.log('✓ Docs endpoint working');
        console.log(`  - Component: ${docsData.docs.component || 'N/A'}`);
        console.log(`  - Properties: ${Object.keys(docsData.docs.properties || {}).length}`);
      }
    } catch (error) {
      result.errors.push(`Docs endpoint failed: ${error.message}`);
    }

  } catch (error) {
    if (!result.errors.length) {
      result.errors.push(error.message);
    }
  } finally {
    // Kill server process
    console.log('🛑 Stopping server...');
    serverProcess.kill('SIGTERM');
    
    // Also kill any storybook processes
    try {
      execSync(`pkill -f "storybook.*${port}" 2>/dev/null || true`, { stdio: 'ignore' });
      execSync(`pkill -f "ng run.*storybook" 2>/dev/null || true`, { stdio: 'ignore' });
    } catch (e) {}
    
    await sleep(2000);
  }

  results.push(result);
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║           Storybook REST API - Integration Tests           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  for (const example of examples) {
    await testExample(example);
  }

  // Print summary
  console.log('\n\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                      TEST SUMMARY                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('┌─────────────┬─────────┬─────────────┬───────────┬─────────┬──────────┐');
  console.log('│ Example     │ Version │ Version OK  │ API       │ Stories │ Docs     │');
  console.log('├─────────────┼─────────┼─────────────┼───────────┼─────────┼──────────┤');

  let allPassed = true;
  for (const r of results) {
    const versionStr = r.actualVersion ? `${r.actualVersion}` : 'N/A';
    const versionOk = r.versionMatch ? '✅' : '❌';
    const apiOk = r.apiWorking ? '✅' : '❌';
    const storiesOk = r.storyDetailsWorking ? '✅' : '❌';
    const docsOk = r.docsWorking ? '✅' : '❌';
    
    console.log(`│ ${r.name.padEnd(11)} │ ${versionStr.padEnd(7)} │ ${versionOk.padEnd(11)} │ ${apiOk.padEnd(9)} │ ${storiesOk.padEnd(7)} │ ${docsOk.padEnd(8)} │`);
    
    if (!r.versionMatch || !r.apiWorking || !r.storyDetailsWorking || !r.docsWorking) {
      allPassed = false;
    }
  }

  console.log('└─────────────┴─────────┴─────────────┴───────────┴─────────┴──────────┘\n');

  // Print errors if any
  const failedTests = results.filter(r => r.errors.length > 0);
  if (failedTests.length > 0) {
    console.log('\n❌ Errors:');
    for (const r of failedTests) {
      console.log(`\n  ${r.name}:`);
      for (const error of r.errors) {
        console.log(`    - ${error}`);
      }
    }
  }

  console.log('\n');
  if (allPassed) {
    console.log('✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed!');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});

