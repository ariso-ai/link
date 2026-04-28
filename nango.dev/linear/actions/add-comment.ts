import { createAction } from 'nango';
import * as z from 'zod';

// --- Input schema ---
const addCommentInputSchema = z.object({
    issueId: z.string().describe('Linear issue UUID to attach the comment to'),
    body: z.string().min(1).describe('Comment body in markdown'),
});

// --- Output schema ---
const addCommentOutputSchema = z.object({
    id: z.string(),
    url: z.string(),
    createdAt: z.string(),
});

// --- Linear GraphQL response types ---
interface LinearCommentCreateResponse {
    data: {
        commentCreate: {
            success: boolean;
            comment: {
                id: string;
                url: string;
                createdAt: string;
            };
        };
    };
    errors?: Array<{ message: string }>;
}

// --- Action ---
const action = createAction({
    description: 'Add a comment to a Linear issue',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/linear/issues/:issueId/comments', group: 'Comments' },
    scopes: ['write'],
    input: addCommentInputSchema,
    output: addCommentOutputSchema,

    exec: async (nango, input) => {
        const mutation = `
            mutation AddComment($input: CommentCreateInput!) {
                commentCreate(input: $input) {
                    success
                    comment {
                        id
                        url
                        createdAt
                    }
                }
            }
        `;

        const response = await nango.proxy<LinearCommentCreateResponse>({
            method: 'POST',
            endpoint: '/graphql',
            data: {
                query: mutation,
                variables: {
                    input: { issueId: input.issueId, body: input.body },
                },
            },
            retries: 3,
        });

        if (response.data.errors?.length) {
            throw new Error(
                `Linear GraphQL error: ${response.data.errors.map((e) => e.message).join(', ')}`,
            );
        }

        const { success, comment } = response.data.data.commentCreate;
        if (!success) {
            throw new Error('Linear reported commentCreate as unsuccessful');
        }

        return {
            id: comment.id,
            url: comment.url,
            createdAt: comment.createdAt,
        };
    },
});

export default action;
