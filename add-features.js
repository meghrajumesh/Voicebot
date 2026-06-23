import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '.env.local') });

const workspaceId = '11111111-1111-1111-1111-111111111111';
const API_URL = 'http://localhost:3000/api/training';

async function addFeatures() {
    try {
        const content = `LeadPilot AI offers the following key features:

    1. AI Chatbot: Text-based lead conversion conversations. The chatbot answers customer questions 24/7 using your company's knowledge base.

    2. Voice AI Bot: Browser-based real-time voice conversations. Visitors can speak directly to the AI without installing any apps.

    3. Website Content Training: Automatically crawl your website and train the AI on your existing content. Supports home, about, services, pricing, and blog pages.

    4. Document Upload Training: Upload PDFs, Word docs, Excel sheets, and FAQs. The AI learns from your internal documents and product catalogs.

    5. Knowledge Base Management: Central hub to manage all content. Add FAQs, edit answers, pin priorities, and set restricted topics.

    6. Widget Builder: Fully customizable widget to match your brand. Change colors, fonts, logos, positions, and messaging in real-time.

    7. Lead Capture and Scoring: Automatically capture leads and assign scores (Hot, Warm, Cold). Capture name, email, phone, requirements, and budget.

    8. Meeting Booking: Integrated Calendly, Google Calendar, and manual callback requests. Book meetings directly from the chat widget.

    9. CRM Integrations: Connect with HubSpot, Zoho, Salesforce, Slack, and Webhooks. Sync leads directly to your CRM.

    10. Analytics Dashboard: Real-time analytics on conversations, leads, and performance. Track conversion rates and identify top questions.

    11. Multi-tenant Support: Serve multiple businesses from a single platform. Each business gets its own workspace with isolated data.

    12. Voice Toggle: Users can choose whether they want voice output or text-only replies. Perfect for quiet environments.`;

        console.log('📚 Adding Features data...');

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                workspaceId,
                content,
                sourceType: 'website',
                sourceTitle: 'Features & Capabilities',
                sourceUrl: 'https://leadpilot.ai/features',
                metadata: { category: 'features' }
            }),
        });

        const result = await response.json();
        if (response.ok) {
            console.log(`✅ Added Features - ${result.chunksInserted} chunks`);
            console.log('🎉 Now you can ask "What features do you offer?" and get a perfect answer!');
        } else {
            console.error('❌ Failed:', result.error);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

addFeatures();