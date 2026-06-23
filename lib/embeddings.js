import { pipeline } from '@xenova/transformers';

// This will cache the loaded model so it only loads once
let embeddingPipeline = null;

async function getEmbeddingPipeline() {
    if (!embeddingPipeline) {
        console.log('🧠 Loading free embedding model... (first time takes 10-20 seconds)');
        embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        console.log('✅ Model loaded and ready!');
    }
    return embeddingPipeline;
}

/**
 * Generate an embedding for a single text (FREE - runs locally)
 * @param {string} text - The text to embed
 * @returns {Promise<number[]>} - The embedding vector (384 numbers)
 */
export async function generateEmbedding(text) {
    try {
        if (!text || text.trim().length === 0) {
            throw new Error('Text is required for embedding');
        }

        console.log('🧠 Generating local embedding for text length:', text.length);

        const extractor = await getEmbeddingPipeline();
        const result = await extractor(text, {
            pooling: 'mean',      // Averages the token embeddings
            normalize: true       // Normalizes the vector (makes search more accurate)
        });

        // Convert the tensor to a regular array
        const embedding = Array.from(result.data);

        console.log('✅ Local embedding generated (dimensions:', embedding.length, ')');
        return embedding;
    } catch (error) {
        console.error('❌ Local embedding error:', error.message);
        throw error;
    }
}

/**
 * Generate embeddings for multiple texts (batch)
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
export async function generateEmbeddings(texts) {
    try {
        if (!texts || texts.length === 0) {
            throw new Error('At least one text is required for batch embedding');
        }

        console.log('🧠 Generating embeddings for', texts.length, 'texts (local)');

        // Process them one by one to avoid memory issues
        const embeddings = [];
        for (const text of texts) {
            const embedding = await generateEmbedding(text);
            embeddings.push(embedding);
        }

        console.log('✅ Batch embeddings generated (count:', embeddings.length, ')');
        return embeddings;
    } catch (error) {
        console.error('❌ Batch embedding error:', error.message);
        throw error;
    }
}