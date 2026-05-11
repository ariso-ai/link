# QuickBooks PR 3/7: list-invoices

Branch: `codex/qb-invoices-flat`

Use this runbook to verify the `list-invoices` action.

## Setup

```bash
cd /Users/michaelgeiger/.codex/worktrees/456c/link
git switch codex/qb-invoices-flat
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
  --action list-invoices \
  --auto-confirm \
  --no-interactive \
  --no-dependency-update
```

```bash
CI=true npx nango deploy "${NANGO_ENV}" \
  --integration quickbooks-sandbox \
  --action list-invoices \
  --auto-confirm \
  --no-interactive \
  --no-dependency-update
```

## Dry Run

```bash
CI=true npx nango dryrun list-invoices "${NANGO_CONNECTION_ID}" \
  -e "${NANGO_ENV}" \
  --integration-id "${NANGO_PROVIDER_CONFIG_KEY}" \
  --validation \
  --input '{"maxResults":5,"startDate":"2026-01-01","endDate":"2026-05-11"}'
```

Expected result: command exits `0`, `invoices` is an array, and each invoice has `id`, `customer`, `totalAmount`, `balance`, and `metadata`.

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
    "action_name": "list-invoices",
    "input": {
      "maxResults": 5,
      "startDate": "2026-01-01",
      "endDate": "2026-05-11"
    }
  }'
```

## Chrome Check

Open the connected QuickBooks sandbox, go to `Sales > Invoices`, and confirm one returned invoice customer or document number is visible.

## Ari Dev App Smoke Test

2026-05-11 result against the dev app chat after deploying `list-invoices` to both `quickbooks` and `quickbooks-sandbox`:

[Ari chat](https://dev-eager-lederberg-f353eb.cheetah-oratrice.ts.net/chat?conversationId=50d4672a-fd05-45fb-93a4-2ca6d5e1de35)

![Ari list-invoices success](./03-list-invoices-ari-success.png)

The Ari chat returned `Succeeded` and listed the first five invoices from the live QuickBooks Sandbox tool call.

Direct Nango verification after deploy:

```text
connection 29477c67-32f6-45cf-bfad-513258b9c4c0: HTTP 200, first invoice id 130, docNumber 1037, customer Sonnenschein Family Store, totalAmount 362.07, balance 362.07
```

Interpretation: the `quickbooks-sandbox` action is deployed and works for the live dev-app connection.
