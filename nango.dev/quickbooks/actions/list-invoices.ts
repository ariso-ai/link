import { createAction } from 'nango';
import * as z from 'zod';
import {
    buildQuery,
    clampQuickBooksLimit,
    escapeQuickBooksString,
    getCompanyId,
    metadataToObject,
    queryQuickBooks,
    refToObject,
} from '../helpers/quickbooks.js';
import { metadataSchema, paginationInputSchema, refSchema } from '../helpers/schemas.js';

const inputSchema = z.object({
    ...paginationInputSchema,
    customerId: z.string().optional().describe('Filter invoices by QuickBooks CustomerRef value.'),
    status: z.enum(['open', 'paid']).optional().describe('Filter invoices by open balance or paid balance.'),
    updatedSince: z.string().optional().describe('Filter by MetaData.LastUpdatedTime greater than this ISO timestamp.'),
    startDate: z.string().optional().describe('Filter by TxnDate on or after YYYY-MM-DD.'),
    endDate: z.string().optional().describe('Filter by TxnDate on or before YYYY-MM-DD.'),
});

const invoiceSchema = z.object({
    id: z.string(),
    docNumber: z.string().nullable(),
    txnDate: z.string().nullable(),
    dueDate: z.string().nullable(),
    customer: refSchema,
    totalAmount: z.number().nullable(),
    balance: z.number().nullable(),
    currency: refSchema,
    emailStatus: z.string().nullable(),
    metadata: metadataSchema,
});

const outputSchema = z.object({
    invoices: z.array(invoiceSchema),
    startPosition: z.number(),
    maxResults: z.number(),
    totalCount: z.number().nullable(),
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
        const maxResults = clampQuickBooksLimit(input.maxResults);
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
            buildQuery('Invoice', clauses, startPosition, maxResults)
        );

        return {
            invoices: result.records.map((invoice) => ({
                id: invoice.Id,
                docNumber: invoice.DocNumber ?? null,
                txnDate: invoice.TxnDate ?? null,
                dueDate: invoice.DueDate ?? null,
                customer: refToObject(invoice.CustomerRef),
                totalAmount: invoice.TotalAmt ?? null,
                balance: invoice.Balance ?? null,
                currency: refToObject(invoice.CurrencyRef),
                emailStatus: invoice.EmailStatus ?? null,
                metadata: metadataToObject(invoice.MetaData),
            })),
            startPosition: result.startPosition,
            maxResults: result.maxResults,
            totalCount: result.totalCount,
        };
    },
});

export default action;

