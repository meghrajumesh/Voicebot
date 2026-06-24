import { query } from './lib/db.js';

async function testConnection() {
    try {
        const result = await query('SELECT NOW() as time');
        console.log('✅ Database connected! Time:', result.rows[0].time);
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
    }
}

testConnection();