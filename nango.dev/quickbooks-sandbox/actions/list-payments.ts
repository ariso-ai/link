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
        customerId: z.string().optional().describe('Filter payments by QuickBooks CustomerRef value.'),
        updatedSince: isoDateTimeSchema.optional().describe('Filter by MetaData.LastUpdatedTime greater than this ISO timestamp.'),
        startDate: isoDateSchema.optional().describe('Filter by TxnDate on or after YYYY-MM-DD.'),
        endDate: isoDateSchema.optional().describe('Filter by TxnDate on or before YYYY-MM-DD.'),
    })
    .refine(({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate, {
        message: 'startDate must be on or before endDate.',
    });

const paymentSchema = z.object({
    id: z.string(),
    txnDate: z.string(),
    customer: refSchema,
    totalAmount: z.number(),
    unappliedAmount: z.number(),
    depositToAccount: refSchema,
    paymentMethod: refSchema,
    metadata: metadataSchema,
});

const outputSchema = z.object({
    payments: z.array(paymentSchema),
    startPosition: z.number(),
    maxResults: z.number(),
    totalCount: z.number(),
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
        const maxResults = input.maxResults ?? 50;
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
            buildQuery('Payment', clauses, startPosition, maxResults),
            { startPosition, maxResults }
        );

        return {
            payments: result.records.map((payment) => ({
                id: payment.Id,
                txnDate: payment.TxnDate ?? '',
                customer: refToObject(payment.CustomerRef),
                totalAmount: payment.TotalAmt ?? 0,
                unappliedAmount: payment.UnappliedAmt ?? 0,
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
