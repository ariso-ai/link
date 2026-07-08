import { createAction } from 'nango';
import * as z from 'zod';

// --- Input schema ---
const listProjectsInputSchema = z.object({
    query: z.string().optional().describe('Filter projects by name or key (case-insensitive substring match)'),
    maxResults: z.number().optional().describe('Maximum number of projects to return (default 50, max 100)'),
    startAt: z.number().optional().describe('Index of the first result to return for pagination (default 0)'),
});

// --- Output schemas ---
const jiraProjectSchema = z.object({
    id: z.string(),
    key: z.string(),
    name: z.string(),
    projectTypeKey: z.string(),
    url: z.string(),
});

const listProjectsOutputSchema = z.object({
    projects: z.array(jiraProjectSchema),
    total: z.number(),
    startAt: z.number(),
    maxResults: z.number(),
    isLast: z.boolean(),
});

type JiraProject = z.infer<typeof jiraProjectSchema>;

// --- Jira API response types (v3 /project/search) ---
interface JiraProjectSearchResponse {
    values: Array<{
        id: string;
        key: string;
        name: string;
        projectTypeKey: string;
        self: string;
    }>;
    total: number;
    startAt: number;
    maxResults: number;
    isLast: boolean;
}

// --- Action ---
const action = createAction({
    description: 'List projects visible to the authenticated Jira user',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/jira/projects', group: 'Projects' },
    input: listProjectsInputSchema,
    output: listProjectsOutputSchema,

    exec: async (nango, input) => {
        const maxResults = Math.min(input.maxResults ?? 50, 100);
        const startAt = input.startAt ?? 0;

        const params: Record<string, string> = {
            maxResults: String(maxResults),
            startAt: String(startAt),
        };
        if (input.query) {
            params['query'] = input.query;
        }

        const response = await nango.proxy<JiraProjectSearchResponse>({
            endpoint: '/rest/api/3/project/search',
            params,
            headers: {
                'X-Atlassian-Token': 'no-check',
            },
            retries: 3,
        });

        const data = response.data;
        const projects: JiraProject[] = data.values.map((project) => ({
            id: project.id,
            key: project.key,
            name: project.name,
            projectTypeKey: project.projectTypeKey,
            url: `${new URL(project.self).origin}/browse/${project.key}`,
        }));

        return {
            projects,
            total: data.total,
            startAt: data.startAt,
            maxResults: data.maxResults,
            isLast: data.isLast,
        };
    },
});

export default action;
