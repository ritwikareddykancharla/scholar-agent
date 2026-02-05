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
      <header style={{ padding: '1rem 2rem', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#09090b', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #a855f7, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <GraduationCap size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 700, letterSpacing: '0.3px' }}>The Scholar</div>
            <div style={{ fontSize: '0.85rem', color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Sparkles size={14} />
              Research with citations
            </div>
          </div>
        </div>
        <div style={{ fontSize: '0.85rem', color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Globe size={14} />
          Grounded web search
        </div>
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
          <div style={{ padding: '1rem 2rem 1rem 5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#a1a1aa' }}>
            <Loader2 className="animate-spin" size={16} />
            <span style={{ fontSize: '0.9rem', fontFamily: 'monospace' }}>{status}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: '1.5rem 2rem', background: '#09090b', borderTop: '1px solid #27272a' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', gap: '0.75rem' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask a research question..."
            style={{
              flex: 1,
              minHeight: '56px',
              maxHeight: '160px',
              resize: 'vertical',
              borderRadius: '0.75rem',
              border: '1px solid #3f3f46',
              background: '#0f0f11',
              color: '#e4e4e7',
              padding: '0.9rem 1rem',
              fontSize: '0.95rem',
              outline: 'none'
            }}
            disabled={isStreaming}
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '0.75rem',
              border: '1px solid #3f3f46',
              background: isStreaming || !input.trim() ? '#18181b' : 'linear-gradient(135deg, #a855f7, #6366f1)',
              color: '#e4e4e7',
              cursor: isStreaming || !input.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isStreaming ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
