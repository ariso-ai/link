# Greenhouse (Basic Auth)

Custom [Nango](https://nango.dev) integration actions for the [Greenhouse Harvest API](https://docs.greenhouse.io/harvest.html) using the [`greenhouse-basic`](https://nango.dev/docs/integrations/all/greenhouse-basic) provider (Harvest API key via basic auth).

These actions cover two workflows: pulling candidate resumes, and scheduling interviews.

## Connection config

| Field | Description |
| --- | --- |
| `apiDomain` | Greenhouse API domain (`harvest`, resolving to `https://harvest.greenhouse.io`) |
| `username` (credential) | Harvest API key |
| `password` (credential) | Empty — Greenhouse uses the API key as the username with a blank password |

### Required Harvest API key permissions

Harvest keys grant access per endpoint, set under **Dev Center → API Credential Management → Manage Permissions**. These actions need:

- `GET: List candidates`, `GET: Retrieve candidate`
- `GET: List job stages`
- `GET: List users` (only when using `onBehalfOfEmail`)
- `POST: Create a scheduled interview`

## Actions

| Action | Method | Endpoint | Description |
| --- | --- | --- | --- |
| `list-candidates` | `GET` | `/greenhouse/candidates` | List candidates with their applications and whether a resume is on file |
| `get-candidate-resume` | `GET` | `/greenhouse/candidates/resume` | Fetch a candidate's resume as a signed download URL |
| `list-job-stages` | `GET` | `/greenhouse/jobs/stages` | List a job's interview stages and the interviews within them |
| `schedule-interview` | `POST` | `/greenhouse/scheduled-interviews` | Schedule an interview against an existing application |

### `list-candidates`

Calls `GET /v1/candidates`. Each returned candidate includes an `applications` array — the `id` there is the `applicationId` that `schedule-interview` needs.

**Input:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `jobId` | `number` | no | Only candidates who applied to this job |
| `email` | `string` | no | Only candidates with this email address |
| `updatedAfter` | `string` | no | Only candidates updated after this ISO-8601 timestamp |
| `perPage` | `number` | no | Results per page (default 50, max 500) |
| `page` | `number` | no | Page number, 1-based (default 1) |

`hasMore` is true when the page came back full, which means another page may exist.

### `get-candidate-resume`

Calls `GET /v1/candidates/{id}` and filters `attachments` to `type: "resume"`.

**Input:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `candidateId` | `number` | yes | Greenhouse candidate ID |
| `includeAllAttachments` | `boolean` | no | Return every attachment (cover letters, take-home tests) instead of only resumes |

> **Attachment URLs expire.** Greenhouse hosts attachments on S3 and serves them as signed URLs valid for **7 days** from issue. Download the file when you get the URL rather than storing the URL for later.

Harvest exposes attachments at two levels of a candidate response: on the candidate profile, and on each nested application (per-application attachments were added in July 2019). The candidate-level array appears to aggregate both, but that isn't documented, so `list-candidates` and `get-candidate-resume` read from both levels and deduplicate — see `helpers/attachments.ts`.

Deduplication keys on `filename` + `type` + `created_at`, never on `url`: signed URLs are regenerated per request, so the same file can arrive with different signatures at each level and would survive a URL-based comparison.

### `list-job-stages`

Calls `GET /v1/jobs/{jobId}/stages`. This is the only source of the `interviewId` that `schedule-interview` requires.

**Input:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `jobId` | `number` | yes | Greenhouse job ID |

### `schedule-interview`

Calls `POST /v2/scheduled_interviews`. v2 rather than v1: [v1 was deprecated in 2020](https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/harvest/_scheduled_interviews.md) and returns a truncated record that has to be polled for.

**Input:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `applicationId` | `number` | yes | Application to schedule against (from `list-candidates`) |
| `interviewId` | `number` | yes | Interview to schedule (from `list-job-stages`) |
| `start` | `string` | yes | Start time, ISO-8601 (e.g. `"2025-11-05T13:00:00Z"`) |
| `end` | `string` | yes | End time, ISO-8601 |
| `interviewers` | `object[]` | yes | Each entry needs `userId` or `email`, plus optional `responseStatus` |
| `onBehalfOfUserId` | `number` | no\* | Greenhouse user ID performing the action |
| `onBehalfOfEmail` | `string` | no\* | Email of that user, resolved to an ID via `GET /v1/users` |
| `location` | `string` | no | Interview location |
| `videoConferencingUrl` | `string` | no | Video conferencing link |
| `externalEventId` | `string` | no | Calendar event ID; a unique `ariso-<uuid>` is generated when omitted |

\* Exactly one of `onBehalfOfUserId` / `onBehalfOfEmail` is required. Greenhouse requires an `On-Behalf-Of` header on every write request so the action is attributable to a user for auditing.

`responseStatus` is one of `needs_action` (default), `declined`, `tentative`, `accepted`.

## Typical flow

```
list-candidates { jobId: 123 }        → candidate + applications[].id
list-job-stages { jobId: 123 }        → stages[].interviews[].id
schedule-interview {
  applicationId, interviewId,
  start, end,
  interviewers: [{ email: "interviewer@acme.com" }],
  onBehalfOfEmail: "recruiter@acme.com"
}
```
