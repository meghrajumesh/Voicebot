"use client";

import React, { useState, useRef, useEffect } from 'react';

let nextId = 1;

export default function VoiceChatWidget({ workspaceId }) {
    const [messages, setMessages] = useState([
        { id: nextId++, sender: 'bot', text: '👋 Hi! I\'m your AI assistant. Ask me anything about our products and services.' }
    ]);
    const [inputText, setInputText] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

    const chatAreaRef = useRef(null);
    const inputRef = useRef(null);
    const recognitionRef = useRef(null);
    const audioRef = useRef(null);
    const abortRef = useRef(null);
    const usedVoiceRef = useRef(false);
    const [cachedVoice, setCachedVoice] = useState(null);

    useEffect(() => {
        if (chatAreaRef.current) {
            chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
        }
    }, [messages]);

    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch (e) { /* ignore */ }
                recognitionRef.current = null;
            }
            if (abortRef.current) {
                try { abortRef.current.abort(); } catch (e) { /* ignore */ }
                abortRef.current = null;
            }
            if (window.speechSynthesis) {
                try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
            }
        };
    }, []);

    useEffect(() => {
        const loadVoices = () => {
            if (!window.speechSynthesis) return;
            const voices = window.speechSynthesis.getVoices();

            const priorityList = [
                'Google UK English Female',
                'Google UK English Male',
                'Google US English',
                'Microsoft Zira',
                'Microsoft David',
                'Samantha',
                'Alex',
                'Karen',
            ];

            let selected = null;
            for (const name of priorityList) {
                const found = voices.find(v => v.name.includes(name));
                if (found) { selected = found; break; }
            }
            if (!selected) selected = voices.find(v => v.lang === 'en-US') || voices[0];
            if (selected) setCachedVoice(selected);
        };

        loadVoices();
        if (window.speechSynthesis) {
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }
        return () => {
            if (window.speechSynthesis) {
                window.speechSynthesis.onvoiceschanged = null;
            }
        };
    }, []);

    const addMessage = (text, sender) => {
        setMessages((prev) => [...prev, { id: nextId++, sender, text }]);
    };

    const getTimestamp = () => {
        const now = new Date();
        return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    };

    const speakWithBrowserTTS = (text) => {
        if (!text || text.trim().length === 0) return;
        if (!window.speechSynthesis) return;

        try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        let voice = null;
        let voices = [];
        try { voices = window.speechSynthesis.getVoices(); } catch (e) { /* ignore */ }

        if (cachedVoice && voices.some(v => v.voiceURI === cachedVoice.voiceURI)) {
            voice = cachedVoice;
        }
        if (!voice) {
            const priority = ['Google UK English Female', 'Google UK English Male', 'Google US English'];
            for (const name of priority) {
                const f = voices.find(v => v.name.includes(name));
                if (f) { voice = f; break; }
            }
            if (!voice) voice = voices.find(v => v.lang === 'en-US') || voices[0];
        }
        if (voice) utterance.voice = voice;

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);

        setTimeout(() => {
            try { window.speechSynthesis.speak(utterance); } catch (e) { setIsSpeaking(false); }
        }, 50);
    };

    const speakText = async (text) => {
        if (!text || text.trim().length === 0) return;

        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }

        setIsGeneratingAudio(true);
        setIsSpeaking(true);

        try {
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, model: 'facebook/mms-tts-eng' }),
            });

            if (!response.ok) {
                setIsGeneratingAudio(false);
                speakWithBrowserTTS(text);
                return;
            }

            const audioBlob = await response.blob();
            if (!audioBlob || audioBlob.size === 0) {
                setIsGeneratingAudio(false);
                speakWithBrowserTTS(text);
                return;
            }

            const url = URL.createObjectURL(audioBlob);
            const audio = new Audio(url);
            audioRef.current = audio;

            audio.onplay = () => {
                setIsGeneratingAudio(false);
                setIsSpeaking(true);
            };
            audio.onended = () => {
                setIsSpeaking(false);
                setIsGeneratingAudio(false);
                URL.revokeObjectURL(url);
            };
            audio.onerror = () => {
                setIsSpeaking(false);
                setIsGeneratingAudio(false);
                URL.revokeObjectURL(url);
                speakWithBrowserTTS(text);
            };

            audio.play();
        } catch (error) {
            setIsGeneratingAudio(false);
            setIsSpeaking(false);
            speakWithBrowserTTS(text);
        }
    };

    const handleSend = async () => {
        const text = inputText.trim();
        if (!text || isProcessing) return;

        const isVoice = usedVoiceRef.current;
        usedVoiceRef.current = false;

        setInputText('');
        setIsProcessing(true);
        addMessage(text, 'user');

        abortRef.current = new AbortController();

        try {
            const history = messages.map(m => ({
                role: m.sender === 'user' ? 'user' : 'assistant',
                content: m.text,
            }));

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, workspaceId, history }),
                signal: abortRef.current.signal,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to get response');
            }

            const data = await response.json();
            const botReply = data.reply || "Sorry, I didn't understand that.";

            addMessage(botReply, 'bot');

            if (isVoice && botReply) {
                await speakText(botReply);
            }
        } catch (error) {
            if (error.name === 'AbortError') return;
            addMessage('Sorry, I encountered an error. Please try again.', 'bot');
        }

        setIsProcessing(false);
        abortRef.current = null;
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
        recognition.onend = () => {
            setIsListening(false);
            recognitionRef.current = null;
        };
        recognition.onerror = () => {
            setIsListening(false);
            recognitionRef.current = null;
        };
        recognition.onresult = (event) => {
            let finalText = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    finalText = event.results[i][0].transcript;
                }
            }
            if (finalText) {
                setInputText(finalText.charAt(0).toUpperCase() + finalText.slice(1));
                usedVoiceRef.current = true;
                setTimeout(() => handleSend(), 100);
            }
        };

        recognitionRef.current = recognition;
        recognition.start();
    };

    return (
        <div className="flex flex-col w-full max-w-md mx-auto h-[600px] bg-white rounded-2xl shadow-xl border border-blue-200 overflow-hidden font-sans">
            {/* HEADER */}
            <div className="px-5 py-4 border-b border-blue-100 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700 flex-shrink-0">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <span className="text-white">💬</span> LeadPilot AI
                </h2>
                <span className="text-[11px] text-blue-200 bg-blue-500/30 px-2.5 py-1 rounded-full">
                    {workspaceId?.substring(0, 8)}...
                </span>
            </div>

            {/* CHAT MESSAGES */}
            <div ref={chatAreaRef} className="flex-1 px-4 py-4 overflow-y-auto bg-blue-50/30 space-y-3">
                {messages.map((msg) => {
                    const isUser = msg.sender === 'user';
                    const isLatestBot = !isUser && msg.id === messages[messages.length - 1]?.id;
                    const showAudio = !isUser && isLatestBot && (isSpeaking || isGeneratingAudio);
                    return (
                        <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[78%] px-4 py-2.5 text-sm shadow-sm ${isUser
                                ? 'bg-blue-600 text-white rounded-xl rounded-br-sm'
                                : 'bg-white border border-blue-100 text-slate-800 rounded-xl rounded-bl-sm'
                                }`}>
                                <div className="leading-relaxed">{msg.text}</div>
                                <div className={`flex items-center gap-1 mt-0.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
                                    <span className="text-[10px] text-gray-400">
                                        {getTimestamp()}
                                    </span>
                                    {showAudio && (
                                        <span className="text-[10px] text-blue-500 animate-pulse">
                                            🔊 {isGeneratingAudio ? 'audio...' : 'speaking'}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
                {isProcessing && (
                    <div className="flex justify-start">
                        <div className="bg-white border border-blue-100 px-4 py-3 rounded-xl rounded-bl-sm">
                            <div className="flex gap-1.5">
                                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* INPUT AREA */}
            <div className="px-3 py-3 bg-white border-t border-blue-100 flex items-center gap-2 flex-shrink-0">
                <div className="flex-1 flex items-center bg-blue-50 rounded-full px-4 h-11 focus-within:ring-2 focus-within:ring-blue-500 focus-within:bg-white transition-all">
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Type a message..."
                        className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                        disabled={isProcessing}
                    />
                </div>
                <button
                    onClick={startVoiceInput}
                    disabled={isProcessing}
                    className={`w-11 h-11 rounded-full flex items-center justify-center text-lg transition-all flex-shrink-0 ${isListening
                        ? 'bg-red-500 text-white shadow-lg animate-pulse'
                        : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                        }`}
                    title={isListening ? 'Stop listening' : 'Voice input'}
                >
                    🎤
                </button>
                <button
                    onClick={handleSend}
                    disabled={isProcessing || !inputText.trim()}
                    className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg hover:bg-blue-700 transition-all disabled:opacity-50 disabled:pointer-events-none flex-shrink-0 shadow-sm"
                >
                    ➤
                </button>
            </div>
        </div>
    );
}
