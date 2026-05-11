import * as z from 'zod';

export const paginationInputShape = {
    maxResults: z.coerce.number().int().min(1).max(100).optional().describe('Maximum number of records to return (default 50, max 100)'),
    startPosition: z.coerce.number().int().min(1).optional().describe('1-based QuickBooks query start position (default 1)'),
};

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const isoDateTimePattern = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isIsoCalendarDate(value: string): boolean {
    if (!isoDatePattern.test(value)) return false;

    const parts = value.split('-').map(Number);
    if (parts.length !== 3) return false;

    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    if (year === undefined || month === undefined || day === undefined) return false;

    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const isoDateSchema = z
    .string()
    .regex(isoDatePattern, 'Date must use YYYY-MM-DD format.')
    .refine(isIsoCalendarDate, 'Date must be a valid calendar date.');

export const isoDateTimeSchema = z.string().refine((value) => {
    const match = isoDateTimePattern.exec(value);
    const datePart = match?.[1];
    return !!datePart && isIsoCalendarDate(datePart) && !Number.isNaN(Date.parse(value));
}, 'Datetime must be a valid ISO timestamp with Z or +/-HH:MM offset.');

export const refSchema = z.object({
    id: z.string(),
    name: z.string(),
});

export const metadataSchema = z.object({
    createTime: z.string(),
    lastUpdatedTime: z.string(),
});

export const moneySchema = z.number();
