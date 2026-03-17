import type { NangoAction } from 'nango';

/**
 * Retrieve the Confluence Cloud ID for the authenticated connection.
 * Confluence Cloud REST API requires the cloud ID in the URL path.
 */
export async function getCloudId(nango: NangoAction): Promise<string> {
    const response = await nango.proxy<Array<{ id: string; url: string }>>({
        method: 'GET',
        baseUrlOverride: 'https://api.atlassian.com',
        endpoint: '/oauth/token/accessible-resources',
        retries: 3,
    });

    const resources = response.data;
    if (!resources || resources.length === 0) {
        throw new Error('No accessible Confluence Cloud resources found for this connection.');
    }

    return resources[0]!.id;
}
