import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const { text, model } = await request.json();
        const HF_TOKEN = process.env.HF_TOKEN || process.env.NEXT_PUBLIC_HF_TOKEN;

        if (!HF_TOKEN) {
            console.error('❌ Missing Hugging Face token');
            return NextResponse.json({ error: 'Missing token' }, { status: 500 });
        }

        const modelName = model || 'facebook/mms-tts-eng';
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