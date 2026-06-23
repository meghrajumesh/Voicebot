import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '.env.local') });

async function addSampleData() {
    try {
        // Use a proper UUID format
        const workspaceId = '11111111-1111-1111-1111-111111111111';

        // Sample company data about a software company
        const companyData = `
      Our company, TechVedhas, is a leading software development and digital marketing agency.
      
      We specialize in building custom web applications, mobile apps, and AI automation solutions.
      
      Our services include:
      - Custom Web Development (React, Next.js, Node.js)
      - Mobile App Development (React Native, Flutter)
      - AI & Machine Learning solutions
      - Digital Marketing and SEO
      - CRM and ERP systems
      
      Pricing:
      - Starter Plan: $29/month - Basic chatbot and lead capture
      - Growth Plan: $79/month - Voice AI, advanced analytics
      - Pro Plan: $199/month - Full CRM integrations, custom workflows
      - Enterprise: Custom pricing for large organizations
      
      We offer a 14-day free trial for all plans.
      
      Our clients include startups, mid-sized companies, and enterprises across India and the US.
      
      We have a team of 50+ developers, designers, and marketing experts.
      
      Our development process follows Agile methodology with bi-weekly sprints.
      
      We provide 24/7 support for enterprise clients.
      
      Contact us at sales@techvedhas.com or call +91-XXXXXXXXXX for a free consultation.
    `;

        console.log('📚 Adding sample data for workspace:', workspaceId);
        console.log('📝 Data length:', companyData.length);

        // Call the training API
        const response = await fetch('http://localhost:3000/api/training', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                workspaceId: workspaceId,
                content: companyData,
                sourceType: 'website',
                sourceTitle: 'Company Overview & Pricing',
                sourceUrl: 'https://techvedhas.com/about',
                metadata: {
                    category: 'company_info',
                    priority: 'high'
                }
            }),
        });

        const result = await response.json();

        if (response.ok) {
            console.log('✅ Success!');
            console.log('📊 Chunks inserted:', result.chunksInserted);
            console.log('📊 Total chunks:', result.totalChunks);
            console.log('🎉 Your knowledge base is ready!');
        } else {
            console.error('❌ Failed:', result.error);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

addSampleData();