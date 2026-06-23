import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '.env.local') });

async function testChatAPI() {
    try {
        const workspaceId = '11111111-1111-1111-1111-111111111111';
        const message = 'What is your pricing?';

        console.log('💬 Sending:', message);
        console.log('🏢 Workspace:', workspaceId);
        console.log('🌐 Calling: http://localhost:3000/api/chat');

        const response = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, workspaceId }),
        });

        console.log('📡 Response status:', response.status);

        const data = await response.json();

        console.log('\n✅ Response:');
        console.log('📝 Reply:', data.reply);
        console.log('📚 Sources:', data.sources?.length || 0);
        if (data.sources && data.sources.length > 0) {
            console.log('📄 First source:', data.sources[0].title, `(${data.sources[0].similarity}%)`);
        }
        console.log('📊 Confidence:', data.confidence);

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('💡 Make sure your Next.js server is running on http://localhost:3000');
    }
}

testChatAPI();