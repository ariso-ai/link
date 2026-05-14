import { createAction } from 'nango';
import {
    execListSalesReceipts,
    listSalesReceiptsInputSchema,
    listSalesReceiptsOutputSchema,
} from './list-sales-receipts-shared.js';

const action = createAction({
    description: 'List QuickBooks sales receipts for immediately-paid sales',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/quickbooks/sales-receipts', group: 'QuickBooks' },
    scopes: ['com.intuit.quickbooks.accounting'],
    input: listSalesReceiptsInputSchema,
    output: listSalesReceiptsOutputSchema,
    exec: execListSalesReceipts,
});

export default action;
