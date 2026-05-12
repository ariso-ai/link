import type { NangoAction } from 'nango';
import * as z from 'zod';
import { getCompanyId, metadataToObject, refToObject } from '../helpers/quickbooks.js';
import type { QuickBooksMetadata, QuickBooksRef } from '../helpers/quickbooks.js';
import { isoDateSchema, metadataSchema, refSchema } from '../helpers/schemas.js';

const inputRefSchema = z.object({
    id: z.string().min(1),
    name: z.string().optional(),
});

const journalEntitySchema = inputRefSchema.extend({
    type: z.enum(['Customer', 'Vendor', 'Employee']),
});

const journalLineInputSchema = z.object({
    postingType: z.enum(['Debit', 'Credit']).describe('Whether this line posts as a debit or a credit.'),
    amount: z.coerce.number().positive().describe('Positive amount for this line. Posting type controls debit or credit.'),
    accountId: z.string().min(1).describe('QuickBooks account Id for this line.'),
    accountName: z.string().optional().describe('Optional QuickBooks account name for readability.'),
    description: z.string().optional().describe('Optional line description.'),
    entity: journalEntitySchema.optional().describe('Optional Customer, Vendor, or Employee reference for the line.'),
    classRef: inputRefSchema.optional().describe('Optional QuickBooks class reference.'),
    departmentRef: inputRefSchema.optional().describe('Optional QuickBooks department/location reference.'),
});

export const createJournalEntryInputSchema = z
    .object({
        txnDate: isoDateSchema.describe('Journal entry transaction date in YYYY-MM-DD format.'),
        privateNote: z.string().optional().describe('Optional internal note for the journal entry.'),
        docNumber: z.string().max(21).optional().describe('Optional QuickBooks document number.'),
        currencyId: z.string().optional().describe('Optional QuickBooks currency Id, such as USD.'),
        exchangeRate: z.coerce.number().positive().optional().describe('Optional exchange rate for multi-currency companies.'),
        lines: z.array(journalLineInputSchema).min(2).max(100).describe('Balanced debit and credit journal entry lines.'),
    })
    .superRefine((input, ctx) => {
        const debitCents = totalCents(input.lines, 'Debit');
        const creditCents = totalCents(input.lines, 'Credit');

        if (debitCents === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['lines'],
                message: 'Journal entry must include at least one debit line.',
            });
        }

        if (creditCents === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['lines'],
                message: 'Journal entry must include at least one credit line.',
            });
        }

        if (debitCents !== creditCents) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['lines'],
                message: `Journal entry must balance: debits ${formatCents(debitCents)} do not equal credits ${formatCents(creditCents)}.`,
            });
        }
    });

const journalLineSchema = z.object({
    id: z.string(),
    description: z.string(),
    amount: z.number(),
    postingType: z.string(),
    account: refSchema,
    entity: refSchema,
    classRef: refSchema,
    departmentRef: refSchema,
});

export const createJournalEntryOutputSchema = z.object({
    id: z.string(),
    syncToken: z.string(),
    txnDate: z.string(),
    privateNote: z.string(),
    docNumber: z.string(),
    currency: refSchema,
    exchangeRate: z.number(),
    debitTotal: z.number(),
    creditTotal: z.number(),
    isBalanced: z.boolean(),
    lines: z.array(journalLineSchema),
    metadata: metadataSchema,
});

type CreateJournalLineInput = z.infer<typeof journalLineInputSchema>;
type CreateJournalEntryInput = z.infer<typeof createJournalEntryInputSchema>;

interface QuickBooksJournalLine {
    Id?: string;
    Description?: string;
    Amount?: number;
    DetailType?: string;
    JournalEntryLineDetail?: {
        PostingType?: string;
        AccountRef?: QuickBooksRef;
        Entity?: {
            Type?: string;
            EntityRef?: QuickBooksRef;
        };
        ClassRef?: QuickBooksRef;
        DepartmentRef?: QuickBooksRef;
    };
}

interface QuickBooksJournalEntry {
    Id: string;
    SyncToken?: string;
    TxnDate?: string;
    PrivateNote?: string;
    DocNumber?: string;
    CurrencyRef?: QuickBooksRef;
    ExchangeRate?: number;
    Line?: QuickBooksJournalLine[];
    MetaData?: QuickBooksMetadata;
}

interface QuickBooksFault {
    type?: string;
    Error?: QuickBooksFaultError | QuickBooksFaultError[];
}

interface QuickBooksFaultError {
    code?: string;
    element?: string;
    Message?: string;
    Detail?: string;
}

interface QuickBooksJournalEntryCreateResponse {
    JournalEntry?: QuickBooksJournalEntry;
    Fault?: QuickBooksFault;
}

function amountToCents(value: number): number {
    return Math.round(value * 100);
}

function formatCents(cents: number): string {
    return (cents / 100).toFixed(2);
}

function roundMoney(value: number): number {
    return amountToCents(value) / 100;
}

function amountsBalance(debitTotal: number, creditTotal: number): boolean {
    return Math.abs(debitTotal - creditTotal) < 0.005;
}

function totalCents(lines: CreateJournalLineInput[], postingType: 'Debit' | 'Credit'): number {
    return lines
        .filter((line) => line.postingType === postingType)
        .reduce((sum, line) => sum + amountToCents(line.amount), 0);
}

function toQuickBooksRef(ref: { id: string; name?: string | undefined }): QuickBooksRef {
    return {
        value: ref.id,
        ...(ref.name ? { name: ref.name } : {}),
    };
}

function buildQuickBooksLine(line: CreateJournalLineInput): QuickBooksJournalLine {
    return {
        DetailType: 'JournalEntryLineDetail',
        Amount: roundMoney(line.amount),
        ...(line.description ? { Description: line.description } : {}),
        JournalEntryLineDetail: {
            PostingType: line.postingType,
            AccountRef: toQuickBooksRef({ id: line.accountId, name: line.accountName }),
            ...(line.entity
                ? {
                      Entity: {
                          Type: line.entity.type,
                          EntityRef: toQuickBooksRef(line.entity),
                      },
                  }
                : {}),
            ...(line.classRef ? { ClassRef: toQuickBooksRef(line.classRef) } : {}),
            ...(line.departmentRef ? { DepartmentRef: toQuickBooksRef(line.departmentRef) } : {}),
        },
    };
}

function buildQuickBooksJournalEntry(input: CreateJournalEntryInput) {
    return {
        TxnDate: input.txnDate,
        Line: input.lines.map(buildQuickBooksLine),
        ...(input.privateNote ? { PrivateNote: input.privateNote } : {}),
        ...(input.docNumber ? { DocNumber: input.docNumber } : {}),
        ...(input.currencyId ? { CurrencyRef: { value: input.currencyId } } : {}),
        ...(input.exchangeRate ? { ExchangeRate: input.exchangeRate } : {}),
    };
}

function formatQuickBooksFault(fault: QuickBooksFault): string {
    const errors = Array.isArray(fault.Error) ? fault.Error : fault.Error ? [fault.Error] : [];
    const details = errors
        .map((error) => [error.code, error.element, error.Message, error.Detail].filter(Boolean).join(': '))
        .filter(Boolean);
    return [fault.type, ...details].filter(Boolean).join(' | ') || 'Unknown QuickBooks journal entry error';
}

function toOutput(entry: QuickBooksJournalEntry): z.infer<typeof createJournalEntryOutputSchema> {
    const lines = (entry.Line ?? []).map((line) => {
        const detail = line.JournalEntryLineDetail;
        return {
            id: line.Id ?? '',
            description: line.Description ?? '',
            amount: line.Amount ?? 0,
            postingType: detail?.PostingType ?? '',
            account: refToObject(detail?.AccountRef),
            entity: refToObject(detail?.Entity?.EntityRef),
            classRef: refToObject(detail?.ClassRef),
            departmentRef: refToObject(detail?.DepartmentRef),
        };
    });
    const debitTotal = roundMoney(
        lines.filter((line) => line.postingType === 'Debit').reduce((sum, line) => sum + line.amount, 0)
    );
    const creditTotal = roundMoney(
        lines.filter((line) => line.postingType === 'Credit').reduce((sum, line) => sum + line.amount, 0)
    );

    return {
        id: entry.Id,
        syncToken: entry.SyncToken ?? '',
        txnDate: entry.TxnDate ?? '',
        privateNote: entry.PrivateNote ?? '',
        docNumber: entry.DocNumber ?? '',
        currency: refToObject(entry.CurrencyRef),
        exchangeRate: entry.ExchangeRate ?? 1,
        debitTotal,
        creditTotal,
        isBalanced: amountsBalance(debitTotal, creditTotal),
        lines,
        metadata: metadataToObject(entry.MetaData),
    };
}

export async function execCreateJournalEntry(
    nango: NangoAction,
    input: CreateJournalEntryInput
): Promise<z.infer<typeof createJournalEntryOutputSchema>> {
    const companyId = await getCompanyId(nango);
    const response = await nango.proxy<QuickBooksJournalEntryCreateResponse>({
        method: 'POST',
        endpoint: `/v3/company/${companyId}/journalentry`,
        data: buildQuickBooksJournalEntry(input),
        retries: 3,
    });

    if (response.data.Fault) {
        throw new Error(`QuickBooks create journal entry failed: ${formatQuickBooksFault(response.data.Fault)}`);
    }

    if (!response.data.JournalEntry) {
        throw new Error('QuickBooks create journal entry response missing JournalEntry.');
    }

    return toOutput(response.data.JournalEntry);
}
