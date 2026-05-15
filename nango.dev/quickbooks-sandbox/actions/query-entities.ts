import { createAction } from 'nango';
import {
    execQueryEntities,
    queryEntitiesInputSchema,
    queryEntitiesOutputSchema,
} from '../../quickbooks/actions/query-entities-shared.js';

const action = createAction({
    description: 'Run a custom QuickBooks SQL-like query over supported entities',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/actions/query-entities', group: 'Query' },
    scopes: ['com.intuit.quickbooks.accounting'],
    input: queryEntitiesInputSchema,
    output: queryEntitiesOutputSchema,
    exec: execQueryEntities,
});

export default action;
