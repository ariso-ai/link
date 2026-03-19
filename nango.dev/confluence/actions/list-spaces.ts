import { createAction } from 'nango';
import * as z from 'zod';
import { getCloudId } from '../helpers/get-cloud-id.js';

// --- Input schema ---
const listSpacesInputSchema = z.object({
    limit: z.number().optional().describe('Maximum number of spaces to return (default 25)'),
});

// --- Output schemas ---
const spaceSchema = z.object({
    spaceKey: z.string(),
    name: z.string(),
    description: z.string(),
    url: z.string(),
});

const listSpacesOutputSchema = z.object({
    spaces: z.array(spaceSchema),
});

// --- Confluence API response types ---
interface ConfluenceSpacesResponse {
    results: Array<{
        key: string;
        name: string;
        description?: {
            plain?: {
                value: string;
            };
        };
        _links: {
            webui: string;
        };
    }>;
    _links: {
        base: string;
    };
}

// --- Action ---
const action = createAction({
    description: 'List Confluence spaces',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/confluence/spaces', group: 'Spaces' },
    scopes: ['read:confluence-space.summary'],
    input: listSpacesInputSchema,
    output: listSpacesOutputSchema,

    exec: async (nango, input) => {
        const cloudId = await getCloudId(nango);
        const limit = input.limit ?? 25;

        const response = await nango.proxy<ConfluenceSpacesResponse>({
            baseUrlOverride: 'https://api.atlassian.com',
            endpoint: `/ex/confluence/${cloudId}/rest/api/space`,
            params: {
                limit: String(limit),
            },
            retries: 3,
        });

        const data = response.data;
        const baseUrl = data._links.base;

        const spaces = data.results.map((space) => ({
            spaceKey: space.key,
            name: space.name,
            description: space.description?.plain?.value ?? '',
            url: `${baseUrl}${space._links.webui}`,
        }));

        return { spaces };
    },
});

export default action;
