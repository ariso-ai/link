import { createAction } from 'nango';
import {
    execListJournalEntries,
    listJournalEntriesInputSchema,
    listJournalEntriesOutputSchema,
} from './list-journal-entries-shared.js';

const action = createAction({
    description: 'List QuickBooks journal entries and return debit/credit totals for read-only agent interpretation',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/quickbooks/journal-entries', group: 'QuickBooks' },
    scopes: ['com.intuit.quickbooks.accounting'],
    input: listJournalEntriesInputSchema,
    output: listJournalEntriesOutputSchema,
    exec: execListJournalEntries,
});

export default action;
