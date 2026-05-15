import { createAction } from 'nango';
import {
    createJournalEntryInputSchema,
    createJournalEntryOutputSchema,
    execCreateJournalEntry,
} from './create-journal-entry-shared.js';

const action = createAction({
    description: 'Create a balanced QuickBooks journal entry',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/quickbooks/journal-entries', group: 'QuickBooks' },
    scopes: ['com.intuit.quickbooks.accounting'],
    input: createJournalEntryInputSchema,
    output: createJournalEntryOutputSchema,
    exec: execCreateJournalEntry,
});

export default action;
