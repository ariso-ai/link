import type { NangoAction } from 'nango';
import * as z from 'zod';
import { getCompanyId } from '../helpers/quickbooks.js';

const inputSchema = z.object({
    query: z.string().min(1).describe('SQL-like query string to execute against QuickBooks. Example: "SELECT * FROM Customer"'),
    start_position: z.coerce.number().int().min(1).optional().describe('Starting position for pagination. Default: 1'),
    max_results: z.coerce
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe('Maximum number of results to return per page. Default: 100'),
});

const queryResponseSchema = z
    .object({
        maxResults: z.number().optional(),
        startPosition: z.number().optional(),
        totalCount: z.number().optional(),
        Customer: z.array(z.unknown()).optional(),
        Invoice: z.array(z.unknown()).optional(),
        Account: z.array(z.unknown()).optional(),
        Vendor: z.array(z.unknown()).optional(),
        Item: z.array(z.unknown()).optional(),
        Bill: z.array(z.unknown()).optional(),
        Payment: z.array(z.unknown()).optional(),
        Estimate: z.array(z.unknown()).optional(),
        CreditMemo: z.array(z.unknown()).optional(),
        Deposit: z.array(z.unknown()).optional(),
        JournalEntry: z.array(z.unknown()).optional(),
        PurchaseOrder: z.array(z.unknown()).optional(),
        SalesReceipt: z.array(z.unknown()).optional(),
        Purchase: z.array(z.unknown()).optional(),
        Transfer: z.array(z.unknown()).optional(),
        BillPayment: z.array(z.unknown()).optional(),
        TaxAgency: z.array(z.unknown()).optional(),
        TaxCode: z.array(z.unknown()).optional(),
        TaxRate: z.array(z.unknown()).optional(),
        PaymentMethod: z.array(z.unknown()).optional(),
        Term: z.array(z.unknown()).optional(),
        Department: z.array(z.unknown()).optional(),
        Employee: z.array(z.unknown()).optional(),
        TimeActivity: z.array(z.unknown()).optional(),
        Attachable: z.array(z.unknown()).optional(),
        RefundReceipt: z.array(z.unknown()).optional(),
    })
    .passthrough();

const responseSchema = z.object({
    QueryResponse: queryResponseSchema.optional(),
});

export const queryEntitiesOutputSchema = z.object({
    records: z.array(z.unknown()).describe('Query results as an array of entity objects'),
    total_count: z.number().optional().describe('Total count of records matching the query'),
    start_position: z.number().optional().describe('Starting position of this result set'),
    max_results: z.number().optional().describe('Maximum results in this response'),
    has_more: z.boolean().describe('Whether more results are available'),
});

export const queryEntitiesInputSchema = inputSchema;

const entityKeys = [
    'Customer',
    'Invoice',
    'Account',
    'Vendor',
    'Item',
    'Bill',
    'Payment',
    'Estimate',
    'CreditMemo',
    'Deposit',
    'JournalEntry',
    'PurchaseOrder',
    'SalesReceipt',
    'Purchase',
    'Transfer',
    'BillPayment',
    'TaxAgency',
    'TaxCode',
    'TaxRate',
    'PaymentMethod',
    'Term',
    'Department',
    'Employee',
    'TimeActivity',
    'Attachable',
    'RefundReceipt',
];

function extractRecords(queryResponse: z.infer<typeof queryResponseSchema>): unknown[] {
    for (const [key, value] of Object.entries(queryResponse)) {
        if (entityKeys.includes(key) && Array.isArray(value)) {
            return value;
        }
    }

    return [];
}

function appendPagination(query: string, startPosition: number, maxResults: number): string {
    const withStart = /\\bSTARTPOSITION\\b/i.test(query) ? query : `${query} STARTPOSITION ${startPosition}`;
    return /\\bMAXRESULTS\\b/i.test(withStart) ? withStart : `${withStart} MAXRESULTS ${maxResults}`;
}

export async function execQueryEntities(
    nango: NangoAction,
    input: z.infer<typeof queryEntitiesInputSchema>
): Promise<z.infer<typeof queryEntitiesOutputSchema>> {
    const companyId = await getCompanyId(nango);
    const startPosition = input.start_position ?? 1;
    const maxResults = input.max_results ?? 100;
    const query = appendPagination(input.query, startPosition, maxResults);

    const response = await nango.get<z.infer<typeof responseSchema>>({
        endpoint: `/v3/company/${encodeURIComponent(companyId)}/query`,
        params: { query },
        retries: 3,
    });

    const parsed = responseSchema.parse(response.data);
    const queryResponse = parsed.QueryResponse ?? { maxResults: 0, startPosition: 1, totalCount: 0 };
    const records = extractRecords(queryResponse);
    const totalCount = queryResponse.totalCount ?? 0;
    const returnedMaxResults = queryResponse.maxResults ?? 0;
    const returnedStartPosition = queryResponse.startPosition ?? 1;
    const hasMore =
        totalCount > 0 ? returnedStartPosition + records.length - 1 < totalCount : records.length >= maxResults;

    return {
        records,
        total_count: totalCount,
        start_position: returnedStartPosition,
        max_results: returnedMaxResults,
        has_more: hasMore,
    };
}
