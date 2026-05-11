# QuickBooks PR 7/7: create-journal-entry

Branch: `codex/qb-create-journal-entry`

Use this runbook to verify the `create-journal-entry` action. This writes a small balanced journal entry to the connected QuickBooks sandbox.

## Setup

```bash
cd /Users/michaelgeiger/.codex/worktrees/456c/link
git switch codex/qb-create-journal-entry
git pull --ff-only
cd nango.dev

set -a
source ../.env
set +a

export NANGO_ENV="${NANGO_ENV:-dev}"
export NANGO_PROVIDER_CONFIG_KEY="${NANGO_PROVIDER_CONFIG_KEY:-quickbooks}"
export NANGO_CONNECTION_ID="<quickbooks-connection-id>"
```

## Get Company And Accounts

```bash
export QBO_COMPANY_ID="$(
  curl -sS --get "https://api.nango.dev/connections/${NANGO_CONNECTION_ID}" \
    --data-urlencode "provider_config_key=${NANGO_PROVIDER_CONFIG_KEY}" \
    --header "Authorization: Bearer ${NANGO_SECRET_KEY}" \
    | node -e 'let d=""; process.stdin.on("data", c => d += c); process.stdin.on("end", () => process.stdout.write(JSON.parse(d).connection_config.realmId));'
)"

curl -sS --get "https://api.nango.dev/proxy/v3/company/${QBO_COMPANY_ID}/query" \
  --data-urlencode "query=SELECT * FROM Account WHERE Active = true MAXRESULTS 20" \
  --header "Authorization: Bearer ${NANGO_SECRET_KEY}" \
  --header "Connection-Id: ${NANGO_CONNECTION_ID}" \
  --header "Provider-Config-Key: ${NANGO_PROVIDER_CONFIG_KEY}" \
  | node -e 'let d=""; process.stdin.on("data", c => d += c); process.stdin.on("end", () => { const rows = JSON.parse(d).QueryResponse?.Account ?? []; console.table(rows.map(a => ({ id: a.Id, name: a.Name, type: a.AccountType })).slice(0, 20)); });'
```

Choose two account IDs from the table and export them:

```bash
export DEBIT_ACCOUNT_ID="<expense-or-asset-account-id>"
export CREDIT_ACCOUNT_ID="<bank-liability-equity-or-income-account-id>"
```

## Compile

```bash
CI=true npm run compile -- --no-interactive --no-dependency-update
```

## Dry Run

```bash
CI=true npx nango dryrun create-journal-entry "${NANGO_CONNECTION_ID}" \
  -e "${NANGO_ENV}" \
  --integration-id "${NANGO_PROVIDER_CONFIG_KEY}" \
  --validation \
  --input "{
    \"txnDate\": \"2026-05-11\",
    \"privateNote\": \"Nango sandbox create-journal-entry smoke test\",
    \"lines\": [
      { \"postingType\": \"Debit\", \"amount\": 1, \"accountId\": \"${DEBIT_ACCOUNT_ID}\", \"description\": \"Smoke test debit\" },
      { \"postingType\": \"Credit\", \"amount\": 1, \"accountId\": \"${CREDIT_ACCOUNT_ID}\", \"description\": \"Smoke test credit\" }
    ]
  }"
```

Expected result: command exits `0`, returns an `id`, `debitTotal` equals `creditTotal`, and `isBalanced` is `true`.

## cURL Smoke Test

Run this only after the branch has been deployed and the action has been enabled in Nango.

```bash
curl --request POST \
  --url "https://api.nango.dev/action/trigger" \
  --header "Authorization: Bearer ${NANGO_SECRET_KEY}" \
  --header "Connection-Id: ${NANGO_CONNECTION_ID}" \
  --header "Provider-Config-Key: ${NANGO_PROVIDER_CONFIG_KEY}" \
  --header "Content-Type: application/json" \
  --data "{
    \"action_name\": \"create-journal-entry\",
    \"input\": {
      \"txnDate\": \"2026-05-11\",
      \"privateNote\": \"Nango sandbox create-journal-entry curl smoke test\",
      \"lines\": [
        { \"postingType\": \"Debit\", \"amount\": 1, \"accountId\": \"${DEBIT_ACCOUNT_ID}\", \"description\": \"Curl smoke test debit\" },
        { \"postingType\": \"Credit\", \"amount\": 1, \"accountId\": \"${CREDIT_ACCOUNT_ID}\", \"description\": \"Curl smoke test credit\" }
      ]
    }
  }"
```

## Chrome Check

Open the connected QuickBooks sandbox, use the global search for `Nango sandbox create-journal-entry`, and confirm the created journal entry has one debit and one credit line for the same amount.
