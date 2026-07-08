# Jira (Basic Auth)

Custom [Nango](https://nango.dev) integration actions for [Jira Cloud REST API v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/) using the [`jira-basic`](https://nango.dev/docs/integrations/all/jira-basic) provider (email + API token basic auth).

**Why a separate integration?** The `jira` integration uses OAuth 2 and must route every request through `api.atlassian.com/ex/jira/<cloudId>/...`, resolved via the OAuth accessible-resources endpoint. With basic auth, Nango resolves the base URL directly from the connection config (`https://<subdomain>.atlassian.net`), so these actions call `/rest/api/3/...` endpoints directly — no cloud ID lookup, no OAuth scopes.

## Connection config

| Field | Description |
| --- | --- |
| `subdomain` | The Jira Cloud subdomain (e.g. `acme` for `acme.atlassian.net`) |
| `username` (credential) | Atlassian account email address |
| `password` (credential) | Atlassian API token |

## Actions

| Action | Method | Endpoint | Description |
| --- | --- | --- | --- |
| `create-issue` | `POST` | `/jira/issues` | Create an issue with correct v3 field mapping and ADF description |
| `list-issues` | `GET` | `/jira/issues` | Search issues by project, status, assignee, or raw JQL with pagination |
| `list-projects` | `GET` | `/jira/projects` | List projects visible to the authenticated user, with optional name/key filter |

### `create-issue`

Creates a Jira issue. Converts plain text descriptions to Atlassian Document Format (ADF) automatically.

**Input:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `project` | `string` | yes | Project key (e.g. `"KAN"`) |
| `summary` | `string` | yes | Issue title |
| `issueType` | `string` | yes | Issue type name (e.g. `"Task"`, `"Bug"`, `"Story"`) |
| `description` | `string` | no | Plain text description (converted to ADF) |
| `assignee` | `string` | no | Assignee account ID |
| `labels` | `string[]` | no | Label strings |
| `priority` | `string` | no | Priority name (e.g. `"High"`, `"Medium"`, `"Low"`) |

### `list-issues`

Searches for issues using JQL. Supports filtering by project, status, and assignee, or a raw JQL query.

**Input:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `project` | `string` | yes | Project key (e.g. `"PROJ"`) |
| `status` | `string` | no | Filter by status name (e.g. `"To Do"`, `"In Progress"`) |
| `assignee` | `string` | no | Filter by assignee account ID. Use `"currentUser()"` for the authenticated user |
| `maxResults` | `number` | no | Max issues to return (default 50, max 100) |
| `startAt` | `number` | no | Pagination offset (default 0) |
| `jql` | `string` | no | Raw JQL query. When provided, project/status/assignee filters are ignored |

### `list-projects`

Lists projects visible to the authenticated user via `/rest/api/3/project/search`.

**Input:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `query` | `string` | no | Filter projects by name or key (case-insensitive substring match) |
| `maxResults` | `number` | no | Max projects to return (default 50, max 100) |
| `startAt` | `number` | no | Pagination offset (default 0) |
