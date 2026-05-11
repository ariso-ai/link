# @ariso-ai/link

![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/ariso-ai/link?utm_source=oss&utm_medium=github&utm_campaign=ariso-ai%2Flink&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)
![Actions CI](https://github.com/ariso-ai/link/actions/workflows/ci.yml/badge.svg)

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
