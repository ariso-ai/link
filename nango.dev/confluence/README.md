# Confluence

Custom [Nango](https://nango.dev) integration actions for [Confluence Cloud REST API](https://developer.atlassian.com/cloud/confluence/rest/v1/intro/).

## Actions

| Action | Method | Endpoint | Description | Scopes |
| --- | --- | --- | --- | --- |
| `search-confluence` | `GET` | `/confluence/search` | Search pages using CQL | `search:confluence` |
| `get-page` | `GET` | `/confluence/pages/{pageId}` | Get a page by ID including body content | `read:confluence-content.all` |
| `list-spaces` | `GET` | `/confluence/spaces` | List available spaces | `read:confluence-space.summary` |
| `get-page-children` | `GET` | `/confluence/pages/{pageId}/children` | Get child pages of a given page | `read:confluence-content.summary` |

### `search-confluence`

Searches Confluence pages using CQL (Confluence Query Language).

**Input:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `query` | `string` | yes | CQL query string (e.g. `"type = page AND text ~ 'search term'"`) |
| `limit` | `number` | no | Maximum number of results to return (default 10) |

**Output:** list of `{ pageId, title, spaceKey, url, excerpt }`

### `get-page`

Retrieves a Confluence page by ID, including its body in storage (wiki/XHTML) format.

**Input:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `pageId` | `string` | yes | The Confluence page ID |

**Output:** `{ title, spaceKey, body, url, lastModified }`

### `list-spaces`

Lists Confluence spaces accessible to the authenticated user.

**Input:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `limit` | `number` | no | Maximum number of spaces to return (default 25) |

**Output:** list of `{ spaceKey, name, description, url }`

### `get-page-children`

Returns the direct child pages of a given Confluence page.

**Input:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `pageId` | `string` | yes | The parent Confluence page ID |

**Output:** list of `{ pageId, title, url }`

## Helpers

| Helper | Description |
| --- | --- |
| `get-cloud-id` | Retrieves the Confluence Cloud ID for the authenticated connection via the OAuth accessible-resources endpoint |
