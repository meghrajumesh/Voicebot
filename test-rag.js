import 'dotenv/config'; // <-- ADD THIS TO LOAD .env.local
import { searchKnowledgeBase, generateRAGAnswer } from './lib/rag.js';

// Test workspace ID (we'll create a real one later)
const TEST_WORKSPACE = '11111111-1111-1111-1111-111111111111';

async function testRAG() {
    try {
        // Check if DATABASE_URL is loaded
        if (!process.env.DATABASE_URL) {
            console.error('❌ DATABASE_URL is not set in .env.local');
            console.log('💡 Make sure you have DATABASE_URL=postgresql://... in .env.local');
            return;
        }

        console.log('🧪 Testing RAG Pipeline...\n');

        // Test 1: Search knowledge base
        console.log('--- Test 1: Search Knowledge Base ---');
        const results = await searchKnowledgeBase('What is your pricing?', TEST_WORKSPACE);
        console.log('📚 Results found:', results.length);

        if (results.length > 0) {
            console.log('📊 First result similarity:', results[0].similarity);
            console.log('📄 First result content:', results[0].content.substring(0, 100) + '...');
        }

        console.log('\n--- Test 2: Generate RAG Answer ---');
        const answer = await generateRAGAnswer('What is your pricing?', TEST_WORKSPACE);
        console.log('💬 Answer:', answer.answer);
        console.log('📊 Confidence:', answer.confidence);
        console.log('📚 Sources:', answer.sources.length);

        if (answer.sources.length > 0) {
            console.log('📄 First source:', answer.sources[0]);
        }

        console.log('\n✅ RAG tests completed!');
    } catch (error) {
        console.error('❌ RAG test failed:', error.message);
    }
}

testRAG();