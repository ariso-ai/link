import { createAction } from 'nango';
import {
    execListPayments,
    listPaymentsInputSchema,
    listPaymentsOutputSchema,
} from '../../quickbooks/actions/list-payments-shared.js';

const action = createAction({
    description: 'List QuickBooks payments received against invoices',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/quickbooks/payments', group: 'QuickBooks' },
    scopes: ['com.intuit.quickbooks.accounting'],
    input: listPaymentsInputSchema,
    output: listPaymentsOutputSchema,
    exec: execListPayments,
});

export default action;
