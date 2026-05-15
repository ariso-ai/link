import { createAction } from 'nango';
import * as z from 'zod';
import {
    projectFieldsFragment,
    linearProjectSchema,
    mapLinearProject,
    type LinearProjectRaw,
} from '../helpers/project-fields.js';

const listProjectsInputSchema = z.object({
    teamKey: z.string().optional().describe('Linear team key (e.g. "ENG") to scope projects to one team'),
    state: z
        .enum(['planned', 'backlog', 'started', 'paused', 'completed', 'canceled'])
        .optional()
        .describe('Filter by project state'),
    leadEmail: z.string().optional().describe('Filter by project lead email'),
    query: z.string().optional().describe('Full-text search across name and description'),
    limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum number of projects to return (default 50, max 100)'),
    after: z.string().optional().describe('Pagination cursor from a previous response'),
});

const listProjectsOutputSchema = z.object({
    projects: z.array(linearProjectSchema),
    hasNextPage: z.boolean(),
    endCursor: z.string().nullable(),
});

interface LinearProjectsResponse {
    data: {
        projects: {
            nodes: LinearProjectRaw[];
            pageInfo: {
                hasNextPage: boolean;
                endCursor: string | null;
            };
        };
    };
    errors?: Array<{ message: string }>;
}

const action = createAction({
    description: 'List projects from Linear with optional filters (team, state, lead, text search)',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/linear/projects', group: 'Projects' },
    scopes: ['read'],
    input: listProjectsInputSchema,
    output: listProjectsOutputSchema,

    exec: async (nango, input) => {
        const first = Math.min(input.limit ?? 50, 100);

        const filter: Record<string, unknown> = {};
        if (input.teamKey) filter['accessibleTeams'] = { key: { eq: input.teamKey } };
        if (input.state) filter['state'] = { eq: input.state };
        if (input.leadEmail) filter['lead'] = { email: { eq: input.leadEmail } };
        if (input.query) {
            filter['or'] = [
                { name: { containsIgnoreCase: input.query } },
                { description: { containsIgnoreCase: input.query } },
            ];
        }

        const query = `
            query ListProjects($filter: ProjectFilter, $first: Int!, $after: String) {
                projects(filter: $filter, first: $first, after: $after, orderBy: updatedAt) {
                    nodes {
                        ${projectFieldsFragment}
                    }
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                }
            }
        `;

        const response = await nango.proxy<LinearProjectsResponse>({
            method: 'POST',
            endpoint: '/graphql',
            data: {
                query,
                variables: { filter, first, after: input.after ?? null },
            },
            retries: 3,
        });

        if (response.data.errors?.length) {
            throw new Error(`Linear GraphQL error: ${response.data.errors.map((e) => e.message).join(', ')}`);
        }

        const { nodes, pageInfo } = response.data.data.projects;

        return {
            projects: nodes.map(mapLinearProject),
            hasNextPage: pageInfo.hasNextPage,
            endCursor: pageInfo.endCursor,
        };
    },
});

export default action;
