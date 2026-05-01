import { createAction } from 'nango';
import * as z from 'zod';
import {
    buildQuery,
    clampQuickBooksLimit,
    escapeQuickBooksString,
    getCompanyId,
    metadataToObject,
    queryQuickBooks,
} from '../helpers/quickbooks.js';
import { metadataSchema, paginationInputSchema, refSchema } from '../helpers/schemas.js';

const inputSchema = z.object({
    ...paginationInputSchema,
    active: z.boolean().optional().describe('Filter active/inactive customers. Omit to return both.'),
    updatedSince: z.string().optional().describe('Filter by MetaData.LastUpdatedTime greater than this ISO timestamp.'),
    displayName: z.string().optional().describe('Exact customer DisplayName match.'),
});

const customerSchema = z.object({
    id: z.string(),
    displayName: z.string(),
    active: z.boolean().nullable(),
    companyName: z.string().nullable(),
    givenName: z.string().nullable(),
    familyName: z.string().nullable(),
    primaryEmail: z.string().nullable(),
    primaryPhone: z.string().nullable(),
    balance: z.number().nullable(),
    currency: refSchema,
    metadata: metadataSchema,
});

const outputSchema = z.object({
    customers: z.array(customerSchema),
    startPosition: z.number(),
    maxResults: z.number(),
    totalCount: z.number().nullable(),
});

interface QuickBooksCustomer {
    Id: string;
    DisplayName?: string;
    Active?: boolean;
    CompanyName?: string;
    GivenName?: string;
    FamilyName?: string;
    PrimaryEmailAddr?: { Address?: string };
    PrimaryPhone?: { FreeFormNumber?: string };
    Balance?: number;
    CurrencyRef?: { value?: string; name?: string };
    MetaData?: { CreateTime?: string; LastUpdatedTime?: string };
}

const action = createAction({
    description: 'List QuickBooks customers with optional active, display name, and updated-since filters',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/quickbooks/customers', group: 'QuickBooks' },
    scopes: ['com.intuit.quickbooks.accounting'],
    input: inputSchema,
    output: outputSchema,

    exec: async (nango, input) => {
        const companyId = await getCompanyId(nango);
        const maxResults = clampQuickBooksLimit(input.maxResults);
        const startPosition = input.startPosition ?? 1;
        const clauses: string[] = [];

        if (typeof input.active === 'boolean') {
            clauses.push(`Active = ${input.active ? 'true' : 'false'}`);
        }
        if (input.updatedSince) {
            clauses.push(`MetaData.LastUpdatedTime > '${escapeQuickBooksString(input.updatedSince)}'`);
        }
        if (input.displayName) {
            clauses.push(`DisplayName = '${escapeQuickBooksString(input.displayName)}'`);
        }

        const result = await queryQuickBooks<QuickBooksCustomer>(
            nango,
            companyId,
            'Customer',
            buildQuery('Customer', clauses, startPosition, maxResults)
        );

        return {
            customers: result.records.map((customer) => ({
                id: customer.Id,
                displayName: customer.DisplayName ?? '',
                active: customer.Active ?? null,
                companyName: customer.CompanyName ?? null,
                givenName: customer.GivenName ?? null,
                familyName: customer.FamilyName ?? null,
                primaryEmail: customer.PrimaryEmailAddr?.Address ?? null,
                primaryPhone: customer.PrimaryPhone?.FreeFormNumber ?? null,
                balance: customer.Balance ?? null,
                currency: {
                    id: customer.CurrencyRef?.value ?? null,
                    name: customer.CurrencyRef?.name ?? null,
                },
                metadata: metadataToObject(customer.MetaData),
            })),
            startPosition: result.startPosition,
            maxResults: result.maxResults,
            totalCount: result.totalCount,
        };
    },
});

export default action;

