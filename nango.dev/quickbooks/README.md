# QuickBooks

Custom [Nango](https://nango.dev) actions for QuickBooks Online accounting reads and reports.

These actions intentionally start with read/report operations. Existing Nango QuickBooks templates can still be reused for write workflows such as creating customers, invoices, payments, and journal entries when those become necessary.

## Actions

| Action | Method | Endpoint | Description | Scopes |
| --- | --- | --- | --- | --- |
| `list-customers` | `GET` | `/quickbooks/customers` | List basic QuickBooks customer records | `com.intuit.quickbooks.accounting` |
| `list-invoices` | `GET` | `/quickbooks/invoices` | List invoices with customer, status, date, and updated-since filters | `com.intuit.quickbooks.accounting` |
| `list-payments` | `GET` | `/quickbooks/payments` | List payments received against invoices | `com.intuit.quickbooks.accounting` |
| `list-sales-receipts` | `GET` | `/quickbooks/sales-receipts` | List sales receipts for immediately-paid sales | `com.intuit.quickbooks.accounting` |
| `list-journal-entries` | `GET` | `/quickbooks/journal-entries` | List journal entries with computed debit/credit totals | `com.intuit.quickbooks.accounting` |
| `run-report` | `GET` | `/quickbooks/report` | Run an allowlisted QuickBooks report | `com.intuit.quickbooks.accounting` |

## Notes

- QuickBooks requires the company ID, also called `realmId`, on every company API request. `helpers/quickbooks.ts` reads it from the Nango connection config.
- "Receipts" are exposed as both `Payment` and `SalesReceipt` because customers often use the term for both invoice payments and immediate paid sales.
- Journal entries are read-only in this first pass. The response includes `debitTotal`, `creditTotal`, and `isBalanced` so an agent can interpret the entry without creating or modifying accounting data.
- `run-report` allowlists common accounting reports and caps explicit date ranges at 186 days to avoid oversized report responses.

