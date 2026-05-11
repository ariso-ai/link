import * as z from 'zod';

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

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
