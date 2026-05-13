import type { NangoAction } from 'nango';
import * as z from 'zod';
import {
    buildQuery,
    escapeQuickBooksString,
    getCompanyId,
    metadataToObject,
    queryQuickBooks,
    refToObject,
} from '../helpers/quickbooks.js';
import { isoDateTimeSchema, metadataSchema, paginationInputShape, refSchema } from '../helpers/schemas.js';

export const listCustomersInputSchema = z.object({
    ...paginationInputShape,
    active: z.boolean().optional().describe('Filter active/inactive customers. Omit to return both.'),
    updatedSince: isoDateTimeSchema.optional().describe('Filter by MetaData.LastUpdatedTime greater than this ISO timestamp.'),
    displayName: z.string().optional().describe('Exact customer DisplayName match.'),
});

const customerSchema = z.object({
    id: z.string(),
    displayName: z.string(),
    active: z.boolean(),
    companyName: z.string(),
    givenName: z.string(),
    familyName: z.string(),
    primaryEmail: z.string(),
    primaryPhone: z.string(),
    balance: z.number(),
    currency: refSchema,
    metadata: metadataSchema,
});

export const listCustomersOutputSchema = z.object({
    customers: z.array(customerSchema),
    startPosition: z.number(),
    maxResults: z.number(),
    totalCount: z.number(),
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

export async function execListCustomers(
    nango: NangoAction,
    input: z.infer<typeof listCustomersInputSchema>
): Promise<z.infer<typeof listCustomersOutputSchema>> {
    const companyId = await getCompanyId(nango);
    const maxResults = input.maxResults ?? 50;
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
        buildQuery('Customer', clauses, startPosition, maxResults),
        { startPosition, maxResults }
    );

    return {
        customers: result.records.map((customer) => ({
            id: customer.Id,
            displayName: customer.DisplayName ?? '',
            active: customer.Active ?? false,
            companyName: customer.CompanyName ?? '',
            givenName: customer.GivenName ?? '',
            familyName: customer.FamilyName ?? '',
            primaryEmail: customer.PrimaryEmailAddr?.Address ?? '',
            primaryPhone: customer.PrimaryPhone?.FreeFormNumber ?? '',
            balance: customer.Balance ?? 0,
            currency: refToObject(customer.CurrencyRef),
            metadata: metadataToObject(customer.MetaData),
        })),
        startPosition: result.startPosition,
        maxResults: result.maxResults,
        totalCount: result.totalCount,
    };
}
