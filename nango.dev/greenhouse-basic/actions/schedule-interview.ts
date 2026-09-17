import { createAction } from 'nango';
import * as z from 'zod';

const interviewerInputSchema = z.object({
    userId: z.number().optional().describe('Greenhouse user ID of the interviewer'),
    email: z.string().optional().describe('Email address of the interviewer. Use this when the user ID is unknown.'),
    responseStatus: z
        .enum(['needs_action', 'declined', 'tentative', 'accepted'])
        .optional()
        .describe('Invite response status (default "needs_action")'),
});

const scheduleInterviewInputSchema = z.object({
    applicationId: z.number().describe('Application ID to schedule against — from list-candidates'),
    interviewId: z.number().describe('Interview ID — from list-job-stages'),
    start: z.string().describe('Interview start in ISO-8601 format (e.g. "2025-11-05T13:00:00Z")'),
    end: z.string().describe('Interview end in ISO-8601 format (e.g. "2025-11-05T14:00:00Z")'),
    interviewers: z.array(interviewerInputSchema).min(1).describe('Interviewers, each identified by userId or email'),
    onBehalfOfUserId: z.number().optional().describe('Greenhouse user ID performing the action. Greenhouse requires an actor on every write for auditing. Supply this or onBehalfOfEmail.'),
    onBehalfOfEmail: z.string().optional().describe('Email of the user performing the action, resolved to a user ID via the Greenhouse users endpoint. Supply this or onBehalfOfUserId.'),
    location: z.string().optional().describe('Interview location'),
    videoConferencingUrl: z.string().optional().describe('Video conferencing link for the interview'),
    externalEventId: z.string().optional().describe('Calendar event ID to associate with this interview. Greenhouse requires one; a unique value is generated when omitted.'),
});

const scheduleInterviewOutputSchema = z.object({
    id: z.number(),
    applicationId: z.number(),
    externalEventId: z.string().nullable(),
    status: z.string().nullable(),
    start: z.string().nullable(),
    end: z.string().nullable(),
    location: z.string().nullable(),
    videoConferencingUrl: z.string().nullable(),
    interviewName: z.string().nullable(),
    interviewers: z.array(
        z.object({
            id: z.number().nullable(),
            name: z.string().nullable(),
            email: z.string().nullable(),
            responseStatus: z.string().nullable(),
        })
    ),
});

interface GreenhouseUser {
    id: number;
    primary_email_address: string | null;
    emails: string[] | null;
    disabled: boolean;
}

interface GreenhouseScheduledInterview {
    id: number;
    application_id: number;
    external_event_id: string | null;
    status: string | null;
    start: { date_time: string } | null;
    end: { date_time: string } | null;
    location: string | null;
    video_conferencing_url: string | null;
    interview: { id: number; name: string } | null;
    interviewers:
        | Array<{
              id: number | null;
              name: string | null;
              email: string | null;
              response_status: string | null;
          }>
        | null;
}

const action = createAction({
    description: 'Schedule an interview in Greenhouse for an existing application. Requires an interviewId from list-job-stages and an applicationId from list-candidates.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/greenhouse/scheduled-interviews', group: 'Interviews' },
    input: scheduleInterviewInputSchema,
    output: scheduleInterviewOutputSchema,

    exec: async (nango, input) => {
        for (const interviewer of input.interviewers) {
            if (interviewer.userId === undefined && !interviewer.email) {
                throw new Error('Each interviewer must specify either userId or email');
            }
        }

        // Greenhouse requires an On-Behalf-Of actor on every write request for auditing.
        let onBehalfOfUserId = input.onBehalfOfUserId;
        if (onBehalfOfUserId === undefined) {
            if (!input.onBehalfOfEmail) {
                throw new Error('Either onBehalfOfUserId or onBehalfOfEmail is required — Greenhouse audits every write against a user');
            }

            const usersResponse = await nango.proxy<GreenhouseUser[] | GreenhouseUser>({
                endpoint: '/v1/users',
                params: { email: input.onBehalfOfEmail },
                retries: 3,
            });

            const users = Array.isArray(usersResponse.data) ? usersResponse.data : [usersResponse.data];
            const user = users.find((candidate) => candidate && typeof candidate.id === 'number');
            if (!user) {
                throw new Error(`No Greenhouse user found with email "${input.onBehalfOfEmail}"`);
            }
            onBehalfOfUserId = user.id;
        }

        const body: Record<string, unknown> = {
            application_id: input.applicationId,
            interview_id: input.interviewId,
            start: input.start,
            end: input.end,
            external_event_id: input.externalEventId ?? `ariso-${crypto.randomUUID()}`,
            interviewers: input.interviewers.map((interviewer) => {
                const entry: Record<string, unknown> = {
                    response_status: interviewer.responseStatus ?? 'needs_action',
                };
                if (interviewer.userId !== undefined) {
                    entry['user_id'] = interviewer.userId;
                } else {
                    entry['email'] = interviewer.email;
                }
                return entry;
            }),
        };

        if (input.location) {
            body['location'] = input.location;
        }

        if (input.videoConferencingUrl) {
            body['video_conferencing_url'] = input.videoConferencingUrl;
        }

        // v2 is required — v1 was deprecated in 2020 and returns a truncated record.
        const response = await nango.proxy<GreenhouseScheduledInterview>({
            method: 'POST',
            endpoint: '/v2/scheduled_interviews',
            headers: {
                'On-Behalf-Of': String(onBehalfOfUserId),
            },
            data: body,
            retries: 0,
        });

        const interview = response.data;
        return {
            id: interview.id,
            applicationId: interview.application_id,
            externalEventId: interview.external_event_id ?? null,
            status: interview.status ?? null,
            start: interview.start?.date_time ?? null,
            end: interview.end?.date_time ?? null,
            location: interview.location ?? null,
            videoConferencingUrl: interview.video_conferencing_url ?? null,
            interviewName: interview.interview?.name ?? null,
            interviewers: (interview.interviewers ?? []).map((interviewer) => ({
                id: interviewer.id ?? null,
                name: interviewer.name ?? null,
                email: interviewer.email ?? null,
                responseStatus: interviewer.response_status ?? null,
            })),
        };
    },
});

export default action;
