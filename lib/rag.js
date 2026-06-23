import { query } from './db.js';
import { generateEmbedding } from './embeddings.js';
import Groq from 'groq-sdk';

// Initialize Groq client
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

// 🔥 NEW: Store conversation context per workspace
const conversationContext = new Map();

function getContext(workspaceId) {
    if (!conversationContext.has(workspaceId)) {
        conversationContext.set(workspaceId, {
            lastTopic: null,
            lastQuestion: null,
            lastBotMessage: null,
            followUpCount: 0,
        });
    }
    return conversationContext.get(workspaceId);
}

function updateContext(workspaceId, botMessage, userQuestion, topic) {
    const ctx = getContext(workspaceId);
    ctx.lastBotMessage = botMessage;
    ctx.lastQuestion = userQuestion;
    if (topic) ctx.lastTopic = topic;
    ctx.followUpCount += 1;
    // Reset if too many follow-ups (avoid infinite loops)
    if (ctx.followUpCount > 5) {
        ctx.followUpCount = 0;
    }
}

function resetContext(workspaceId) {
    conversationContext.set(workspaceId, {
        lastTopic: null,
        lastQuestion: null,
        lastBotMessage: null,
        followUpCount: 0,
    });
}

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

        const threshold = 0.2;
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

/**
 * 🔥 NEW: Detect if this is a follow-up answer (yes/no/etc.)
 */
function detectFollowUp(queryText, context) {
    const lower = queryText.toLowerCase().trim();

    // Simple yes/no/more responses
    const followUpPatterns = [
        { pattern: /^yes\b|^yeah\b|^yep\b|^sure\b|^okay\b|^ok\b|^go ahead\b|^please\b/, action: 'affirmative' },
        { pattern: /^no\b|^nope\b|^nah\b|^not really\b|^no thanks\b/, action: 'negative' },
        { pattern: /^tell me more\b|^more\b|^elaborate\b|^explain\b/, action: 'more' },
        { pattern: /^another\b|^next\b|^another one\b|^more\b/, action: 'another' },
        { pattern: /^what about\b|^and\b/, action: 'related' },
    ];

    // Check if user is asking about the last topic
    const askAboutLastTopic = [
        'that', 'this', 'it', 'those', 'them', 'these', 'such', 'like that',
        'tell me more', 'elaborate', 'explain', 'go on', 'continue'
    ];

    // Check if the query is very short (likely a follow-up)
    const isShortQuery = queryText.split(' ').length <= 3;

    // Check if it contains the last topic
    if (context.lastTopic && queryText.toLowerCase().includes(context.lastTopic.toLowerCase())) {
        return { isFollowUp: true, action: 'related', followUpType: 'topic_mention' };
    }

    // Check if it's a short query that matches follow-up patterns
    if (isShortQuery) {
        for (const { pattern, action } of followUpPatterns) {
            if (pattern.test(lower)) {
                return { isFollowUp: true, action, followUpType: 'pattern_match' };
            }
        }
    }

    // Check if it's asking about the last topic indirectly
    if (context.lastTopic && askAboutLastTopic.some(word => lower.includes(word))) {
        return { isFollowUp: true, action: 'related', followUpType: 'indirect' };
    }

    return { isFollowUp: false };
}

/**
 * 🔥 NEW: Generate a follow-up response based on context
 */
function generateFollowUpResponse(queryText, context, relevantChunks) {
    const ctx = getContext(context.workspaceId);
    const lastBotMsg = ctx.lastBotMessage || '';
    const lastQuestion = ctx.lastQuestion || '';

    // If the user said "yes" to a case study
    if (lastBotMsg.includes('case study') || lastBotMsg.includes('success story')) {
        // If we have case study data
        const caseStudyChunks = relevantChunks.filter(c =>
            c.source_type === 'case_study' || c.source_title?.includes('Case')
        );

        if (caseStudyChunks.length > 1) {
            // Get a different case study than the one just shown
            const currentIndex = ctx.followUpCount % caseStudyChunks.length;
            const nextChunk = caseStudyChunks[currentIndex];
            return `Here's another case study:\n\n${nextChunk.content.substring(0, 300)}...\n\nWould you like me to share another one, or would you prefer to hear about our services or pricing?`;
        }

        return "I've shared all our case studies! Would you like to learn about our services or pricing instead?";
    }

    // If the user said "tell me more" or "elaborate"
    if (['more', 'elaborate', 'explain'].some(word => queryText.toLowerCase().includes(word))) {
        if (relevantChunks.length > 0) {
            // Use the same topic but dig deeper
            const chunk = relevantChunks[0];
            return `Let me elaborate further:\n\n${chunk.content}\n\nIs there anything specific about this you'd like me to expand on?`;
        }
    }

    // Generic follow-up response using LLM
    return null;
}

export async function generateRAGAnswer(queryText, workspaceId, conversationHistory = []) {
    try {
        const lowerQuery = queryText.toLowerCase().trim();
        const ctx = getContext(workspaceId);

        // 🔥 NEW: Check for greetings first
        const greetings = ['hi', 'hello', 'hey', 'howdy', 'good morning', 'good afternoon', 'good evening', 'whats up', 'how are you'];
        if (greetings.some(g => lowerQuery === g || lowerQuery.startsWith(g + ' '))) {
            resetContext(workspaceId);
            return {
                answer: "Hello there! 👋 How can I assist you with our products or services today? Feel free to ask me about pricing, features, support, or our case studies.",
                sources: [],
                confidence: 'high',
                hasKnowledge: true,
            };
        }

        // 🔥 NEW: Detect if this is a follow-up
        const followUp = detectFollowUp(queryText, ctx);
        console.log('🔍 Follow-up detection:', followUp);

        // First, search for relevant chunks
        let relevantChunks = await searchKnowledgeBase(queryText, workspaceId);
        console.log('📚 Found chunks:', relevantChunks.length);

        // 🔥 NEW: If it's a follow-up and we have context
        if (followUp.isFollowUp && ctx.lastTopic) {
            // Try to respond using context
            const followUpResponse = generateFollowUpResponse(queryText, { workspaceId }, relevantChunks);
            if (followUpResponse) {
                updateContext(workspaceId, followUpResponse, queryText, ctx.lastTopic);
                return {
                    answer: followUpResponse,
                    sources: [],
                    confidence: 'high',
                    hasKnowledge: true,
                };
            }
        }

        // If no relevant chunks, check if it's a follow-up asking about the last topic
        if (relevantChunks.length === 0) {
            console.log('❌ No relevant knowledge found');

            // 🔥 NEW: If it's a follow-up with no results, ask clarifying question
            if (followUp.isFollowUp && ctx.lastTopic) {
                const response = `I understand you're asking about "${ctx.lastTopic}". Could you please be more specific? For example, are you asking about pricing, features, or something else related to ${ctx.lastTopic}?`;
                updateContext(workspaceId, response, queryText, ctx.lastTopic);
                return {
                    answer: response,
                    sources: [],
                    confidence: 'medium',
                    hasKnowledge: false,
                };
            }

            return {
                answer: "I'm sorry, I don't have information about that. I'm specifically trained on our company's products, services, pricing, and policies. Could you please ask something related to those? For example: 'What services do you offer?' or 'What is your pricing?' or 'Tell me about your case studies.'",
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

        // 🔥 NEW: Add context about previous conversation if available
        let conversationContextPrompt = '';
        if (ctx.lastTopic) {
            conversationContextPrompt = `
**Previous conversation context:**
- You were just discussing: "${ctx.lastTopic}"
- Your last message was: "${ctx.lastBotMessage || 'No previous message'}"
- The user is now asking: "${queryText}"

If the user's question is a follow-up (like "yes", "no", "tell me more"), respond appropriately based on what you were just discussing.`;
        }

        // Use Groq to generate a real AI answer
        try {
            const completion = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
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
6. If the user says "yes" or "no" to a follow-up question, understand what they're agreeing to.

${conversationContextPrompt}

**Context:**
${context}`
                    },
                    {
                        role: 'user',
                        content: queryText
                    }
                ],
                temperature: 0.3,
                max_tokens: 250,
            });

            const answer = completion.choices[0]?.message?.content ||
                `Based on our knowledge base: ${relevantChunks[0].content.substring(0, 200)}...`;

            // 🔥 Update context for next turn
            updateContext(workspaceId, answer, queryText, sources[0]?.title || 'general');

            return {
                answer: answer,
                sources: sources,
                confidence: relevantChunks.length >= 3 ? 'high' : 'medium',
                hasKnowledge: true,
            };

        } catch (llmError) {
            console.warn('⚠️ Groq API error, using fallback:', llmError.message);

            const fallbackAnswer = `Based on our knowledge base, I found this information: "${relevantChunks[0].content.substring(0, 200)}..." Would you like more details about this?`;

            updateContext(workspaceId, fallbackAnswer, queryText, sources[0]?.title || 'general');

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