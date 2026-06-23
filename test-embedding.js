import { generateEmbedding } from './app/lib/embeddings.js';

async function testEmbedding() {
    try {
        console.log('🧠 Testing LOCAL embedding generation...');
        console.log('💡 This will download the model the first time (approx. 80MB).');
        console.log('⏳ Please wait 10-20 seconds...\n');

        const testText = 'Our pricing starts at $29 per month for the Starter plan.';
        const embedding = await generateEmbedding(testText);

        console.log('\n✅ Embedding generated successfully!');
        console.log('📊 Dimensions:', embedding.length);
        console.log('📊 First 5 values:', embedding.slice(0, 5).map(v => v.toFixed(4)));
        console.log('🎉 Local embeddings are working perfectly!');
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testEmbedding();