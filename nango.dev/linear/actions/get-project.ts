import { createAction } from 'nango';
import * as z from 'zod';
import {
    projectFieldsFragment,
    linearProjectSchema,
    mapLinearProject,
    type LinearProjectRaw,
} from '../helpers/project-fields.js';

const getProjectInputSchema = z.object({
    projectId: z
        .string()
        .describe('Linear project UUID or slug ID (the slug from the project URL). Both are accepted.'),
});

const getProjectOutputSchema = linearProjectSchema;

interface LinearGetProjectByIdResponse {
    data: { project: LinearProjectRaw | null };
    errors?: Array<{ message: string }>;
}

interface LinearGetProjectBySlugResponse {
    data: { projects: { nodes: LinearProjectRaw[] } };
    errors?: Array<{ message: string }>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const action = createAction({
    description: 'Get a single Linear project by UUID or slug ID',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/linear/projects/:projectId', group: 'Projects' },
    scopes: ['read'],
    input: getProjectInputSchema,
    output: getProjectOutputSchema,

    exec: async (nango, input) => {
        let project: LinearProjectRaw | null;

        if (UUID_REGEX.test(input.projectId)) {
            const query = `
                query GetProject($id: String!) {
                    project(id: $id) {
                        ${projectFieldsFragment}
                    }
                }
            `;

            const response = await nango.proxy<LinearGetProjectByIdResponse>({
                method: 'POST',
                endpoint: '/graphql',
                data: { query, variables: { id: input.projectId } },
                retries: 3,
            });

            if (response.data.errors?.length) {
                throw new Error(
                    `Linear GraphQL error: ${response.data.errors.map((e) => e.message).join(', ')}`,
                );
            }

            project = response.data.data.project;
        } else {
            const query = `
                query GetProjectBySlug($slugId: String!) {
                    projects(filter: { slugId: { eq: $slugId } }, first: 1) {
                        nodes {
                            ${projectFieldsFragment}
                        }
                    }
                }
            `;

            const response = await nango.proxy<LinearGetProjectBySlugResponse>({
                method: 'POST',
                endpoint: '/graphql',
                data: { query, variables: { slugId: input.projectId } },
                retries: 3,
            });

            if (response.data.errors?.length) {
                throw new Error(
                    `Linear GraphQL error: ${response.data.errors.map((e) => e.message).join(', ')}`,
                );
            }

            project = response.data.data.projects.nodes[0] ?? null;
        }

        if (!project) {
            throw new Error(`Linear project "${input.projectId}" not found`);
        }

        return mapLinearProject(project);
    },
});

export default action;
