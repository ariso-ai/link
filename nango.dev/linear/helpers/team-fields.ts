import * as z from 'zod';

export const teamFieldsFragment = `
    id
    key
    name
    description
    color
    icon
    private
    createdAt
    updatedAt
`;

export interface LinearTeamRaw {
    id: string;
    key: string;
    name: string;
    description: string | null;
    color: string | null;
    icon: string | null;
    private: boolean;
    createdAt: string;
    updatedAt: string;
}

export const linearTeamSchema = z.object({
    id: z.string(),
    key: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    color: z.string().nullable(),
    icon: z.string().nullable(),
    private: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

export type LinearTeam = z.infer<typeof linearTeamSchema>;

export function mapLinearTeam(team: LinearTeamRaw): LinearTeam {
    return {
        id: team.id,
        key: team.key,
        name: team.name,
        description: team.description,
        color: team.color,
        icon: team.icon,
        private: team.private,
        createdAt: team.createdAt,
        updatedAt: team.updatedAt,
    };
}
