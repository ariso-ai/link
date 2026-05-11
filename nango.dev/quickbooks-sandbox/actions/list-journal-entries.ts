import { createAction } from 'nango';
import * as z from 'zod';
import {
    buildQuery,
    escapeQuickBooksString,
    getCompanyId,
    metadataToObject,
    queryQuickBooks,
    refToObject,
} from '../../quickbooks/helpers/quickbooks.js';
import { isoDateSchema, isoDateTimeSchema, metadataSchema, paginationInputShape, refSchema } from '../../quickbooks/helpers/schemas.js';

const inputSchema = z
    .object({
        ...paginationInputShape,
        updatedSince: isoDateTimeSchema.optional().describe('Filter by MetaData.LastUpdatedTime greater than this ISO timestamp.'),
        startDate: isoDateSchema.optional().describe('Filter by TxnDate on or after YYYY-MM-DD.'),
        endDate: isoDateSchema.optional().describe('Filter by TxnDate on or before YYYY-MM-DD.'),
    })
    .refine(({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate, {
        message: 'startDate must be on or before endDate.',
    });

const journalLineSchema = z.object({
    id: z.string(),
    description: z.string(),
    amount: z.number(),
    postingType: z.string(),
    account: refSchema,
    entity: refSchema,
});

const journalEntrySchema = z.object({
    id: z.string(),
    txnDate: z.string(),
    privateNote: z.string(),
    currency: refSchema,
    exchangeRate: z.number(),
    debitTotal: z.number(),
    creditTotal: z.number(),
    isBalanced: z.boolean(),
    lines: z.array(journalLineSchema),
    metadata: metadataSchema,
});

const outputSchema = z.object({
    journalEntries: z.array(journalEntrySchema),
    startPosition: z.number(),
    maxResults: z.number(),
    totalCount: z.number(),
});

interface QuickBooksJournalLine {
    Id?: string;
    Description?: string;
    Amount?: number;
    DetailType?: string;
    JournalEntryLineDetail?: {
        PostingType?: string;
        AccountRef?: { value?: string; name?: string };
        Entity?: {
            EntityRef?: { value?: string; name?: string };
        };
    };
}

interface QuickBooksJournalEntry {
    Id: string;
    TxnDate?: string;
    PrivateNote?: string;
    CurrencyRef?: { value?: string; name?: string };
    ExchangeRate?: number;
    Line?: QuickBooksJournalLine[];
    MetaData?: { CreateTime?: string; LastUpdatedTime?: string };
}

function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

const action = createAction({
    description: 'List QuickBooks journal entries and return debit/credit totals for read-only agent interpretation',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/quickbooks/journal-entries', group: 'QuickBooks' },
    scopes: ['com.intuit.quickbooks.accounting'],
    input: inputSchema,
    output: outputSchema,

    exec: async (nango, input) => {
        const companyId = await getCompanyId(nango);
        const maxResults = input.maxResults ?? 50;
        const startPosition = input.startPosition ?? 1;
        const clauses: string[] = [];

        if (input.updatedSince) clauses.push(`MetaData.LastUpdatedTime > '${escapeQuickBooksString(input.updatedSince)}'`);
        if (input.startDate) clauses.push(`TxnDate >= '${escapeQuickBooksString(input.startDate)}'`);
        if (input.endDate) clauses.push(`TxnDate <= '${escapeQuickBooksString(input.endDate)}'`);

        const result = await queryQuickBooks<QuickBooksJournalEntry>(
            nango,
            companyId,
            'JournalEntry',
            buildQuery('JournalEntry', clauses, startPosition, maxResults),
            { startPosition, maxResults }
        );

        return {
            journalEntries: result.records.map((entry) => {
                const lines = (entry.Line ?? []).map((line) => {
                    const detail = line.JournalEntryLineDetail;
                    return {
                        id: line.Id ?? '',
                        description: line.Description ?? '',
                        amount: line.Amount ?? 0,
                        postingType: detail?.PostingType ?? '',
                        account: refToObject(detail?.AccountRef),
                        entity: refToObject(detail?.Entity?.EntityRef),
                    };
                });
                const debitTotal = roundMoney(
                    lines
                        .filter((line) => line.postingType === 'Debit')
                        .reduce((sum, line) => sum + (line.amount ?? 0), 0)
                );
                const creditTotal = roundMoney(
                    lines
                        .filter((line) => line.postingType === 'Credit')
                        .reduce((sum, line) => sum + (line.amount ?? 0), 0)
                );

                return {
                    id: entry.Id,
                    txnDate: entry.TxnDate ?? '',
                    privateNote: entry.PrivateNote ?? '',
                    currency: refToObject(entry.CurrencyRef),
                    exchangeRate: entry.ExchangeRate ?? 1,
                    debitTotal,
                    creditTotal,
                    isBalanced: Math.abs(debitTotal - creditTotal) < 0.005,
                    lines,
                    metadata: metadataToObject(entry.MetaData),
                };
            }),
            startPosition: result.startPosition,
            maxResults: result.maxResults,
            totalCount: result.totalCount,
        };
    },
});

export default action;
