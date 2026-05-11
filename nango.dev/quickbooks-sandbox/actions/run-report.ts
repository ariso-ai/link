import * as z from 'zod';
import { createAction } from 'nango';
import type { NangoAction } from 'nango';
import { getCompanyId } from '../../quickbooks/helpers/quickbooks.js';
import { isoDateSchema } from '../../quickbooks/helpers/schemas.js';

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

const summarizeColumnBySchema = z.enum([
    'Days',
    'Weeks',
    'Months',
    'Quarters',
    'Years',
    'Customers',
    'Vendors',
    'Classes',
    'Departments',
    'Employees',
    'ProductsAndServices',
]);

const inputSchema = z
    .object({
        report: reportSchema.describe('QuickBooks report endpoint to run.'),
        startDate: isoDateSchema.describe('Report start date in YYYY-MM-DD format.'),
        endDate: isoDateSchema.describe('Report end date in YYYY-MM-DD format.'),
        accountingMethod: z.enum(['Cash', 'Accrual']).optional().describe('QuickBooks accounting method for the report.'),
        summarizeColumnBy: summarizeColumnBySchema.optional().describe('Optional QuickBooks summarize_column_by parameter.'),
        customerId: z.string().optional().describe('Optional customer filter where supported by the report.'),
    })
    .refine(
        (input) => {
            const start = new Date(`${input.startDate}T00:00:00Z`).getTime();
            const end = new Date(`${input.endDate}T00:00:00Z`).getTime();
            if (end < start) return false;
            const days = (end - start) / 86_400_000;
            return days <= 186;
        },
        { message: 'Report date range must be on or after startDate and no longer than 186 days.' }
    );

const outputSchema = z.object({
    reportName: z.string(),
    startPeriod: z.string(),
    endPeriod: z.string(),
    currency: z.string(),
    columns: z.array(z.unknown()),
    rows: z.array(z.unknown()),
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
    endpoint: { method: 'GET' as const, path: '/quickbooks/report', group: 'QuickBooks' },
    scopes: ['com.intuit.quickbooks.accounting'],
    input: inputSchema,
    output: outputSchema,

    exec: async (nango: NangoAction, input: z.infer<typeof inputSchema>) => {
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
            reportName: response.data.Header?.ReportName ?? '',
            startPeriod: response.data.Header?.StartPeriod ?? '',
            endPeriod: response.data.Header?.EndPeriod ?? '',
            currency: response.data.Header?.Currency ?? '',
            columns: response.data.Columns?.Column ?? [],
            rows: response.data.Rows?.Row ?? [],
        };
    },
});

export default action;
