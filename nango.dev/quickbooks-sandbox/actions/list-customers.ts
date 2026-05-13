import { createAction } from 'nango';
import {
    execListCustomers,
    listCustomersInputSchema,
    listCustomersOutputSchema,
} from '../../quickbooks/actions/list-customers-shared.js';

const action = createAction({
    description: 'List QuickBooks customers with optional active, display name, and updated-since filters',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/quickbooks/customers', group: 'QuickBooks' },
    scopes: ['com.intuit.quickbooks.accounting'],
    input: listCustomersInputSchema,
    output: listCustomersOutputSchema,
    exec: execListCustomers,
});

export default action;
