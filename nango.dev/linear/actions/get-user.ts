import { createAction } from 'nango';
import * as z from 'zod';
import {
    userFieldsFragment,
    linearUserSchema,
    mapLinearUser,
    type LinearUserRaw,
} from '../helpers/user-fields.js';

const getUserInputSchema = z.object({
    userId: z
        .string()
        .describe('Linear user UUID or email address. Both are accepted.'),
});

const getUserOutputSchema = linearUserSchema;

interface LinearUserByIdResponse {
    data: { user: LinearUserRaw | null };
    errors?: Array<{ message: string }>;
}

interface LinearUserByEmailResponse {
    data: { users: { nodes: LinearUserRaw[] } };
    errors?: Array<{ message: string }>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const action = createAction({
    description: 'Get a single Linear user by UUID or email',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/linear/users/:userId', group: 'Users' },
    scopes: ['read'],
    input: getUserInputSchema,
    output: getUserOutputSchema,

    exec: async (nango, input) => {
        let user: LinearUserRaw | null;

        if (UUID_REGEX.test(input.userId)) {
            const query = `
                query GetUser($id: String!) {
                    user(id: $id) {
                        ${userFieldsFragment}
                    }
                }
            `;

            const response = await nango.proxy<LinearUserByIdResponse>({
                method: 'POST',
                endpoint: '/graphql',
                data: { query, variables: { id: input.userId } },
                retries: 3,
            });

            if (response.data.errors?.length) {
                throw new Error(
                    `Linear GraphQL error: ${response.data.errors.map((e) => e.message).join(', ')}`,
                );
            }

            user = response.data.data.user;
        } else {
            const query = `
                query GetUserByEmail($email: String!) {
                    users(filter: { email: { eq: $email } }, first: 1) {
                        nodes {
                            ${userFieldsFragment}
                        }
                    }
                }
            `;

            const response = await nango.proxy<LinearUserByEmailResponse>({
                method: 'POST',
                endpoint: '/graphql',
                data: { query, variables: { email: input.userId } },
                retries: 3,
            });

            if (response.data.errors?.length) {
                throw new Error(
                    `Linear GraphQL error: ${response.data.errors.map((e) => e.message).join(', ')}`,
                );
            }

            user = response.data.data.users.nodes[0] ?? null;
        }

        if (!user) {
            throw new Error(`Linear user "${input.userId}" not found`);
        }

        return mapLinearUser(user);
    },
});

export default action;
