import { createAction } from 'nango';
import * as z from 'zod';
import { getCloudId } from '../helpers/get-cloud-id.js';

// --- Input schema ---
const getPageChildrenInputSchema = z.object({
    pageId: z.string().describe('The parent Confluence page ID'),
});

// --- Output schemas ---
const childPageSchema = z.object({
    pageId: z.string(),
    title: z.string(),
    url: z.string(),
});

const getPageChildrenOutputSchema = z.object({
    children: z.array(childPageSchema),
});

// --- Confluence API response types ---
interface ConfluenceChildrenResponse {
    results: Array<{
        id: string;
        title: string;
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
    description: 'Get child pages of a Confluence page',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/confluence/pages/{pageId}/children', group: 'Pages' },
    scopes: ['read:confluence-content.summary'],
    input: getPageChildrenInputSchema,
    output: getPageChildrenOutputSchema,

    exec: async (nango, input) => {
        const cloudId = await getCloudId(nango);

        const response = await nango.proxy<ConfluenceChildrenResponse>({
            baseUrlOverride: 'https://api.atlassian.com',
            endpoint: `/ex/confluence/${cloudId}/rest/api/content/${input.pageId}/child/page`,
            retries: 3,
        });

        const data = response.data;
        const baseUrl = data._links.base;

        const children = data.results.map((child) => ({
            pageId: child.id,
            title: child.title,
            url: `${baseUrl}${child._links.webui}`,
        }));

        return { children };
    },
});

export default action;
