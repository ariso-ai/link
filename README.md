# @ariso-ai/link

Monorepo for Ariso integration packages, managed as an npm workspace.

## Workspaces

| Package | Path | Description |
| --- | --- | --- |
| `@ariso-ai/link-nango-dev` | `nango.dev/` | Custom [Nango](https://nango.dev) integration actions for Ariso |

## Getting started

```bash
npm install
```

Dependencies are installed at the root and shared via npm workspaces. A single `package-lock.json` at the root manages all workspace dependencies.

## Running workspace commands

```bash
# Run a script in a specific workspace
npm -w nango.dev run compile
npm -w nango.dev run dev
```
