import { createAction } from 'nango';
import * as z from 'zod';

const getCandidateResumeInputSchema = z.object({
    candidateId: z.number().describe('Greenhouse candidate ID'),
    includeAllAttachments: z.boolean().optional().describe('Return every attachment (cover letters, take-home tests, etc.) instead of only resumes. Default false.'),
});

const attachmentSchema = z.object({
    filename: z.string(),
    type: z.string().describe('Attachment type, e.g. "resume", "cover_letter", "take_home_test"'),
    url: z.string().describe('Signed download URL. Greenhouse hosts attachments on S3 and these links expire 7 days after they are issued, so download promptly rather than storing the URL.'),
    createdAt: z.string().nullable(),
});

const getCandidateResumeOutputSchema = z.object({
    candidateId: z.number(),
    name: z.string(),
    attachments: z.array(attachmentSchema),
});

type Attachment = z.infer<typeof attachmentSchema>;

interface GreenhouseCandidateDetail {
    id: number;
    first_name: string | null;
    last_name: string | null;
    attachments: Array<{ filename: string; url: string; type: string; created_at: string | null }> | null;
}

const action = createAction({
    description: 'Retrieve a Greenhouse candidate\'s resume as a signed download URL. Returns only resume attachments by default; the URLs expire 7 days after issue.',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/greenhouse/candidates/resume', group: 'Candidates' },
    input: getCandidateResumeInputSchema,
    output: getCandidateResumeOutputSchema,

    exec: async (nango, input) => {
        const response = await nango.proxy<GreenhouseCandidateDetail>({
            endpoint: `/v1/candidates/${input.candidateId}`,
            retries: 3,
        });

        const candidate = response.data;
        const all = candidate.attachments ?? [];
        const selected = input.includeAllAttachments ? all : all.filter((attachment) => attachment.type === 'resume');

        const attachments: Attachment[] = selected.map((attachment) => ({
            filename: attachment.filename,
            type: attachment.type,
            url: attachment.url,
            createdAt: attachment.created_at ?? null,
        }));

        return {
            candidateId: candidate.id,
            name: [candidate.first_name, candidate.last_name].filter(Boolean).join(' '),
            attachments,
        };
    },
});

export default action;
