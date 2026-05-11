import { createAction } from 'nango';
import {
    execListInvoices,
    listInvoicesInputSchema,
    listInvoicesOutputSchema,
} from '../../quickbooks/actions/list-invoices-shared.js';

const action = createAction({
    description: 'List QuickBooks invoices with optional customer, status, date, and updated-since filters',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/quickbooks/invoices', group: 'QuickBooks' },
    scopes: ['com.intuit.quickbooks.accounting'],
    input: listInvoicesInputSchema,
    output: listInvoicesOutputSchema,
    exec: execListInvoices,
});

export default action;
