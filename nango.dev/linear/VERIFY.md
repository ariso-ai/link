# Linear Verification

Use this after the `linear` provider configuration exists in Nango and a Linear connection has been created.

## Environment

Set these values first:

```bash
export NANGO_ENV=dev
export NANGO_PROVIDER_CONFIG_KEY=linear
export NANGO_CONNECTION_ID=<linear-connection-id>
export LINEAR_TEAM_KEY=<team-key>
export LINEAR_ISSUE_ID=<linear-issue-uuid>
export LINEAR_ISSUE_IDENTIFIER=<team-key-123>
```

Notes:

- `LINEAR_TEAM_KEY` is the short team key, for example `ENG`.
- `LINEAR_ISSUE_IDENTIFIER` is the human-readable issue key, for example `ENG-123`.
- `LINEAR_ISSUE_ID` is the Linear UUID. Write actions require the UUID.

## Dry Run: Read Actions

List issues:

```bash
npx nango dryrun list-issues "$NANGO_CONNECTION_ID" \
  -e "$NANGO_ENV" \
  --integration-id "$NANGO_PROVIDER_CONFIG_KEY" \
  --validation \
  --input "{\"teamKey\":\"$LINEAR_TEAM_KEY\",\"limit\":5}"
```

List started issues:

```bash
npx nango dryrun list-issues "$NANGO_CONNECTION_ID" \
  -e "$NANGO_ENV" \
  --integration-id "$NANGO_PROVIDER_CONFIG_KEY" \
  --validation \
  --input "{\"teamKey\":\"$LINEAR_TEAM_KEY\",\"stateType\":\"started\",\"limit\":5}"
```

Search issues:

```bash
npx nango dryrun list-issues "$NANGO_CONNECTION_ID" \
  -e "$NANGO_ENV" \
  --integration-id "$NANGO_PROVIDER_CONFIG_KEY" \
  --validation \
  --input '{"query":"QuickBooks","limit":5}'
```

Get issue by human identifier:

```bash
npx nango dryrun get-issue "$NANGO_CONNECTION_ID" \
  -e "$NANGO_ENV" \
  --integration-id "$NANGO_PROVIDER_CONFIG_KEY" \
  --validation \
  --input "{\"issueId\":\"$LINEAR_ISSUE_IDENTIFIER\"}"
```

Get issue by UUID:

```bash
npx nango dryrun get-issue "$NANGO_CONNECTION_ID" \
  -e "$NANGO_ENV" \
  --integration-id "$NANGO_PROVIDER_CONFIG_KEY" \
  --validation \
  --input "{\"issueId\":\"$LINEAR_ISSUE_ID\"}"
```

Expected result:

- Commands return issue objects with `id`, `identifier`, `title`, `url`, `state`, `team`, `assignee`, `creator`, and `labels`.
- `get-issue` should work with either `ENG-123` style identifiers or UUIDs.

## Dry Run: Write Smoke Tests

Only run these against a disposable test issue.

Add a comment:

```bash
npx nango dryrun add-comment "$NANGO_CONNECTION_ID" \
  -e "$NANGO_ENV" \
  --integration-id "$NANGO_PROVIDER_CONFIG_KEY" \
  --validation \
  --input "{\"issueId\":\"$LINEAR_ISSUE_ID\",\"body\":\"Nango smoke test comment from Linear verification.\"}"
```

Update issue title:

```bash
npx nango dryrun update-issue "$NANGO_CONNECTION_ID" \
  -e "$NANGO_ENV" \
  --integration-id "$NANGO_PROVIDER_CONFIG_KEY" \
  --validation \
  --input "{\"issueId\":\"$LINEAR_ISSUE_ID\",\"title\":\"Nango smoke test - verify Linear action\"}"
```

Expected result:

- `add-comment` returns a comment `id`, `url`, and `createdAt`.
- `update-issue` returns the updated issue object.
- If write actions fail with authorization errors, confirm the Linear provider config includes the `write` scope and reconnect the Linear account.

## Direct Action API Smoke Tests

List issues through deployed Nango action execution:

```bash
curl --request POST \
  --url https://api.nango.dev/action/trigger \
  --header "Authorization: Bearer $NANGO_SECRET_KEY" \
  --header "Connection-Id: $NANGO_CONNECTION_ID" \
  --header "Provider-Config-Key: $NANGO_PROVIDER_CONFIG_KEY" \
  --header "Content-Type: application/json" \
  --data "{
    \"action_name\": \"list-issues\",
    \"input\": {
      \"teamKey\": \"$LINEAR_TEAM_KEY\",
      \"limit\": 5
    }
  }"
```

Get an issue:

```bash
curl --request POST \
  --url https://api.nango.dev/action/trigger \
  --header "Authorization: Bearer $NANGO_SECRET_KEY" \
  --header "Connection-Id: $NANGO_CONNECTION_ID" \
  --header "Provider-Config-Key: $NANGO_PROVIDER_CONFIG_KEY" \
  --header "Content-Type: application/json" \
  --data "{
    \"action_name\": \"get-issue\",
    \"input\": {
      \"issueId\": \"$LINEAR_ISSUE_IDENTIFIER\"
    }
  }"
```

Optional comment smoke test:

```bash
curl --request POST \
  --url https://api.nango.dev/action/trigger \
  --header "Authorization: Bearer $NANGO_SECRET_KEY" \
  --header "Connection-Id: $NANGO_CONNECTION_ID" \
  --header "Provider-Config-Key: $NANGO_PROVIDER_CONFIG_KEY" \
  --header "Content-Type: application/json" \
  --data "{
    \"action_name\": \"add-comment\",
    \"input\": {
      \"issueId\": \"$LINEAR_ISSUE_ID\",
      \"body\": \"Nango deployed action smoke test comment.\"
    }
  }"
```

