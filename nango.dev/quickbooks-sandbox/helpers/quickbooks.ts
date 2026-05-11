import type { NangoAction } from 'nango';

export interface QuickBooksQueryResponse<T> {
    Fault?: QuickBooksFault;
    QueryResponse?: {
        startPosition?: number;
        maxResults?: number;
        totalCount?: number;
        Fault?: QuickBooksFault;
    } & Record<string, T[] | number | QuickBooksFault | undefined>;
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

export interface QuickBooksRef {
    value?: string;
    name?: string;
}

export interface QuickBooksMetadata {
    CreateTime?: string;
    LastUpdatedTime?: string;
}

export function escapeQuickBooksString(value: string): string {
    // QuickBooks Query Language uses backslash escaping for apostrophes.
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function getCompanyId(nango: NangoAction): Promise<string> {
    const connection = await nango.getConnection();
    const realmId = connection.connection_config?.['realmId'];

    if (typeof realmId === 'string' && realmId.length > 0) {
        return realmId;
    }

    throw new Error('QuickBooks realmId missing from Nango connection config. Reauthenticate the QuickBooks connection.');
}

export function refToObject(ref: QuickBooksRef | undefined | null): { id: string; name: string } {
    return {
        id: ref?.value ?? '',
        name: ref?.name ?? '',
    };
}

export function metadataToObject(
    metadata: QuickBooksMetadata | undefined | null
): { createTime: string; lastUpdatedTime: string } {
    return {
        createTime: metadata?.CreateTime ?? '',
        lastUpdatedTime: metadata?.LastUpdatedTime ?? '',
    };
}

export function buildQuery(entity: string, clauses: string[], startPosition: number, maxResults: number): string {
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
    return `SELECT * FROM ${entity}${where} STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
}

function formatQuickBooksFault(fault: QuickBooksFault): string {
    const errors = Array.isArray(fault.Error) ? fault.Error : fault.Error ? [fault.Error] : [];
    const details = errors
        .map((error) => [error.code, error.element, error.Message, error.Detail].filter(Boolean).join(': '))
        .filter(Boolean);
    return [fault.type, ...details].filter(Boolean).join(' | ') || 'Unknown QuickBooks query error';
}

export async function queryQuickBooks<T>(
    nango: NangoAction,
    companyId: string,
    entity: string,
    query: string,
    requestedPage: { startPosition: number; maxResults: number }
): Promise<{ records: T[]; startPosition: number; maxResults: number; totalCount: number }> {
    const response = await nango.get<QuickBooksQueryResponse<T>>({
        endpoint: `/v3/company/${companyId}/query`,
        params: { query },
        retries: 3,
    });

    if (response.data.Fault) {
        throw new Error(`QuickBooks query failed: ${formatQuickBooksFault(response.data.Fault)}`);
    }

    const queryResponse = response.data.QueryResponse;

    if (!queryResponse) {
        throw new Error('QuickBooks query response missing QueryResponse.');
    }

    if (queryResponse.Fault) {
        throw new Error(`QuickBooks query failed: ${formatQuickBooksFault(queryResponse.Fault)}`);
    }

    const records = Array.isArray(queryResponse[entity]) ? (queryResponse[entity] as T[]) : [];

    return {
        records,
        startPosition: typeof queryResponse.startPosition === 'number' ? queryResponse.startPosition : requestedPage.startPosition,
        maxResults: typeof queryResponse.maxResults === 'number' ? queryResponse.maxResults : requestedPage.maxResults,
        totalCount: typeof queryResponse.totalCount === 'number' ? queryResponse.totalCount : records.length,
    };
}
