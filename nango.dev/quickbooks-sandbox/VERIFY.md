# QuickBooks Verification Runbook

Use this runbook to verify the QuickBooks Online actions from compile through Nango dashboard testing and agent/MCP prompt testing.

## Prerequisites

- A Nango dev environment with a `quickbooks-sandbox` integration configured.
- A QuickBooks Online sandbox/company connected through Nango.
- The connection has the `com.intuit.quickbooks.accounting` scope.
- A Nango environment secret key available locally as `NANGO_SECRET_KEY`.
- The QuickBooks connection ID and provider config key: `quickbooks-sandbox`

If an action fails with `QuickBooks realmId missing`, reauthenticate the QuickBooks connection in Nango. QuickBooks requires the company ID, also called `realmId`, for every company API request.

## Local Compile Check

Run this before deploying:

```bash
CI=true npm -w nango.dev run compile -- --no-interactive --no-dependency-update
```

Expected result:

- Typechecking passes.
- The build output includes all six QuickBooks actions:
  - `list-customers`
  - `list-invoices`
  - `list-payments`
  - `list-sales-receipts`
  - `list-journal-entries`
  - `run-report`

## Deploy to Nango Dev

From the repo root:

```bash
cd nango.dev
NANGO_SECRET_KEY=<dev-secret-key> npx nango deploy dev
```

If the CLI prompts for destructive changes, stop and inspect the diff before confirming. This PR only adds QuickBooks actions and should not remove existing Jira, Confluence, or Linear functions.

## Nango App Verification

1. Open [Nango](https://app.nango.dev).
2. Select the correct environment, usually `dev`.
3. Open the QuickBooks integration: `quickbooks-sandbox`.
4. Confirm the QuickBooks OAuth app credentials are configured.
5. Confirm at least one QuickBooks connection exists and is healthy.
6. Open the integration's Functions/Actions area.
7. Confirm these actions are present and enabled:
   - `list-customers`
   - `list-invoices`
   - `list-payments`
   - `list-sales-receipts`
   - `list-journal-entries`
   - `run-report`
8. Trigger each action from the Nango app's action test/run panel if available. Use the JSON payloads below.
9. After each run, check the Nango logs/activity view:
   - The action invocation should complete successfully.
   - The upstream QuickBooks request should be visible.
   - There should be no auth refresh, `realmId`, rate-limit, or validation errors.

If the dashboard does not expose an action run panel for your environment, use the CLI dry runs below and verify the same executions in Nango logs.

## CLI Dry Runs Against the Same Nango Connection

Set these once:

```bash
export NANGO_ENV=dev
export NANGO_PROVIDER_CONFIG_KEY=quickbooks-sandbox
export NANGO_CONNECTION_ID=<quickbooks-connection-id>
```

Run read actions with validation:

```bash
npx nango dryrun list-customers "$NANGO_CONNECTION_ID" \
  -e "$NANGO_ENV" \
  --integration-id "$NANGO_PROVIDER_CONFIG_KEY" \
  --validation \
  --input '{"active":true,"maxResults":5}'

npx nango dryrun list-invoices "$NANGO_CONNECTION_ID" \
  -e "$NANGO_ENV" \
  --integration-id "$NANGO_PROVIDER_CONFIG_KEY" \
  --validation \
  --input '{"status":"open","maxResults":5}'

npx nango dryrun list-payments "$NANGO_CONNECTION_ID" \
  -e "$NANGO_ENV" \
  --integration-id "$NANGO_PROVIDER_CONFIG_KEY" \
  --validation \
  --input '{"maxResults":5}'

npx nango dryrun list-sales-receipts "$NANGO_CONNECTION_ID" \
  -e "$NANGO_ENV" \
  --integration-id "$NANGO_PROVIDER_CONFIG_KEY" \
  --validation \
  --input '{"maxResults":5}'

npx nango dryrun list-journal-entries "$NANGO_CONNECTION_ID" \
  -e "$NANGO_ENV" \
  --integration-id "$NANGO_PROVIDER_CONFIG_KEY" \
  --validation \
  --input '{"maxResults":5}'

npx nango dryrun run-report "$NANGO_CONNECTION_ID" \
  -e "$NANGO_ENV" \
  --integration-id "$NANGO_PROVIDER_CONFIG_KEY" \
  --validation \
  --input '{"report":"ProfitAndLoss","startDate":"2026-01-01","endDate":"2026-03-31","accountingMethod":"Accrual"}'
```

Adjust report dates to match the sandbox company's seeded data. `run-report` rejects explicit date ranges longer than 186 days.

## Direct Action API Smoke Test

Use this if you need to confirm the deployed action outside the dashboard while still exercising Nango cloud execution:

```bash
curl --request POST \
  --url https://api.nango.dev/action/trigger \
  --header "Authorization: Bearer $NANGO_SECRET_KEY" \
  --header "Connection-Id: $NANGO_CONNECTION_ID" \
  --header "Provider-Config-Key: $NANGO_PROVIDER_CONFIG_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "action_name": "list-customers",
    "input": {
      "active": true,
      "maxResults": 5
    }
  }'
```

Expected result:

- HTTP 200.
- A `customers` array is present. It may be empty if the connected QuickBooks company has no matching customers.

## Expected Action Results

| Action | Minimal Input | Expected Output |
| --- | --- | --- |
| `list-customers` | `{"active":true,"maxResults":5}` | `customers[]`, pagination fields, customer names/contact fields where present |
| `list-invoices` | `{"status":"open","maxResults":5}` | `invoices[]`, customer refs, `totalAmount`, `balance` |
| `list-payments` | `{"maxResults":5}` | `payments[]`, customer refs, `totalAmount`, `unappliedAmount` |
| `list-sales-receipts` | `{"maxResults":5}` | `salesReceipts[]`, customer refs, totals, payment/deposit refs |
| `list-journal-entries` | `{"maxResults":5}` | `journalEntries[]`, lines, `debitTotal`, `creditTotal`, `isBalanced` |
| `run-report` | `{"report":"ProfitAndLoss","startDate":"2026-01-01","endDate":"2026-03-31"}` | report header, `columns[]`, `rows[]`, and raw QuickBooks report payload |

Empty arrays are acceptable for sparse sandbox companies. Schema validation failures, auth failures, and missing `realmId` errors are not acceptable.

## QuickBooks-Specific Agent Prompts

Use these in the Nango MCP/tool-calling tester or in the agent connected to the Nango MCP server for the QuickBooks connection. The goal is to prove the agent chooses the correct QuickBooks action and can interpret the result without write access.

### Customers

Prompt:

```text
List up to 5 active QuickBooks customers. For each customer, show the display name, email if present, phone if present, balance, and last updated time.
```

Expected tool behavior:

- Calls `list-customers`.
- Uses input similar to `{"active":true,"maxResults":5}`.
- Does not ask for write/create access.

### Open Invoices

Prompt:

```text
Find up to 10 open QuickBooks invoices and summarize the customer, invoice number, transaction date, due date, total amount, and remaining balance.
```

Expected tool behavior:

- Calls `list-invoices`.
- Uses input similar to `{"status":"open","maxResults":10}`.
- Treats `balance > 0` invoices as open.

### Invoice Payments

Prompt:

```text
Show the 10 most recent QuickBooks payments received against invoices. Include customer, payment date, total amount, unapplied amount, payment method, and deposit account when present.
```

Expected tool behavior:

- Calls `list-payments`.
- Does not call `list-sales-receipts` unless the user asks for immediate-sale receipts too.

### Sales Receipts

Prompt:

```text
Show the 10 most recent QuickBooks sales receipts for immediately-paid sales. Include customer, receipt number, transaction date, total amount, payment method, and deposit account.
```

Expected tool behavior:

- Calls `list-sales-receipts`.
- Uses QuickBooks `SalesReceipt` terminology in the answer.

### Receipts, Ambiguous Customer Language

Prompt:

```text
The customer asked for receipts. Check both QuickBooks invoice payments and sales receipts, then explain the difference between what you found.
```

Expected tool behavior:

- Calls both `list-payments` and `list-sales-receipts`.
- Explains that `Payment` records money received against invoices and `SalesReceipt` records immediately-paid sales.

### Profit and Loss Report

Prompt:

```text
Run a QuickBooks profit and loss report for 2026-01-01 through 2026-03-31 on an accrual basis. Summarize the top-level income, expenses, and net income if those rows are present.
```

Expected tool behavior:

- Calls `run-report`.
- Uses input similar to `{"report":"ProfitAndLoss","startDate":"2026-01-01","endDate":"2026-03-31","accountingMethod":"Accrual"}`.
- Does not request a range longer than 186 days.

### General Ledger Report

Prompt:

```text
Run a QuickBooks general ledger report for the first quarter of 2026 and summarize what accounts or transaction groups appear in the response.
```

Expected tool behavior:

- Calls `run-report`.
- Uses `{"report":"GeneralLedger","startDate":"2026-01-01","endDate":"2026-03-31"}`.
- Handles larger/detail report output by summarizing instead of dumping raw rows.

### Journal Entry Read-Only Check

Prompt:

```text
Read up to 10 QuickBooks journal entries and identify whether each one is balanced. Show debit total, credit total, and any entry where the totals differ.
```

Expected tool behavior:

- Calls `list-journal-entries`.
- Uses output fields `debitTotal`, `creditTotal`, and `isBalanced`.
- Does not attempt to create or modify journal entries.

## Failure Triage

| Symptom | Likely Cause | What To Check |
| --- | --- | --- |
| `QuickBooks realmId missing` | Connection does not have QuickBooks company ID in Nango connection config | Reauthenticate the QuickBooks connection in Nango |
| 401 or auth refresh errors | QuickBooks OAuth connection expired or missing scopes | Reconnect with `com.intuit.quickbooks.accounting` |
| Empty arrays | Sandbox company has sparse data or filters are too narrow | Retry with only `{"maxResults":5}` |
| Report validation error | Date range is invalid or longer than 186 days | Use a valid range within six months |
| QuickBooks query parse error | Filter value contains unexpected characters or unsupported field filter | Retry with fewer filters, then inspect Nango logs |
| Action output exceeds size limit | Report or query response is too large | Narrow date range, lower `maxResults`, or use a more specific report |
