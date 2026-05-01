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
    customerId: z.string().optional().describe('Filter sales receipts by QuickBooks CustomerRef value.'),
    updatedSince: z.string().optional().describe('Filter by MetaData.LastUpdatedTime greater than this ISO timestamp.'),
    startDate: z.string().optional().describe('Filter by TxnDate on or after YYYY-MM-DD.'),
    endDate: z.string().optional().describe('Filter by TxnDate on or before YYYY-MM-DD.'),
});

const salesReceiptSchema = z.object({
    id: z.string(),
    docNumber: z.string().nullable(),
    txnDate: z.string().nullable(),
    customer: refSchema,
    totalAmount: z.number().nullable(),
    balance: z.number().nullable(),
    depositToAccount: refSchema,
    paymentMethod: refSchema,
    metadata: metadataSchema,
});

const outputSchema = z.object({
    salesReceipts: z.array(salesReceiptSchema),
    startPosition: z.number(),
    maxResults: z.number(),
    totalCount: z.number().nullable(),
});

interface QuickBooksSalesReceipt {
    Id: string;
    DocNumber?: string;
    TxnDate?: string;
    CustomerRef?: { value?: string; name?: string };
    TotalAmt?: number;
    Balance?: number;
    DepositToAccountRef?: { value?: string; name?: string };
    PaymentMethodRef?: { value?: string; name?: string };
    MetaData?: { CreateTime?: string; LastUpdatedTime?: string };
}

const action = createAction({
    description: 'List QuickBooks sales receipts for immediately-paid sales',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/quickbooks/sales-receipts', group: 'QuickBooks' },
    scopes: ['com.intuit.quickbooks.accounting'],
    input: inputSchema,
    output: outputSchema,

    exec: async (nango, input) => {
        const companyId = await getCompanyId(nango);
        const maxResults = clampQuickBooksLimit(input.maxResults);
        const startPosition = input.startPosition ?? 1;
        const clauses: string[] = [];

        if (input.customerId) clauses.push(`CustomerRef = '${escapeQuickBooksString(input.customerId)}'`);
        if (input.updatedSince) clauses.push(`MetaData.LastUpdatedTime > '${escapeQuickBooksString(input.updatedSince)}'`);
        if (input.startDate) clauses.push(`TxnDate >= '${escapeQuickBooksString(input.startDate)}'`);
        if (input.endDate) clauses.push(`TxnDate <= '${escapeQuickBooksString(input.endDate)}'`);

        const result = await queryQuickBooks<QuickBooksSalesReceipt>(
            nango,
            companyId,
            'SalesReceipt',
            buildQuery('SalesReceipt', clauses, startPosition, maxResults)
        );

        return {
            salesReceipts: result.records.map((receipt) => ({
                id: receipt.Id,
                docNumber: receipt.DocNumber ?? null,
                txnDate: receipt.TxnDate ?? null,
                customer: refToObject(receipt.CustomerRef),
                totalAmount: receipt.TotalAmt ?? null,
                balance: receipt.Balance ?? null,
                depositToAccount: refToObject(receipt.DepositToAccountRef),
                paymentMethod: refToObject(receipt.PaymentMethodRef),
                metadata: metadataToObject(receipt.MetaData),
            })),
            startPosition: result.startPosition,
            maxResults: result.maxResults,
            totalCount: result.totalCount,
        };
    },
});

export default action;

