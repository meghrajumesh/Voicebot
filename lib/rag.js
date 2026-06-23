import { query } from './db.js';
import { generateEmbedding } from './embeddings.js';
import Groq from 'groq-sdk';

// Initialize Groq client
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

export async function searchKnowledgeBase(queryText, workspaceId, limit = 5) {
    try {
        console.log('🔍 Searching knowledge base for:', queryText.substring(0, 50) + '...');
        const embedding = await generateEmbedding(queryText);
        const embeddingString = `[${embedding.join(',')}]`;

        const result = await query(
            `
      SELECT 
        id,
        content,
        source_type,
        source_url,
        source_title,
        metadata,
        1 - (embedding <=> $1::vector) AS similarity
      FROM knowledge_chunks
      WHERE workspace_id = $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3
      `,
            [embeddingString, workspaceId, limit]
        );

        const threshold = 0.3;
        const filtered = result.rows.filter(row => row.similarity >= threshold);
        console.log(`📚 Found ${filtered.length} relevant chunks out of ${result.rows.length} (threshold: ${threshold})`);

        if (filtered.length > 0) {
            console.log('📊 Top similarity scores:', filtered.map(r => r.similarity.toFixed(3)).join(', '));
        }

        return filtered;
    } catch (error) {
        console.error('❌ Search error:', error.message);
        throw error;
    }
}

export async function generateRAGAnswer(queryText, workspaceId, conversationHistory = []) {
    try {
        console.log('🤖 Generating RAG answer for:', queryText.substring(0, 50) + '...');
        const relevantChunks = await searchKnowledgeBase(queryText, workspaceId);

        if (relevantChunks.length === 0) {
            return {
                answer: "I don't have information about that in my knowledge base. I'm here to help with questions about our products, services, and pricing. Is there something specific I can help you with?",
                sources: [],
                confidence: 'low',
                hasKnowledge: false,
            };
        }

        // Build context from relevant chunks
        const context = relevantChunks.map((chunk, index) => {
            return `[Source ${index + 1}]: ${chunk.content}`;
        }).join('\n\n');

        const sources = relevantChunks.map(chunk => ({
            title: chunk.source_title || 'Source',
            url: chunk.source_url || null,
            type: chunk.source_type || 'unknown',
            similarity: Math.round(chunk.similarity * 100),
            content_preview: chunk.content.substring(0, 100) + '...',
        }));

        // 🔥 NEW: Use Groq to generate a real AI answer
        try {
            const completion = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile', // Fast, free, and very smart
                messages: [
                    {
                        role: 'system',
                        content: `You are LeadPilot AI, a helpful business assistant for a company.

**CRITICAL RULES:**
1. ONLY answer using the provided context below.
2. If the context doesn't contain the exact answer, say "I don't have that information" - DO NOT make up facts.
3. Keep answers concise, helpful, and professional (2-3 sentences max).
4. If the user asks about pricing, direct them to sales if the exact price isn't in the context.
5. Be friendly and conversational.

**Context:**
${context}`
                    },
                    {
                        role: 'user',
                        content: queryText
                    }
                ],
                temperature: 0.3,
                max_tokens: 200,
            });

            const answer = completion.choices[0]?.message?.content ||
                `Based on our knowledge base: ${relevantChunks[0].content.substring(0, 200)}...`;

            return {
                answer: answer,
                sources: sources,
                confidence: relevantChunks.length >= 3 ? 'high' : 'medium',
                hasKnowledge: true,
            };

        } catch (llmError) {
            console.warn('⚠️ Groq API error, using fallback:', llmError.message);

            // Fallback: return the first chunk
            const fallbackAnswer = `Based on our knowledge base, I found this information: "${relevantChunks[0].content.substring(0, 200)}..." Would you like more details about this?`;

            return {
                answer: fallbackAnswer,
                sources: sources,
                confidence: 'medium',
                hasKnowledge: true,
            };
        }

    } catch (error) {
        console.error('❌ RAG generation error:', error.message);
        throw error;
    }
}