import { createAction } from 'nango';
import * as z from 'zod';
import {
    userFieldsFragment,
    linearUserSchema,
    mapLinearUser,
    type LinearUserRaw,
} from '../helpers/user-fields.js';

const listUsersInputSchema = z.object({
    query: z
        .string()
        .optional()
        .describe('Filter users by name, displayName, or email (case-insensitive substring match)'),
    active: z.boolean().optional().describe('When true, only return active users; when false, only return deactivated users'),
    admin: z.boolean().optional().describe('When true, only return admins; when false, only return non-admins'),
    limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum number of users to return (default 50, max 100)'),
    after: z.string().optional().describe('Pagination cursor from a previous response'),
});

const listUsersOutputSchema = z.object({
    users: z.array(linearUserSchema),
    hasNextPage: z.boolean(),
    endCursor: z.string().nullable(),
});

interface LinearUsersResponse {
    data: {
        users: {
            nodes: LinearUserRaw[];
            pageInfo: {
                hasNextPage: boolean;
                endCursor: string | null;
            };
        };
    };
    errors?: Array<{ message: string }>;
}

const action = createAction({
    description: 'List users in the Linear workspace with optional name/email/active/admin filters',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/linear/users', group: 'Users' },
    scopes: ['read'],
    input: listUsersInputSchema,
    output: listUsersOutputSchema,

    exec: async (nango, input) => {
        const first = Math.min(input.limit ?? 50, 100);

        const filter: Record<string, unknown> = {};
        if (input.active !== undefined) filter['active'] = { eq: input.active };
        if (input.admin !== undefined) filter['admin'] = { eq: input.admin };
        if (input.query) {
            filter['or'] = [
                { name: { containsIgnoreCase: input.query } },
                { displayName: { containsIgnoreCase: input.query } },
                { email: { containsIgnoreCase: input.query } },
            ];
        }

        const query = `
            query ListUsers($filter: UserFilter, $first: Int!, $after: String) {
                users(filter: $filter, first: $first, after: $after) {
                    nodes {
                        ${userFieldsFragment}
                    }
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                }
            }
        `;

        const response = await nango.proxy<LinearUsersResponse>({
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

        const { nodes, pageInfo } = response.data.data.users;

        return {
            users: nodes.map(mapLinearUser),
            hasNextPage: pageInfo.hasNextPage,
            endCursor: pageInfo.endCursor,
        };
    },
});

export default action;
