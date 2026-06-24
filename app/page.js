import VoiceChatWidget from './components/VoiceChatWidget';
import ErrorBoundary from './components/ErrorBoundary';

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <ErrorBoundary>
        <VoiceChatWidget workspaceId={process.env.NEXT_PUBLIC_WORKSPACE_ID || '11111111-1111-1111-1111-111111111111'} />
      </ErrorBoundary>
    </main>
  );
}