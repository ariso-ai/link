# QuickBooks PR 4/7: list-payments

Branch: `codex/qb-payments-flat`

Use this runbook to verify the `list-payments` action.

## Setup

```bash
cd /Users/michaelgeiger/.codex/worktrees/456c/link
git switch codex/qb-payments-flat
git pull --ff-only
cd nango.dev

set -a
source ../.env
set +a

export NANGO_ENV="${NANGO_ENV:-dev}"
export NANGO_PROVIDER_CONFIG_KEY="${NANGO_PROVIDER_CONFIG_KEY:-quickbooks}"
export NANGO_CONNECTION_ID="<quickbooks-connection-id>"
```

## Compile

```bash
CI=true npm run compile -- --no-interactive --no-dependency-update
```

## Deploy

Deploy the same action code to both provider config keys. `quickbooks-sandbox` is a thin Nango entrypoint that reuses the `quickbooks` action implementation, so this does not duplicate business logic.

```bash
CI=true npx nango deploy "${NANGO_ENV}" \
  --integration quickbooks \
  --action list-payments \
  --auto-confirm \
  --no-interactive \
  --no-dependency-update
```

```bash
CI=true npx nango deploy "${NANGO_ENV}" \
  --integration quickbooks-sandbox \
  --action list-payments \
  --auto-confirm \
  --no-interactive \
  --no-dependency-update
```

## Dry Run

```bash
CI=true npx nango dryrun list-payments "${NANGO_CONNECTION_ID}" \
  -e "${NANGO_ENV}" \
  --integration-id "${NANGO_PROVIDER_CONFIG_KEY}" \
  --validation \
  --input '{"maxResults":5,"startDate":"2026-01-01","endDate":"2026-05-11"}'
```

Expected result: command exits `0`, `payments` is an array, and empty sandbox result sets are acceptable.

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
    "action_name": "list-payments",
    "input": {
      "maxResults": 5,
      "startDate": "2026-01-01",
      "endDate": "2026-05-11"
    }
  }'
```

## Chrome Check

Open the connected QuickBooks sandbox, go to `Sales > All sales`, filter for payments if needed, and compare the returned customer and amount.

## Ari Dev App Smoke Test

2026-05-11 result against the dev app chat after deploying `list-payments` to both `quickbooks` and `quickbooks-sandbox`:

[Ari chat](https://dev-eager-lederberg-f353eb.cheetah-oratrice.ts.net/chat?conversationId=ce2ce20e-76a9-45ab-a787-49d5fc922a33)

![Ari list-payments success](./04-list-payments-ari-success.png)

The Ari chat returned `Succeeded` and listed the first five payments from the live QuickBooks Sandbox tool call.

Direct Nango verification after deploy:

```text
connection 29477c67-32f6-45cf-bfad-513258b9c4c0: HTTP 200, first payment id 128, customer 0969 Ocean View Road, txnDate 2026-04-10, totalAmount 387, unappliedAmount 0
```

Interpretation: the `quickbooks-sandbox` action is deployed and works for the live dev-app connection.
