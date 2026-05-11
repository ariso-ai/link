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
        customerId: z.string().optional().describe('Filter sales receipts by QuickBooks CustomerRef value.'),
        updatedSince: isoDateTimeSchema.optional().describe('Filter by MetaData.LastUpdatedTime greater than this ISO timestamp.'),
        startDate: isoDateSchema.optional().describe('Filter by TxnDate on or after YYYY-MM-DD.'),
        endDate: isoDateSchema.optional().describe('Filter by TxnDate on or before YYYY-MM-DD.'),
    })
    .refine(({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate, {
        message: 'startDate must be on or before endDate.',
    });

const salesReceiptSchema = z.object({
    id: z.string(),
    docNumber: z.string(),
    txnDate: z.string(),
    customer: refSchema,
    totalAmount: z.number(),
    balance: z.number(),
    depositToAccount: refSchema,
    paymentMethod: refSchema,
    metadata: metadataSchema,
});

const outputSchema = z.object({
    salesReceipts: z.array(salesReceiptSchema),
    startPosition: z.number(),
    maxResults: z.number(),
    totalCount: z.number(),
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
        const maxResults = input.maxResults ?? 50;
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
            buildQuery('SalesReceipt', clauses, startPosition, maxResults),
            { startPosition, maxResults }
        );

        return {
            salesReceipts: result.records.map((receipt) => ({
                id: receipt.Id,
                docNumber: receipt.DocNumber ?? '',
                txnDate: receipt.TxnDate ?? '',
                customer: refToObject(receipt.CustomerRef),
                totalAmount: receipt.TotalAmt ?? 0,
                balance: receipt.Balance ?? 0,
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
