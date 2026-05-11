import type { NangoAction } from 'nango';

export async function getCompanyId(nango: NangoAction): Promise<string> {
    const connection = await nango.getConnection();
    const realmId = connection.connection_config?.['realmId'];

    if (typeof realmId === 'string' && realmId.length > 0) {
        return realmId;
    }

    throw new Error('QuickBooks realmId missing from Nango connection config. Reauthenticate the QuickBooks connection.');
}
