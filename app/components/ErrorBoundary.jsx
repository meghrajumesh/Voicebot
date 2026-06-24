"use client";

import React from 'react';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, info) {
        console.error('❌ ErrorBoundary caught:', error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex items-center justify-center h-[600px] max-w-md mx-auto bg-white rounded-3xl shadow-xl border border-slate-200 p-8 text-center">
                    <div>
                        <p className="text-4xl mb-4">⚠️</p>
                        <h2 className="text-lg font-semibold text-slate-800 mb-2">Something went wrong</h2>
                        <p className="text-sm text-slate-500 mb-4">Please refresh the page to continue.</p>
                        <button
                            onClick={() => this.setState({ hasError: false })}
                            className="px-4 py-2 bg-blue-600 text-white rounded-full text-sm hover:bg-blue-700 transition-colors"
                        >
                            Try again
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
