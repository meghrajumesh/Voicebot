import './globals.css';

export const metadata = {
  title: 'LeadPilot AI',
  description: 'AI Chatbot with RAG',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}