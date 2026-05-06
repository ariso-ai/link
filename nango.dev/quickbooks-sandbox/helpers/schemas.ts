import * as z from 'zod';

export const paginationInputSchema = {
    maxResults: z.number().int().min(1).max(100).optional().describe('Maximum number of records to return (default 50, max 100)'),
    startPosition: z.number().int().min(1).optional().describe('1-based QuickBooks query start position (default 1)'),
};

export const refSchema = z.object({
    id: z.string(),
    name: z.string(),
});

export const metadataSchema = z.object({
    createTime: z.string(),
    lastUpdatedTime: z.string(),
});

export const moneySchema = z.number();
