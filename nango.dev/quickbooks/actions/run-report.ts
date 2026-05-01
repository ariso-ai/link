import { createAction } from 'nango';
import * as z from 'zod';
import { getCompanyId } from '../helpers/quickbooks.js';

const reportSchema = z.enum([
    'ProfitAndLoss',
    'BalanceSheet',
    'CashFlow',
    'TrialBalance',
    'GeneralLedger',
    'CustomerSales',
    'CustomerIncome',
    'AgedReceivables',
    'AgedPayables',
]);

const inputSchema = z
    .object({
        report: reportSchema.describe('QuickBooks report endpoint to run.'),
        startDate: z.string().optional().describe('Report start date in YYYY-MM-DD format.'),
        endDate: z.string().optional().describe('Report end date in YYYY-MM-DD format.'),
        accountingMethod: z.enum(['Cash', 'Accrual']).optional().describe('QuickBooks accounting method for the report.'),
        summarizeColumnBy: z.string().optional().describe('Optional QuickBooks summarize_column_by parameter.'),
        customerId: z.string().optional().describe('Optional customer filter where supported by the report.'),
    })
    .refine(
        (input) => {
            if (!input.startDate || !input.endDate) return true;
            const start = Date.parse(`${input.startDate}T00:00:00Z`);
            const end = Date.parse(`${input.endDate}T00:00:00Z`);
            if (Number.isNaN(start) || Number.isNaN(end) || end < start) return false;
            const days = (end - start) / 86_400_000;
            return days <= 186;
        },
        { message: 'Report date range must be valid and no longer than 186 days.' }
    );

const outputSchema = z.object({
    reportName: z.string().nullable(),
    startPeriod: z.string().nullable(),
    endPeriod: z.string().nullable(),
    currency: z.string().nullable(),
    columns: z.array(z.unknown()),
    rows: z.array(z.unknown()),
    raw: z.unknown(),
});

interface QuickBooksReportResponse {
    Header?: {
        ReportName?: string;
        StartPeriod?: string;
        EndPeriod?: string;
        Currency?: string;
    };
    Columns?: {
        Column?: unknown[];
    };
    Rows?: {
        Row?: unknown[];
    };
}

const action = createAction({
    description: 'Run an allowlisted QuickBooks report with optional date, accounting-method, customer, and summarize-column filters',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/quickbooks/report', group: 'QuickBooks' },
    scopes: ['com.intuit.quickbooks.accounting'],
    input: inputSchema,
    output: outputSchema,

    exec: async (nango, input) => {
        const companyId = await getCompanyId(nango);
        const params: Record<string, string> = {};

        if (input.startDate) params['start_date'] = input.startDate;
        if (input.endDate) params['end_date'] = input.endDate;
        if (input.accountingMethod) params['accounting_method'] = input.accountingMethod;
        if (input.summarizeColumnBy) params['summarize_column_by'] = input.summarizeColumnBy;
        if (input.customerId) params['customer'] = input.customerId;

        const response = await nango.get<QuickBooksReportResponse>({
            endpoint: `/v3/company/${companyId}/reports/${input.report}`,
            params,
            retries: 3,
        });

        return {
            reportName: response.data.Header?.ReportName ?? null,
            startPeriod: response.data.Header?.StartPeriod ?? null,
            endPeriod: response.data.Header?.EndPeriod ?? null,
            currency: response.data.Header?.Currency ?? null,
            columns: response.data.Columns?.Column ?? [],
            rows: response.data.Rows?.Row ?? [],
            raw: response.data,
        };
    },
});

export default action;

