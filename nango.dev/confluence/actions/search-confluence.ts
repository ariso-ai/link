import { createAction } from 'nango';
import * as z from 'zod';
import { getCloudId } from '../helpers/get-cloud-id.js';

// --- Input schema ---
const searchConfluenceInputSchema = z.object({
    query: z.string().describe('CQL query string (e.g. "type = page AND text ~ \'search term\'")'),
    limit: z.number().optional().describe('Maximum number of results to return (default 10)'),
});

// --- Output schemas ---
const searchResultSchema = z.object({
    pageId: z.string(),
    title: z.string(),
    spaceKey: z.string(),
    url: z.string(),
    excerpt: z.string(),
});

const searchConfluenceOutputSchema = z.object({
    results: z.array(searchResultSchema),
});

// --- Confluence API response types ---
interface ConfluenceSearchResponse {
    results: Array<{
        content: {
            id: string;
            title: string;
            _links: {
                webui: string;
            };
            _expandable?: {
                space?: string;
            };
            space?: {
                key: string;
            };
        };
        excerpt: string;
    }>;
    _links: {
        base: string;
    };
}

// --- Action ---
const action = createAction({
    description: 'Search Confluence pages using CQL',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/confluence/search', group: 'Search' },
    scopes: ['search:confluence'],
    input: searchConfluenceInputSchema,
    output: searchConfluenceOutputSchema,

    exec: async (nango, input) => {
        const cloudId = await getCloudId(nango);
        const limit = input.limit ?? 10;

        const response = await nango.proxy<ConfluenceSearchResponse>({
            baseUrlOverride: 'https://api.atlassian.com',
            endpoint: `/ex/confluence/${cloudId}/rest/api/search`,
            params: {
                cql: input.query,
                limit: String(limit),
                expand: 'space',
            },
            retries: 3,
        });

        const data = response.data;
        const baseUrl = data._links.base;

        const results = data.results.map((result) => ({
            pageId: result.content.id,
            title: result.content.title,
            spaceKey: result.content.space?.key ?? '',
            url: `${baseUrl}${result.content._links.webui}`,
            excerpt: result.excerpt,
        }));

        return { results };
    },
});

export default action;
