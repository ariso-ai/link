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
        customerId: z.string().optional().describe('Filter invoices by QuickBooks CustomerRef value.'),
        status: z.enum(['open', 'paid']).optional().describe('Filter invoices by open balance or paid balance.'),
        updatedSince: isoDateTimeSchema.optional().describe('Filter by MetaData.LastUpdatedTime greater than this ISO timestamp.'),
        startDate: isoDateSchema.optional().describe('Filter by TxnDate on or after YYYY-MM-DD.'),
        endDate: isoDateSchema.optional().describe('Filter by TxnDate on or before YYYY-MM-DD.'),
    })
    .refine(({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate, {
        message: 'startDate must be on or before endDate.',
    });

const invoiceSchema = z.object({
    id: z.string(),
    docNumber: z.string(),
    txnDate: z.string(),
    dueDate: z.string(),
    customer: refSchema,
    totalAmount: z.number(),
    balance: z.number(),
    currency: refSchema,
    emailStatus: z.string(),
    metadata: metadataSchema,
});

const outputSchema = z.object({
    invoices: z.array(invoiceSchema),
    startPosition: z.number(),
    maxResults: z.number(),
    totalCount: z.number(),
});

interface QuickBooksInvoice {
    Id: string;
    DocNumber?: string;
    TxnDate?: string;
    DueDate?: string;
    CustomerRef?: { value?: string; name?: string };
    TotalAmt?: number;
    Balance?: number;
    CurrencyRef?: { value?: string; name?: string };
    EmailStatus?: string;
    MetaData?: { CreateTime?: string; LastUpdatedTime?: string };
}

const action = createAction({
    description: 'List QuickBooks invoices with optional customer, status, date, and updated-since filters',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/quickbooks/invoices', group: 'QuickBooks' },
    scopes: ['com.intuit.quickbooks.accounting'],
    input: inputSchema,
    output: outputSchema,

    exec: async (nango, input) => {
        const companyId = await getCompanyId(nango);
        const maxResults = input.maxResults ?? 50;
        const startPosition = input.startPosition ?? 1;
        const clauses: string[] = [];

        if (input.customerId) clauses.push(`CustomerRef = '${escapeQuickBooksString(input.customerId)}'`);
        if (input.status === 'open') clauses.push('Balance > 0');
        if (input.status === 'paid') clauses.push('Balance = 0');
        if (input.updatedSince) clauses.push(`MetaData.LastUpdatedTime > '${escapeQuickBooksString(input.updatedSince)}'`);
        if (input.startDate) clauses.push(`TxnDate >= '${escapeQuickBooksString(input.startDate)}'`);
        if (input.endDate) clauses.push(`TxnDate <= '${escapeQuickBooksString(input.endDate)}'`);

        const result = await queryQuickBooks<QuickBooksInvoice>(
            nango,
            companyId,
            'Invoice',
            buildQuery('Invoice', clauses, startPosition, maxResults),
            { startPosition, maxResults }
        );

        return {
            invoices: result.records.map((invoice) => ({
                id: invoice.Id,
                docNumber: invoice.DocNumber ?? '',
                txnDate: invoice.TxnDate ?? '',
                dueDate: invoice.DueDate ?? '',
                customer: refToObject(invoice.CustomerRef),
                totalAmount: invoice.TotalAmt ?? 0,
                balance: invoice.Balance ?? 0,
                currency: refToObject(invoice.CurrencyRef),
                emailStatus: invoice.EmailStatus ?? '',
                metadata: metadataToObject(invoice.MetaData),
            })),
            startPosition: result.startPosition,
            maxResults: result.maxResults,
            totalCount: result.totalCount,
        };
    },
});

export default action;
