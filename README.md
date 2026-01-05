# storybook-rest-api

Expose your Storybook stories via a REST API. Works with **Storybook 8, 9, and 10**.

## Installation

```bash
# Using npx (no installation required)
npx storybook-rest-api

# Or install globally
npm install -g storybook-rest-api

# Or as a dev dependency
npm install --save-dev storybook-rest-api
```

## Quick Start

Navigate to your Storybook project and run:

```bash
npx storybook-rest-api
# or shorter alias
npx sb-rest-api
```

This will:
1. Start Storybook on an internal port
2. Start the API server on port 6006
3. Proxy Storybook through the same port

Access your stories at:
- **Storybook UI**: http://localhost:6006
- **API**: http://localhost:6006/api

## CLI Options

```bash
npx storybook-rest-api [options]

Options:
  -p, --port <number>          Port for the server (default: 6006)
  -s, --storybook-port <number> Internal Storybook port (default: 6010)
  --no-proxy                    Run API only (requires Storybook running separately)
  --storybook-url <url>         URL of existing Storybook instance
  -d, --dir <path>              Project directory (default: current directory)
  -h, --help                    Display help
```

## API Endpoints

### List All Stories
```bash
GET /api/stories
```

Response:
```json
{
  "success": true,
  "count": 10,
  "stories": [
    {
      "id": "example-button--primary",
      "name": "Primary",
      "title": "Example/Button",
      "type": "story"
    }
  ]
}
```

### Get Story Details
```bash
GET /api/stories/:storyId
```

Response:
```json
{
  "success": true,
  "story": {
    "id": "example-button--primary",
    "name": "Primary",
    "title": "Example/Button",
    "component": "ButtonComponent",
    "args": {
      "primary": true,
      "label": "Button"
    },
    "argTypes": {
      "backgroundColor": { "control": "color" }
    }
  }
}
```

### Get Full Documentation
```bash
GET /api/docs/:storyId
```

Response:
```json
{
  "success": true,
  "docs": {
    "storyId": "example-button--docs",
    "component": "ButtonComponent",
    "selector": "app-button",
    "template": "<button>{{ label }}</button>",
    "properties": {
      "label": {
        "description": "Button text",
        "type": "input",
        "required": true
      }
    },
    "storyExamples": {
      "Primary": {
        "code": "export const Primary = { args: { primary: true } };",
        "args": { "primary": "true" }
      }
    },
    "usageExamples": {
      "Primary": "<app-button [primary]=\"true\"></app-button>"
    }
  }
}
```

### Filter by Category
```bash
GET /api/stories/kind/:kind
```

## Examples

### Run API Only (Storybook already running)

```bash
# If Storybook is running on port 6006
npx storybook-rest-api --no-proxy --storybook-url http://localhost:6006 --port 3000
```

### Custom Ports

```bash
npx storybook-rest-api --port 8080 --storybook-port 9000
```

### Programmatic Usage

```javascript
const { createApp, startServer } = require('storybook-rest-api');

// Create Express app with API routes
const app = createApp({
  storybookUrl: 'http://localhost:6006',
  projectDir: process.cwd(),
});

// Or start full server with Storybook proxy
startServer({
  port: 6006,
  storybookPort: 6010,
  storybookUrl: 'http://localhost:6010',
  projectDir: process.cwd(),
  proxy: true,
});
```

## Supported Frameworks

- ✅ Angular
- ✅ React
- ✅ Vue
- ✅ Svelte
- ✅ Web Components
- ✅ Any Storybook project

## Supported Storybook Versions

- ✅ Storybook 8.x
- ✅ Storybook 9.x
- ✅ Storybook 10.x

## License

MIT

