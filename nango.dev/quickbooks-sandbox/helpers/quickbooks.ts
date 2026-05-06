import type { NangoAction } from 'nango';

export interface QuickBooksQueryResponse<T> {
    QueryResponse?: {
        startPosition?: number;
        maxResults?: number;
        totalCount?: number;
    } & Record<string, T[] | number | undefined>;
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

export function refToObject(ref: QuickBooksRef | undefined | null): { id: string | null; name: string | null } {
    return {
        id: ref?.value ?? null,
        name: ref?.name ?? null,
    };
}

export function metadataToObject(
    metadata: QuickBooksMetadata | undefined | null
): { createTime: string | null; lastUpdatedTime: string | null } {
    return {
        createTime: metadata?.CreateTime ?? null,
        lastUpdatedTime: metadata?.LastUpdatedTime ?? null,
    };
}

export function clampQuickBooksLimit(limit: number | undefined): number {
    return Math.min(Math.max(limit ?? 50, 1), 100);
}

export function buildQuery(entity: string, clauses: string[], startPosition: number, maxResults: number): string {
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
    return `SELECT * FROM ${entity}${where} STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
}

export async function queryQuickBooks<T>(
    nango: NangoAction,
    companyId: string,
    entity: string,
    query: string
): Promise<{ records: T[]; startPosition: number; maxResults: number; totalCount: number | null }> {
    const response = await nango.get<QuickBooksQueryResponse<T>>({
        endpoint: `/v3/company/${companyId}/query`,
        params: { query },
        retries: 3,
    });

    const queryResponse = response.data.QueryResponse ?? {};
    const records = Array.isArray(queryResponse[entity]) ? (queryResponse[entity] as T[]) : [];

    return {
        records,
        startPosition: typeof queryResponse.startPosition === 'number' ? queryResponse.startPosition : 1,
        maxResults: typeof queryResponse.maxResults === 'number' ? queryResponse.maxResults : records.length,
        totalCount: typeof queryResponse.totalCount === 'number' ? queryResponse.totalCount : null,
    };
}

