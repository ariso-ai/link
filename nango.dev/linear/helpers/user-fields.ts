import * as z from 'zod';

export const userFieldsFragment = `
    id
    name
    displayName
    email
    avatarUrl
    active
    admin
    isMe
    createdAt
    updatedAt
`;

export interface LinearUserRaw {
    id: string;
    name: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
    active: boolean;
    admin: boolean;
    isMe: boolean;
    createdAt: string;
    updatedAt: string;
}

export const linearUserSchema = z.object({
    id: z.string(),
    name: z.string(),
    displayName: z.string(),
    email: z.string(),
    avatarUrl: z.string().nullable(),
    active: z.boolean(),
    admin: z.boolean(),
    isMe: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

export type LinearUser = z.infer<typeof linearUserSchema>;

export function mapLinearUser(user: LinearUserRaw): LinearUser {
    return {
        id: user.id,
        name: user.name,
        displayName: user.displayName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        active: user.active,
        admin: user.admin,
        isMe: user.isMe,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
}
