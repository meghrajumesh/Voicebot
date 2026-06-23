import { NextResponse } from 'next/server';
import { query } from '@/lib/db.js';
import { generateEmbedding } from '@/lib/embeddings.js';

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
        const { workspaceId, content, sourceType = 'manual', sourceTitle = 'Manual Entry', sourceUrl = null, metadata = {} } = await request.json();

        if (!workspaceId) {
            return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
        }
        if (!content || content.trim().length === 0) {
            return NextResponse.json({ error: 'content is required' }, { status: 400 });
        }

        console.log('📚 Training with content length:', content.length);

        const chunks = chunkText(content);
        console.log('📝 Created', chunks.length, 'chunks');

        let insertedCount = 0;
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
            }
        }

        console.log('✅ Inserted', insertedCount, 'chunks successfully');
        return NextResponse.json({ success: true, chunksInserted: insertedCount, totalChunks: chunks.length, workspaceId });

    } catch (error) {
        console.error('❌ Training API error:', error.message);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}