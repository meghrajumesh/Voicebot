import { NextResponse } from 'next/server';
import { query } from '@/lib/db.js';
import { generateEmbedding } from '@/lib/embeddings.js';
import { rateLimit } from '@/lib/rate-limit.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CONTENT_LENGTH = 500_000;

function chunkText(text, chunkSize = 300, overlap = 50) {
    const words = text.split(' ');
    const chunks = [];
    for (let i = 0; i < words.length; i += chunkSize - overlap) {
        const chunk = words.slice(i, i + chunkSize).join(' ');
        if (chunk.trim().length > 0) chunks.push(chunk);
    }
    return chunks;
}

export async function POST(request) {
    try {
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        const rl = rateLimit({ windowMs: 60_000, max: 10, key: `training:${ip}` });
        if (!rl.allowed) {
            return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
        }

        const { workspaceId, content, sourceType = 'manual', sourceTitle = 'Manual Entry', sourceUrl = null, metadata = {} } = await request.json();

        if (!workspaceId || typeof workspaceId !== 'string') {
            return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
        }
        if (!UUID_RE.test(workspaceId)) {
            return NextResponse.json({ error: 'workspaceId must be a valid UUID' }, { status: 400 });
        }
        if (!content || typeof content !== 'string' || content.trim().length === 0) {
            return NextResponse.json({ error: 'content is required and must be a non-empty string' }, { status: 400 });
        }
        if (content.length > MAX_CONTENT_LENGTH) {
            return NextResponse.json({ error: `content must be under ${MAX_CONTENT_LENGTH} characters` }, { status: 400 });
        }
        if (sourceUrl && typeof sourceUrl !== 'string') {
            return NextResponse.json({ error: 'sourceUrl must be a string' }, { status: 400 });
        }

        console.log('📚 Training with content length:', content.length);

        const chunks = chunkText(content);
        console.log('📝 Created', chunks.length, 'chunks');

        let insertedCount = 0;

        try {
            await query('BEGIN');

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                try {
                    const embedding = await generateEmbedding(chunk);
                    const embeddingString = `[${embedding.join(',')}]`;
                    await query(
                        `INSERT INTO knowledge_chunks (workspace_id, content, embedding, source_type, source_title, source_url, metadata)
               VALUES ($1, $2, $3::vector, $4, $5, $6, $7)`,
                        [workspaceId, chunk, embeddingString, sourceType, sourceTitle, sourceUrl, JSON.stringify(metadata)]
                    );
                    insertedCount++;
                } catch (chunkError) {
                    console.error(`❌ Error processing chunk ${i + 1}:`, chunkError.message);
                    await query('ROLLBACK');
                    return NextResponse.json({ error: `Failed at chunk ${i + 1}: ${chunkError.message}`, chunksInserted: 0, totalChunks: chunks.length }, { status: 500 });
                }
            }

            await query('COMMIT');
        } catch (txError) {
            await query('ROLLBACK').catch(() => {});
            console.error('❌ Transaction error:', txError.message);
            return NextResponse.json({ error: txError.message || 'Transaction failed' }, { status: 500 });
        }

        console.log('✅ Inserted', insertedCount, 'chunks successfully');
        return NextResponse.json({ success: true, chunksInserted: insertedCount, totalChunks: chunks.length, workspaceId });

    } catch (error) {
        console.error('❌ Training API error:', error.message);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}