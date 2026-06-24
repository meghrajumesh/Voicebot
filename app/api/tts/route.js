import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit.js';

const MAX_TEXT_LENGTH = 2000;

export async function POST(request) {
    try {
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        const rl = rateLimit({ windowMs: 60_000, max: 20, key: `tts:${ip}` });
        if (!rl.allowed) {
            return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
        }

        const { text, model } = await request.json();

        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return NextResponse.json({ error: 'text is required and must be a non-empty string' }, { status: 400 });
        }
        if (text.length > MAX_TEXT_LENGTH) {
            return NextResponse.json({ error: `text must be under ${MAX_TEXT_LENGTH} characters` }, { status: 400 });
        }

        const HF_TOKEN = process.env.HF_TOKEN;
        if (!HF_TOKEN) {
            console.error('❌ Missing Hugging Face token');
            return NextResponse.json({ error: 'Server misconfigured: missing HF_TOKEN' }, { status: 500 });
        }

        const modelName = typeof model === 'string' ? model : 'facebook/mms-tts-eng';
        const modelUrl = `https://api-inference.huggingface.co/models/${modelName}`;

        console.log(`🔊 [Server] Generating speech with: ${modelName}`);

        const response = await fetch(modelUrl, {
            headers: {
                Authorization: `Bearer ${HF_TOKEN}`,
                'Content-Type': 'application/json',
            },
            method: 'POST',
            body: JSON.stringify({ inputs: text }),
            signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ [Server] HF API Error:`, errorText);
            return NextResponse.json({ error: errorText }, { status: response.status });
        }

        const audioBuffer = await response.arrayBuffer();
        console.log(`✅ [Server] Audio generated: ${audioBuffer.byteLength} bytes`);

        return new NextResponse(audioBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'audio/wav',
                'Content-Length': audioBuffer.byteLength.toString(),
            },
        });
    } catch (error) {
        console.error('❌ [Server] TTS Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}