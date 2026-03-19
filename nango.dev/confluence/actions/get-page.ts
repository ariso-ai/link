import { createAction } from 'nango';
import * as z from 'zod';
import { getCloudId } from '../helpers/get-cloud-id.js';

// --- Input schema ---
const getPageInputSchema = z.object({
    pageId: z.string().describe('The Confluence page ID'),
});

// --- Output schema ---
const getPageOutputSchema = z.object({
    title: z.string(),
    spaceKey: z.string(),
    body: z.string(),
    url: z.string(),
    lastModified: z.string(),
});

// --- Confluence API response types ---
interface ConfluencePageResponse {
    id: string;
    title: string;
    space: {
        key: string;
    };
    body: {
        storage: {
            value: string;
        };
    };
    version: {
        when: string;
    };
    _links: {
        base: string;
        webui: string;
    };
}

// --- Action ---
const action = createAction({
    description: 'Get a Confluence page by ID including its body content',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/confluence/pages/{pageId}', group: 'Pages' },
    scopes: ['read:confluence-content.all'],
    input: getPageInputSchema,
    output: getPageOutputSchema,

    exec: async (nango, input) => {
        const cloudId = await getCloudId(nango);

        const response = await nango.proxy<ConfluencePageResponse>({
            baseUrlOverride: 'https://api.atlassian.com',
            endpoint: `/ex/confluence/${cloudId}/rest/api/content/${input.pageId}`,
            params: {
                expand: 'body.storage,space,version',
            },
            retries: 3,
        });

        const page = response.data;

        return {
            title: page.title,
            spaceKey: page.space.key,
            body: page.body.storage.value,
            url: `${page._links.base}${page._links.webui}`,
            lastModified: page.version.when,
        };
    },
});

export default action;
