import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '.env.local') });

const workspaceId = '11111111-1111-1111-1111-111111111111';
const API_URL = 'http://localhost:3000/api/training';

async function addData(content, title, type, url = null) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                workspaceId,
                content,
                sourceType: type,
                sourceTitle: title,
                sourceUrl: url,
                metadata: { category: type }
            }),
        });

        const result = await response.json();
        if (response.ok) {
            console.log(`✅ Added "${title}" - ${result.chunksInserted} chunks`);
        } else {
            console.error(`❌ Failed "${title}":`, result.error);
        }
    } catch (error) {
        console.error(`❌ Error "${title}":`, error.message);
    }
}

async function addAllData() {
    console.log('📚 Adding more data to RAG knowledge base...\n');

    // 1. Support & SLA
    await addData(
        `Our support team is available 24/7 for all enterprise clients.
    We offer email support with a response time of under 2 hours during business hours.
    For critical issues, we provide phone support and a dedicated account manager.
    Standard support hours are Monday to Friday, 9 AM to 6 PM IST.
    All support requests can be sent to support@techvedhas.com.
    We have a 99.9% uptime guarantee for all our hosted solutions.`,
        'Support & SLA',
        'support'
    );

    // 2. Data Security & Privacy
    await addData(
        `We take data security and privacy very seriously.
    All customer data is encrypted in transit using TLS 1.3 and at rest using AES-256.
    We are compliant with GDPR and CCPA regulations.
    We never share customer data with third parties without explicit consent.
    Our servers are hosted on AWS with SOC 2 compliance.
    We perform regular security audits and penetration testing.`,
        'Data Security & Privacy',
        'security'
    );

    // 3. Case Study / Success Stories
    await addData(
        `Case Study 1: A mid-sized e-commerce company used our AI chatbot to handle customer queries.
    They saw a 40% reduction in support tickets and a 25% increase in sales conversions.
    
    Case Study 2: A SaaS startup used our platform to automate lead qualification.
    They captured 3x more leads and reduced response time from 4 hours to 30 seconds.
    
    Case Study 3: A healthcare provider used our voice AI to handle appointment bookings.
    They reduced no-show rates by 35% and saved 20+ hours per week on administrative tasks.`,
        'Case Studies & Success Stories',
        'case_study'
    );

    // 4. Detailed Services Description
    await addData(
        `We offer end-to-end software development services.
    
    Web Development: We build custom web applications using React, Next.js, Vue.js, and Node.js.
    We have expertise in building e-commerce platforms, dashboards, and SaaS products.
    
    Mobile App Development: We build native and cross-platform mobile apps using React Native and Flutter.
    We have experience in building consumer apps, enterprise apps, and on-demand services.
    
    AI & Automation: We build custom AI solutions including chatbots, voice assistants, and workflow automation.
    We use OpenAI, Anthropic, and open-source models to build tailored solutions.
    
    Digital Marketing: We offer SEO, PPC, social media marketing, and content marketing services.
    We help businesses grow their online presence and generate qualified leads.`,
        'Our Services',
        'services'
    );

    // 5. FAQ
    await addData(
        `Frequently Asked Questions:
    
    Q: Do you offer a free trial?
    A: Yes, we offer a 14-day free trial for all our plans. No credit card required.
    
    Q: Can I cancel my subscription anytime?
    A: Yes, you can cancel your subscription anytime. No cancellation fees.
    
    Q: Do you provide custom development services?
    A: Yes, we offer custom development services for enterprises with unique requirements.
    
    Q: What is your refund policy?
    A: We offer a full refund within 7 days of purchase if you're not satisfied with our service.
    
    Q: Do you offer training and onboarding?
    A: Yes, we provide free onboarding sessions and training for all our clients.`,
        'FAQ',
        'faq'
    );

    console.log('\n✅ All data added successfully!');
    console.log('🎉 Your RAG knowledge base is now richer and more comprehensive.');
}

addAllData();