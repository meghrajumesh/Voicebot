import { query } from './db.js';
import { generateEmbedding } from './embeddings.js';
import Groq from 'groq-sdk';

// Initialize Groq client
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

// ---------------------------------------------------------------------------
// Configurable parameters (override via environment variables)
// ---------------------------------------------------------------------------
const CONFIG = {
    SIMILARITY_THRESHOLD: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.2'),
    VECTOR_SEARCH_LIMIT: parseInt(process.env.VECTOR_SEARCH_LIMIT || '5', 10),
    GROQ_MODEL: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    CONTEXT_MAX_SIZE: parseInt(process.env.CONTEXT_MAX_SIZE || '1000', 10),
    GENERAL_MAX_TOKENS: parseInt(process.env.GENERAL_MAX_TOKENS || '200', 10),
    COMPANY_MAX_TOKENS: parseInt(process.env.COMPANY_MAX_TOKENS || '250', 10),
};

// ---------------------------------------------------------------------------
// Conversation context memory with LRU eviction
// ---------------------------------------------------------------------------
const conversationContext = new Map();
const contextKeyOrder = [];

function evictContextIfNeeded() {
    while (conversationContext.size >= CONFIG.CONTEXT_MAX_SIZE) {
        const oldest = contextKeyOrder.shift();
        conversationContext.delete(oldest);
    }
}

function getContext(workspaceId) {
    if (!conversationContext.has(workspaceId)) {
        evictContextIfNeeded();
        conversationContext.set(workspaceId, {
            lastTopic: null,
            lastQuestion: null,
            lastBotMessage: null,
            followUpCount: 0,
        });
        contextKeyOrder.push(workspaceId);
    }
    return conversationContext.get(workspaceId);
}

function updateContext(workspaceId, botMessage, userQuestion, topic) {
    const ctx = getContext(workspaceId);
    ctx.lastBotMessage = botMessage;
    ctx.lastQuestion = userQuestion;
    if (topic) ctx.lastTopic = topic;
    ctx.followUpCount += 1;
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

export async function searchKnowledgeBase(queryText, workspaceId, limit) {
    const searchLimit = limit ?? CONFIG.VECTOR_SEARCH_LIMIT;
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
            [embeddingString, workspaceId, searchLimit]
        );

        const { SIMILARITY_THRESHOLD } = CONFIG;
        const filtered = result.rows.filter(row => row.similarity >= SIMILARITY_THRESHOLD);
        console.log(`📚 Found ${filtered.length} relevant chunks out of ${result.rows.length} (threshold: ${SIMILARITY_THRESHOLD})`);

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
 * 🔥 NEW: Check if a query is a greeting
 */
function isGreeting(queryText) {
    const lower = queryText.toLowerCase().trim();
    const greetings = ['hi', 'hello', 'hey', 'howdy', 'good morning', 'good afternoon', 'good evening', 'whats up', 'how are you'];
    return greetings.some(g => lower === g || lower.startsWith(g + ' '));
}

/**
 * 🔥 NEW: Generate a greeting response
 */
function generateGreeting() {
    const greetings = [
        "Hello there! 👋 I'm LeadPilot AI, your friendly business assistant. I'm here to help you with anything about our products, services, pricing, and more! What can I do for you today?",
        "Hi there! 👋 I'm LeadPilot AI. I can answer questions about our company, products, services, pricing, and case studies. Ask me anything!",
        "Hey! 👋 I'm LeadPilot AI. Whether you want to know about our features, pricing, or success stories, I'm here to help. What's on your mind?",
        "Hello! 👋 I'm your AI assistant. I'm trained on our company's data and can help with questions about services, pricing, case studies, and more. How can I assist you?",
        "Hi! 👋 I'm LeadPilot AI. I have knowledge about our products, services, pricing, case studies, and general business info. What would you like to know?"
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
}

function isGeneralKnowledgeQuery(queryText) {
    const lower = queryText.toLowerCase();

    const generalPatterns = [
        'what are you',
        'who are you',
        'who made you',
        'who created you',
        'what is ai',
        'what is artificial intelligence',
        'tell me a joke',
        'tell me something interesting',
        'how does ai work',
        'what is machine learning',
        'what is the meaning of life',
        'tell me a fun fact',
        'what is the weather',
        'how are you',
        'what do you think',
        'do you have feelings',
        'are you sentient',
        'can you think',
        'what is consciousness',
        'who is your creator',
        'what can you do',
        'what is your purpose',
    ];

    for (const pattern of generalPatterns) {
        if (lower.includes(pattern) || lower === pattern) {
            return true;
        }
    }

    return false;
}

/**
 * 🔥 NEW: Generate a general knowledge response using Groq
 */
async function generateGeneralKnowledge(queryText, workspaceId, conversationHistory = []) {
    console.log('🧠 Generating general knowledge response...');

    const ctx = getContext(workspaceId);

    const historyMessages = conversationHistory
        .filter(h => h.role === 'user' || h.role === 'assistant')
        .slice(-6);

    try {
        const completion = await groq.chat.completions.create({
            model: CONFIG.GROQ_MODEL,
            messages: [
                {
                    role: 'system',
                    content: `You are LeadPilot AI, a friendly and intelligent AI assistant.

**Your Personality:**
- You are helpful, conversational, and engaging.
- You have general knowledge about the world.
- You can answer questions about AI, technology, and more.
- You can also help with company-specific questions if the user asks.

**Important Rules:**
- Be friendly and approachable.
- Keep responses concise (2-3 sentences for simple questions).
- If the user asks about the company (LeadPilot AI), you can mention that you're an AI assistant for LeadPilot AI.
- Don't claim to be human or sentient.
- If the user asks a question you truly can't answer, politely say you don't know.

**Conversation Context:**
${ctx.lastBotMessage ? `- You just said: "${ctx.lastBotMessage}"` : '- No previous conversation'}
${ctx.lastQuestion ? `- User just asked: "${ctx.lastQuestion}"` : '- No previous question'}
- Current user question: "${queryText}"

If this is a follow-up question, respond appropriately based on what you just discussed.`
                },
                ...historyMessages,
                {
                    role: 'user',
                    content: queryText
                }
            ],
            temperature: 0.7,
            max_tokens: CONFIG.GENERAL_MAX_TOKENS,
        });

        const answer = completion.choices[0]?.message?.content ||
            "That's a great question! I'm LeadPilot AI, your business assistant. Is there anything specific about our company or services you'd like to know?";

        return answer;
    } catch (error) {
        console.error('❌ General knowledge error:', error.message);
        return "I'm your AI assistant! I'm here to help with questions about our company, products, and services. What would you like to know?";
    }
}

/**
 * 🔥 NEW: Detect if this is a follow-up answer (yes/no/etc.)
 */
function detectFollowUp(queryText, context) {
    const lower = queryText.toLowerCase().trim();

    const followUpPatterns = [
        { pattern: /^yes\b|^yeah\b|^yep\b|^sure\b|^okay\b|^ok\b|^go ahead\b|^please\b/, action: 'affirmative' },
        { pattern: /^no\b|^nope\b|^nah\b|^not really\b|^no thanks\b/, action: 'negative' },
        { pattern: /^tell me more\b|^more\b|^elaborate\b|^explain\b/, action: 'more' },
        { pattern: /^another\b|^next\b|^another one\b|^more\b/, action: 'another' },
        { pattern: /^what about\b|^and\b/, action: 'related' },
    ];

    const askAboutLastTopic = [
        'that', 'this', 'it', 'those', 'them', 'these', 'such', 'like that',
        'tell me more', 'elaborate', 'explain', 'go on', 'continue'
    ];

    const isShortQuery = queryText.split(' ').length <= 3;

    if (context.lastTopic && queryText.toLowerCase().includes(context.lastTopic.toLowerCase())) {
        return { isFollowUp: true, action: 'related', followUpType: 'topic_mention' };
    }

    if (isShortQuery) {
        for (const { pattern, action } of followUpPatterns) {
            if (pattern.test(lower)) {
                return { isFollowUp: true, action, followUpType: 'pattern_match' };
            }
        }
    }

    if (context.lastTopic && askAboutLastTopic.some(word => lower.includes(word))) {
        return { isFollowUp: true, action: 'related', followUpType: 'indirect' };
    }

    return { isFollowUp: false };
}

/**
 * 🔥 NEW: Generate follow-up response based on context
 */
function generateFollowUpResponse(queryText, context, relevantChunks) {
    const ctx = getContext(context.workspaceId);
    const lastBotMsg = ctx.lastBotMessage || '';
    const lower = queryText.toLowerCase();

    // If the user said "yes" to a case study
    if (lastBotMsg.includes('case study') || lastBotMsg.includes('success story')) {
        const caseStudyChunks = relevantChunks.filter(c =>
            c.source_type === 'case_study' || c.source_title?.includes('Case')
        );

        if (caseStudyChunks.length > 1) {
            const currentIndex = ctx.followUpCount % caseStudyChunks.length;
            const nextChunk = caseStudyChunks[currentIndex];
            return `Here's another case study:\n\n${nextChunk.content.substring(0, 300)}...\n\nWould you like me to share another one, or would you prefer to hear about our services or pricing?`;
        }

        return "I've shared all our case studies! Would you like to learn about our services or pricing instead?";
    }

    if (['more', 'elaborate', 'explain'].some(word => lower.includes(word))) {
        if (relevantChunks.length > 0) {
            const chunk = relevantChunks[0];
            return `Let me elaborate further:\n\n${chunk.content}\n\nIs there anything specific about this you'd like me to expand on?`;
        }
    }

    return null;
}

/**
 * 🔥 MAIN: Generate RAG answer with hybrid intelligence
 */
export async function generateRAGAnswer(queryText, workspaceId, conversationHistory = []) {
    try {
        const lowerQuery = queryText.toLowerCase().trim();
        const ctx = getContext(workspaceId);

        const historyMessages = conversationHistory
            .filter(h => h.role === 'user' || h.role === 'assistant')
            .slice(-6);

        // ============================================================
        // PHASE 1: Check for Greetings
        // ============================================================
        if (isGreeting(queryText)) {
            resetContext(workspaceId);
            const greeting = generateGreeting();
            updateContext(workspaceId, greeting, queryText, 'greeting');
            return {
                answer: greeting,
                sources: [],
                confidence: 'high',
                hasKnowledge: true,
                type: 'greeting',
            };
        }

        // ============================================================
        // PHASE 2: Check for General Knowledge (non-company questions)
        // ============================================================
        if (isGeneralKnowledgeQuery(queryText)) {
            const generalAnswer = await generateGeneralKnowledge(queryText, workspaceId, conversationHistory);
            updateContext(workspaceId, generalAnswer, queryText, 'general');
            return {
                answer: generalAnswer,
                sources: [],
                confidence: 'high',
                hasKnowledge: true,
                type: 'general',
            };
        }

        // ============================================================
        // PHASE 3: Search Company Knowledge Base
        // ============================================================
        console.log('🤖 Generating RAG answer for:', queryText.substring(0, 50) + '...');
        let relevantChunks = await searchKnowledgeBase(queryText, workspaceId);

        // ============================================================
        // PHASE 4: Check for Follow-ups (with context)
        // ============================================================
        const followUp = detectFollowUp(queryText, ctx);
        console.log('🔍 Follow-up detection:', followUp);

        if (followUp.isFollowUp && ctx.lastTopic) {
            const followUpResponse = generateFollowUpResponse(queryText, { workspaceId }, relevantChunks);
            if (followUpResponse) {
                updateContext(workspaceId, followUpResponse, queryText, ctx.lastTopic);
                return {
                    answer: followUpResponse,
                    sources: [],
                    confidence: 'high',
                    hasKnowledge: true,
                    type: 'followup',
                };
            }
        }

        // ============================================================
        // PHASE 5: If No Company Data Found, Use General Knowledge
        // ============================================================
        if (relevantChunks.length === 0) {
            console.log('❌ No relevant company knowledge found, switching to general knowledge...');

            if (followUp.isFollowUp && ctx.lastTopic) {
                const response = `I understand you're asking about "${ctx.lastTopic}". Could you please be more specific? For example, are you asking about pricing, features, or something else related to ${ctx.lastTopic}?`;
                updateContext(workspaceId, response, queryText, ctx.lastTopic);
                return {
                    answer: response,
                    sources: [],
                    confidence: 'medium',
                    hasKnowledge: false,
                    type: 'clarification',
                };
            }

            const generalAnswer = await generateGeneralKnowledge(queryText, workspaceId, conversationHistory);
            updateContext(workspaceId, generalAnswer, queryText, 'general');
            return {
                answer: generalAnswer,
                sources: [],
                confidence: 'high',
                hasKnowledge: true,
                type: 'general',
            };
        }

        // ============================================================
        // PHASE 6: Build Context and Generate Company-Specific Answer
        // ============================================================
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

        let conversationContextPrompt = '';
        if (ctx.lastTopic && ctx.lastTopic !== 'general') {
            conversationContextPrompt = `
**Previous conversation context:**
- You were just discussing: "${ctx.lastTopic}"
- Your last message was: "${ctx.lastBotMessage || 'No previous message'}"
- The user is now asking: "${queryText}"

If the user's question is a follow-up (like "yes", "no", "tell me more"), respond appropriately based on what you were just discussing.`;
        }

        // ============================================================
        // PHASE 7: Use Groq with Company Context
        // ============================================================
        try {
            const completion = await groq.chat.completions.create({
                model: CONFIG.GROQ_MODEL,
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
                    ...historyMessages,
                    {
                        role: 'user',
                        content: queryText
                    }
                ],
                temperature: 0.3,
                max_tokens: CONFIG.COMPANY_MAX_TOKENS,
            });

            const answer = completion.choices[0]?.message?.content ||
                `Based on our knowledge base: ${relevantChunks[0].content.substring(0, 200)}...`;

            // Update context for next turn
            updateContext(workspaceId, answer, queryText, sources[0]?.title || 'company_data');

            return {
                answer: answer,
                sources: sources,
                confidence: relevantChunks.length >= 3 ? 'high' : 'medium',
                hasKnowledge: true,
                type: 'company',
            };

        } catch (llmError) {
            console.warn('⚠️ Groq API error, using fallback:', llmError.message);

            const fallbackAnswer = `Based on our knowledge base, I found this information: "${relevantChunks[0].content.substring(0, 200)}..." Would you like more details about this?`;

            updateContext(workspaceId, fallbackAnswer, queryText, sources[0]?.title || 'company_data');

            return {
                answer: fallbackAnswer,
                sources: sources,
                confidence: 'medium',
                hasKnowledge: true,
                type: 'fallback',
            };
        }

    } catch (error) {
        console.error('❌ RAG generation error:', error.message);
        throw error;
    }
}