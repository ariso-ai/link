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
    customerId: z.string().optional().describe('Filter payments by QuickBooks CustomerRef value.'),
    updatedSince: z.string().optional().describe('Filter by MetaData.LastUpdatedTime greater than this ISO timestamp.'),
    startDate: z.string().optional().describe('Filter by TxnDate on or after YYYY-MM-DD.'),
    endDate: z.string().optional().describe('Filter by TxnDate on or before YYYY-MM-DD.'),
});

const paymentSchema = z.object({
    id: z.string(),
    txnDate: z.string().nullable(),
    customer: refSchema,
    totalAmount: z.number().nullable(),
    unappliedAmount: z.number().nullable(),
    depositToAccount: refSchema,
    paymentMethod: refSchema,
    metadata: metadataSchema,
});

const outputSchema = z.object({
    payments: z.array(paymentSchema),
    startPosition: z.number(),
    maxResults: z.number(),
    totalCount: z.number().nullable(),
});

interface QuickBooksPayment {
    Id: string;
    TxnDate?: string;
    CustomerRef?: { value?: string; name?: string };
    TotalAmt?: number;
    UnappliedAmt?: number;
    DepositToAccountRef?: { value?: string; name?: string };
    PaymentMethodRef?: { value?: string; name?: string };
    MetaData?: { CreateTime?: string; LastUpdatedTime?: string };
}

const action = createAction({
    description: 'List QuickBooks payments received against invoices',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/quickbooks/payments', group: 'QuickBooks' },
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

        const result = await queryQuickBooks<QuickBooksPayment>(
            nango,
            companyId,
            'Payment',
            buildQuery('Payment', clauses, startPosition, maxResults)
        );

        return {
            payments: result.records.map((payment) => ({
                id: payment.Id,
                txnDate: payment.TxnDate ?? null,
                customer: refToObject(payment.CustomerRef),
                totalAmount: payment.TotalAmt ?? null,
                unappliedAmount: payment.UnappliedAmt ?? null,
                depositToAccount: refToObject(payment.DepositToAccountRef),
                paymentMethod: refToObject(payment.PaymentMethodRef),
                metadata: metadataToObject(payment.MetaData),
            })),
            startPosition: result.startPosition,
            maxResults: result.maxResults,
            totalCount: result.totalCount,
        };
    },
});

export default action;

