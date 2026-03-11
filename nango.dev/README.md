# nango.dev

Custom [Nango](https://nango.dev) integration actions for Ariso. These replace Nango's built-in templates where they have bugs or missing functionality, and are deployed as MCP tools via Nango's streamable-http MCP server.

## Project structure

```
nango.dev/
├── index.ts                          # Entry point — import all actions here
├── package.json
├── tsconfig.json
├── .env                              # Nango secret keys (git-ignored)
└── <provider>/                       # One directory per integration provider
    ├── actions/                      # On-demand actions (exposed as MCP tools)
    │   └── <action-name>.ts
    └── helpers/                      # Shared utilities for this provider
        └── <helper-name>.ts
```

## Setup

### Prerequisites

- Node.js >= 24
- A [Nango](https://app.nango.dev) account with a Jira OAuth 2 integration configured

### Configure

Copy your secret key from [Environment Settings](https://app.nango.dev/dev/environment-settings) into `.env`:

```bash
NANGO_SECRET_KEY=your-secret-key-here
```

### Compile

```bash
npx nango compile
```

### Deploy

```bash
npx nango deploy dev
```

After deploying, the actions appear in the Nango dashboard under your integration's Functions tab. Enable them with the toggle, and they'll be exposed as MCP tools.

## Adding a new action

1. Create the action file:

```bash
# Example: add a get-issue action for Jira
touch nango-integrations/jira/actions/get-issue.ts
```

2. Implement using `createAction` with Zod schemas for input/output:

```typescript
import { createAction } from 'nango';
import * as z from 'zod';

const action = createAction({
  description: 'Get a single Jira issue by key',
  version: '1.0.0',
  endpoint: { method: 'GET', path: '/jira/issue', group: 'Issues' },
  scopes: ['read:jira-work'],
  input: z.object({ issueKey: z.string() }),
  output: z.object({
    /* ... */
  }),
  exec: async (nango, input) => {
    const response = await nango.proxy({
      /* ... */
    });
    return response.data;
  },
});

export default action;
```

3. Register it in `index.ts`:

```typescript
import './jira/actions/get-issue.js';
```

4. Compile and deploy:

```bash
nango compile && nango deploy dev
```

## Adding a new provider

1. Create the provider directory structure:

```bash
mkdir -p nango-integrations/salesforce/actions nango-integrations/salesforce/helpers
```

2. Add action files following the same pattern as `jira/`.

3. Import them in `index.ts`:

```typescript
// Salesforce integrations
import './salesforce/actions/list-accounts.js';
```

4. Set up the provider's OAuth integration in the [Nango dashboard](https://app.nango.dev/dev/integrations/create) before deploying.

## MCP usage

Once deployed and enabled, actions are available via Nango's MCP server at:

```
POST https://api.nango.dev/mcp
```

With headers:

```
Authorization: Bearer <nango-secret-key>
connection-id: <connection-id>
provider-config-key: <provider-id>
```

The MCP server uses `streamable-http` transport and exposes each enabled action as a tool.
