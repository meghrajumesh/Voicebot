import { NextResponse } from 'next/server';
import { generateRAGAnswer } from '@/lib/rag.js';
import { rateLimit } from '@/lib/rate-limit.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_LENGTH = 4000;

export async function POST(request) {
    try {
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        const rl = rateLimit({ windowMs: 60_000, max: 30, key: `chat:${ip}` });
        if (!rl.allowed) {
            return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
        }

        const { message, workspaceId, history = [] } = await request.json();

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return NextResponse.json({ error: 'message is required and must be a non-empty string' }, { status: 400 });
        }

        if (message.length > MAX_MESSAGE_LENGTH) {
            return NextResponse.json({ error: `message must be under ${MAX_MESSAGE_LENGTH} characters` }, { status: 400 });
        }

        if (!workspaceId || typeof workspaceId !== 'string') {
            return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
        }

        if (!UUID_RE.test(workspaceId)) {
            return NextResponse.json({ error: 'workspaceId must be a valid UUID' }, { status: 400 });
        }

        if (!Array.isArray(history)) {
            return NextResponse.json({ error: 'history must be an array' }, { status: 400 });
        }

        const structuredHistory = history.map(h => ({
            role: h.role === 'assistant' ? 'assistant' : 'user',
            content: typeof h.content === 'string' ? h.content : String(h.content ?? ''),
        }));

        console.log('📨 Chat request:', {
            workspaceId,
            messageLength: message.length,
            historyLength: structuredHistory.length
        });

        const result = await generateRAGAnswer(message, workspaceId, structuredHistory);

        return NextResponse.json({
            reply: result.answer,
            sources: result.sources,
            confidence: result.confidence,
            hasKnowledge: result.hasKnowledge,
        });

    } catch (error) {
        console.error('❌ Chat API error:', error.message);
        return NextResponse.json({
            error: error.message || 'Internal server error'
        }, { status: 500 });
    }
}