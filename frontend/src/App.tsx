import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, GraduationCap, Loader2, Sparkles, Globe } from 'lucide-react';

interface Message {
  role: 'user' | 'model';
  content: string;
  sources?: string[];
}

function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, status]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);
    setStatus('Initializing Scholar...');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.concat(userMsg).map(m => ({ role: m.role, content: m.content }))
        })
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) throw new Error("No reader");

      setMessages(prev => [...prev, { role: 'model', content: '', sources: [] }]);

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        let boundary = buffer.indexOf('\n');
        while (boundary !== -1) {
          const line = buffer.substring(0, boundary);

          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              
              if (data.type === 'token') {
                setMessages(prev => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1].content += data.content;
                  return newMsgs;
                });
              } else if (data.type === 'status' || data.type === 'log') {
                setStatus(data.content);
              } else if (data.type === 'sources') {
                setMessages(prev => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1].sources = [...new Set([...(newMsgs[newMsgs.length - 1].sources || []), ...data.content])];
                  return newMsgs;
                });
              }
            } catch (e) {
              console.error("Parse error", line, e);
            }
          }

          buffer = buffer.substring(boundary + 1);
          boundary = buffer.indexOf('\n');
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsStreaming(false);
      setStatus('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#09090b', color: '#e4e4e7', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Header (Same as before) */}
      <header style={{ padding: '1rem 2rem', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', gap: '1rem', background: '#09090b', zIndex: 10 }}>
        {/* ... Header content ... */}
      </header>
      
      {/* Chat Area - Layout Fixed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
        {messages.map((msg, idx) => (
          <div key={idx} style={{ 
            display: 'flex', 
            flexDirection: msg.role === 'user' ? 'row' : 'row-reverse', // Align user left, AI right
            justifyContent: msg.role === 'user' ? 'flex-start' : 'flex-end',
            marginBottom: '2rem'
          }}>
            <div style={{ maxWidth: '80%', display: 'flex', gap: '1rem' }}>
              <div style={{ 
                width: '32px', height: '32px', borderRadius: '50%', 
                background: msg.role === 'user' ? '#27272a' : 'linear-gradient(135deg, #a855f7, #6366f1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                {msg.role === 'user' ? 'U' : 'AI'}
              </div>
              <div style={{ 
                background: msg.role === 'user' ? '#18181b' : 'transparent',
                padding: msg.role === 'user' ? '1rem 1.5rem' : '0',
                borderRadius: '1rem' 
              }}>
                <div className="prose prose-invert">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Status Indicator (Same as before) */}
        {status && (
          // ... Status content ...
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area (Same as before) */}
      <div style={{ padding: '2rem', background: '#09090b' }}>
        {/* ... Input content ... */}
      </div>
    </div>
  );
}

export default App;