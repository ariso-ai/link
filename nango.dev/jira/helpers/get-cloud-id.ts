import type { NangoAction } from 'nango';

/**
 * Retrieve the Jira Cloud ID for the authenticated connection.
 * Jira Cloud REST API v3 requires the cloud ID in the URL path.
 */
export async function getCloudId(nango: NangoAction): Promise<string> {
    const response = await nango.proxy<Array<{ id: string; url: string }>>({
        baseUrlOverride: 'https://api.atlassian.com',
        endpoint: '/oauth/token/accessible-resources',
        retries: 3,
    });

    const resources = response.data;
    if (!resources || resources.length === 0) {
        throw new Error('No accessible Jira Cloud resources found for this connection.');
    }

    return resources[0]!.id;
}
