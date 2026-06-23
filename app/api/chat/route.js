import { NextResponse } from 'next/server';
import { generateRAGAnswer } from '../../../lib/rag.js';

export async function POST(request) {
    try {
        // 1. Parse the request
        const { message, workspaceId, history = [] } = await request.json();

        // 2. Validate required fields
        if (!message) {
            return NextResponse.json({
                error: 'message is required'
            }, { status: 400 });
        }

        if (!workspaceId) {
            return NextResponse.json({
                error: 'workspaceId is required'
            }, { status: 400 });
        }

        console.log('📨 Chat request:', {
            workspaceId,
            messageLength: message.length,
            historyLength: history.length
        });

        // 3. Generate the RAG response
        const result = await generateRAGAnswer(message, workspaceId, history);

        // 4. Return the response
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