"use client";

import React, { useState, useRef, useEffect } from 'react';

export default function VoiceChatWidget({ workspaceId = '11111111-1111-1111-1111-111111111111' }) {
    const [messages, setMessages] = useState([
        { id: 1, sender: 'bot', text: '👋 Hi! I\'m your AI assistant. Ask me anything about our products and services.' }
    ]);
    const [inputText, setInputText] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isListening, setIsListening] = useState(false);

    // 🔥 Voice output state
    const [voiceEnabled, setVoiceEnabled] = useState(true);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

    const chatAreaRef = useRef(null);
    const inputRef = useRef(null);
    const recognitionRef = useRef(null);
    const audioRef = useRef(null);

    useEffect(() => {
        if (chatAreaRef.current) {
            chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
        }
    }, [messages]);

    const addMessage = (text, sender) => {
        setMessages((prev) => [...prev, { id: Date.now(), sender, text }]);
    };

    const getTimestamp = () => {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    };

    // 🔥 NEW: Speak using Hugging Face TTS via our API
    const speakText = async (text) => {
        if (!voiceEnabled) return;
        if (!text || text.trim().length === 0) return;

        // Stop any current audio
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }

        setIsGeneratingAudio(true);
        setIsSpeaking(true);

        try {
            console.log('🎤 Calling /api/tts for voice generation...');

            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text,
                    model: 'facebook/mms-tts-eng' // HD voice
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.warn('⚠️ TTS API error:', errorData.error);
                // Fallback to browser TTS if API fails
                speakWithBrowserTTS(text);
                return;
            }

            const audioBlob = await response.blob();

            if (!audioBlob || audioBlob.size === 0) {
                console.warn('⚠️ Empty audio received, falling back to browser TTS');
                speakWithBrowserTTS(text);
                return;
            }

            console.log('✅ Audio generated:', audioBlob.size, 'bytes');

            const url = URL.createObjectURL(audioBlob);
            const audio = new Audio(url);
            audioRef.current = audio;

            audio.onplay = () => {
                console.log('🔊 Audio playing...');
                setIsGeneratingAudio(false);
                setIsSpeaking(true);
            };
            audio.onended = () => {
                setIsSpeaking(false);
                setIsGeneratingAudio(false);
                URL.revokeObjectURL(url);
            };
            audio.onerror = (e) => {
                console.error('❌ Audio playback error:', e);
                setIsSpeaking(false);
                setIsGeneratingAudio(false);
                URL.revokeObjectURL(url);
                // Fallback to browser TTS
                speakWithBrowserTTS(text);
            };

            audio.play();

        } catch (error) {
            console.error('❌ TTS error:', error.message);
            setIsGeneratingAudio(false);
            setIsSpeaking(false);
            // Fallback to browser TTS
            speakWithBrowserTTS(text);
        }
    };

    // 🔥 Fallback: Browser TTS (if Hugging Face fails)
    const speakWithBrowserTTS = (text) => {
        if (!voiceEnabled) return;
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.95;
            utterance.pitch = 1.0;
            const voices = window.speechSynthesis.getVoices();
            const preferred = voices.find(v => v.name.includes('Google') || v.name.includes('Microsoft') || v.lang === 'en-US');
            if (preferred) utterance.voice = preferred;
            utterance.onstart = () => setIsSpeaking(true);
            utterance.onend = () => setIsSpeaking(false);
            utterance.onerror = () => setIsSpeaking(false);
            window.speechSynthesis.speak(utterance);
        }
    };

    // 🔥 Toggle voice on/off
    const toggleVoice = () => {
        setVoiceEnabled(prev => {
            const newState = !prev;
            if (!newState) {
                // Stop any ongoing audio
                if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current = null;
                }
                if (window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                }
                setIsSpeaking(false);
                setIsGeneratingAudio(false);
            }
            return newState;
        });
    };

    const handleSend = async () => {
        const text = inputText.trim();
        if (!text || isProcessing) return;
        setInputText('');
        setIsProcessing(true);
        addMessage(text, 'user');

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    workspaceId: workspaceId,
                    history: messages.map(m => `${m.sender}: ${m.text}`)
                }),
            });

            if (!response.ok) throw new Error('Failed to get response');

            const data = await response.json();
            addMessage(data.reply, 'bot');

            // 🔥 Speak the bot's reply using Hugging Face TTS
            if (voiceEnabled && data.reply) {
                await speakText(data.reply);
            }

        } catch (error) {
            console.error('❌ Chat error:', error);
            addMessage('Sorry, I encountered an error. Please try again.', 'bot');
        }

        setIsProcessing(false);
        inputRef.current?.focus();
    };

    const startVoiceInput = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('Voice input not supported. Please use Chrome or Edge.');
            return;
        }
        if (recognitionRef.current) {
            recognitionRef.current.abort();
            recognitionRef.current = null;
            setIsListening(false);
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = true;
        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => { setIsListening(false); recognitionRef.current = null; };
        recognition.onerror = () => { setIsListening(false); recognitionRef.current = null; };
        recognition.onresult = (event) => {
            let finalText = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) finalText = event.results[i][0].transcript;
            }
            if (finalText) {
                setInputText(finalText.charAt(0).toUpperCase() + finalText.slice(1));
                setTimeout(() => handleSend(), 100);
            }
        };
        recognitionRef.current = recognition;
        recognition.start();
    };

    return (
        <div className="flex flex-col w-full max-w-md mx-auto h-[600px] bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden font-sans">

            <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between bg-white flex-shrink-0 gap-2">
                <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <span className="text-blue-600 text-xl">💬</span> LeadPilot AI
                </h2>
                <div className="flex items-center gap-3">
                    {/* 🔥 Voice Toggle Button */}
                    <button
                        onClick={toggleVoice}
                        className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm transition-colors ${voiceEnabled
                                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                    >
                        <span>{voiceEnabled ? '🔊' : '🔇'}</span>
                        <span>{voiceEnabled ? 'Voice ON' : 'Voice OFF'}</span>
                    </button>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                        Workspace: {workspaceId.substring(0, 8)}...
                    </span>
                </div>
            </div>

            <div ref={chatAreaRef} className="flex-1 p-4 overflow-y-auto bg-slate-50/50 space-y-3">
                {messages.map((msg) => {
                    const isLatestBot = msg.sender === 'bot' && msg.id === messages[messages.length - 1]?.id;
                    return (
                        <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${msg.sender === 'user'
                                    ? 'bg-blue-600 text-white rounded-br-none'
                                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                                }`}>
                                {msg.text}
                                {/* 🔥 Show speaking indicator on bot messages */}
                                {msg.sender === 'bot' && isLatestBot && (isSpeaking || isGeneratingAudio) && voiceEnabled && (
                                    <div className="flex items-center gap-1 mt-1 text-xs text-blue-500">
                                        <span>🔊</span>
                                        <span>{isGeneratingAudio ? 'Generating audio...' : 'Speaking...'}</span>
                                    </div>
                                )}
                                <span className="text-[10px] opacity-50 block mt-1">
                                    {getTimestamp()}
                                </span>
                            </div>
                        </div>
                    );
                })}
                {isProcessing && (
                    <div className="flex justify-start">
                        <div className="bg-white border border-slate-200 px-5 py-3 rounded-2xl rounded-bl-none">
                            <div className="flex gap-1.5">
                                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.1s]"></span>
                                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0.1s]"></span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-4 bg-white border-t border-slate-100 flex items-end gap-2 flex-shrink-0">
                <div className="flex-1 flex items-center bg-slate-100 rounded-full px-4 py-1 focus-within:ring-2 focus-within:ring-blue-500 focus-within:bg-white transition-all">
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Ask about our products..."
                        className="flex-1 bg-transparent py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                        disabled={isProcessing}
                    />
                </div>
                <button
                    onClick={startVoiceInput}
                    className={`w-11 h-11 rounded-full flex items-center justify-center text-xl transition-all flex-shrink-0 ${isListening ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    disabled={isProcessing}
                >
                    🎙️
                </button>
                <button
                    onClick={handleSend}
                    disabled={isProcessing || !inputText.trim()}
                    className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl hover:bg-blue-700 transition-all disabled:opacity-50 disabled:pointer-events-none flex-shrink-0"
                >
                    ↑
                </button>
            </div>
        </div>
    );
}