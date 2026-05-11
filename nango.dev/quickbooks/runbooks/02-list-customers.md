# QuickBooks PR 2/7: list-customers

Branch: `codex/qb-list-customers`

Use this runbook to verify the `list-customers` action.

## Setup

```bash
cd /Users/michaelgeiger/.codex/worktrees/456c/link
git switch codex/qb-list-customers
git pull --ff-only
cd nango.dev

set -a
source ../.env
set +a

export NANGO_ENV="${NANGO_ENV:-dev}"
export NANGO_PROVIDER_CONFIG_KEY="${NANGO_PROVIDER_CONFIG_KEY:-quickbooks-sandbox}"
export NANGO_CONNECTION_ID="<quickbooks-sandbox-connection-id>"
```

## Compile

```bash
CI=true npm run compile -- --no-interactive --no-dependency-update
```

## Dry Run

```bash
CI=true npx nango dryrun list-customers "${NANGO_CONNECTION_ID}" \
  -e "${NANGO_ENV}" \
  --integration-id "${NANGO_PROVIDER_CONFIG_KEY}" \
  --validation \
  --input '{"active":true,"maxResults":5}'
```

Expected result: command exits `0`, `customers` is an array, and any missing QuickBooks fields are normalized to empty strings rather than `null`.

## cURL Smoke Test

Run this only after the branch has been deployed and the action has been enabled in Nango.

```bash
curl --request POST \
  --url "https://api.nango.dev/action/trigger" \
  --header "Authorization: Bearer ${NANGO_SECRET_KEY}" \
  --header "Connection-Id: ${NANGO_CONNECTION_ID}" \
  --header "Provider-Config-Key: ${NANGO_PROVIDER_CONFIG_KEY}" \
  --header "Content-Type: application/json" \
  --data '{
    "action_name": "list-customers",
    "input": {
      "active": true,
      "maxResults": 5
    }
  }'
```

## Chrome Check

Open the connected QuickBooks sandbox, go to `Customer Hub` or `Sales > Customers`, and confirm at least one returned customer display name appears in the UI.
