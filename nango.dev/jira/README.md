# Jira

Custom [Nango](https://nango.dev) integration actions for [Jira Cloud REST API v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/).

**Why custom?** Nango's built-in `create-issue` template sends flat fields to Jira's REST API v3, which expects nested objects under a `fields` key and Atlassian Document Format for descriptions. Our custom actions handle this correctly.

## Actions

| Action | Method | Endpoint | Description | Scopes |
| --- | --- | --- | --- | --- |
| `create-issue` | `POST` | `/jira/issues` | Create an issue with correct v3 field mapping and ADF description | `write:jira-work` |
| `list-issues` | `GET` | `/jira/issues` | Search issues by project, status, assignee, or raw JQL with pagination | `read:jira-work` |

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

## Helpers

| Helper | Description |
| --- | --- |
| `get-cloud-id` | Retrieves the Jira Cloud ID for the authenticated connection via the OAuth accessible-resources endpoint |
