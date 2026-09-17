import type { NangoAction } from 'nango';

export interface JiraSite {
    /** Cloud ID used in API paths (`https://api.atlassian.com/ex/jira/{cloudId}/...`). */
    cloudId: string;
    /** Browser-facing site URL (e.g. `https://your-domain.atlassian.net`), without a trailing slash. */
    siteUrl: string;
}

/**
 * Retrieve the Jira Cloud site for the authenticated connection.
 * Jira Cloud REST API v3 requires the cloud ID in the URL path, while links shown to
 * users must point at the site URL — api.atlassian.com URLs require an OAuth token.
 */
export async function getJiraSite(nango: NangoAction): Promise<JiraSite> {
    const response = await nango.proxy<Array<{ id: string; url: string }>>({
        baseUrlOverride: 'https://api.atlassian.com',
        endpoint: '/oauth/token/accessible-resources',
        retries: 3,
    });

    const resources = response.data;
    if (!resources || resources.length === 0) {
        throw new Error('No accessible Jira Cloud resources found for this connection.');
    }

    const resource = resources[0]!;
    return { cloudId: resource.id, siteUrl: resource.url.replace(/\/+$/, '') };
}
