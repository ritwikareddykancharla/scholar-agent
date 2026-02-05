import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, GraduationCap, Loader2, Sparkles, Globe, Cpu } from 'lucide-react';

interface Message {
  role: 'user' | 'model';
  content: string;
  sources?: string[];
}

function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<string>(''); // For "Thinking..."
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

      // Create a placeholder bot message
      setMessages(prev => [...prev, { role: 'model', content: '', sources: [] }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            
            if (data.type === 'token') {
              setMessages(prev => {
                const newMsgs = [...prev];
                const lastMsg = newMsgs[newMsgs.length - 1];
                if (lastMsg.role === 'model') {
                  lastMsg.content += data.content;
                }
                return newMsgs;
              });
            } else if (data.type === 'status' || data.type === 'log') {
              setStatus(data.content);
            } else if (data.type === 'sources') {
              setMessages(prev => {
                const newMsgs = [...prev];
                const lastMsg = newMsgs[newMsgs.length - 1];
                lastMsg.sources = (lastMsg.sources || []).concat(data.content);
                return newMsgs;
              });
            } else if (data.type === 'error') {
              console.error(data.content);
            }
          } catch (e) {
            console.error("Parse error", e);
          }
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
      
      {/* Header */}
      <header style={{ padding: '1rem 2rem', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', gap: '1rem', background: '#09090b', zIndex: 10 }}>
        <div style={{ background: 'linear-gradient(135deg, #a855f7, #6366f1)', padding: '0.5rem', borderRadius: '0.5rem' }}>
          <GraduationCap color="white" size={24} />
        </div>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0, letterSpacing: '-0.02em' }}>The Scholar</h1>
          <p style={{ margin: 0, color: '#a1a1aa', fontSize: '0.8rem' }}>Recursive Research Engine</p>
        </div>
      </header>

      {/* Chat Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2rem 0', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: '8rem', opacity: 0.5 }}>
            <div style={{ background: '#18181b', display: 'inline-block', padding: '1.5rem', borderRadius: '2rem', marginBottom: '1.5rem' }}>
              <Sparkles size={48} color="#a855f7" />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '0.5rem' }}>Deep Research</h2>
            <p style={{ color: '#a1a1aa' }}>Powered by Gemini 2.0 Flash</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} style={{ padding: '1.5rem 2rem', borderBottom: msg.role === 'user' ? 'none' : '1px solid #27272a' }}>
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              <div style={{ 
                width: '32px', height: '32px', borderRadius: '0.5rem', 
                background: msg.role === 'user' ? '#27272a' : 'linear-gradient(135deg, #a855f7, #6366f1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                fontSize: '0.9rem', fontWeight: 'bold'
              }}>
                {msg.role === 'user' ? 'U' : 'AI'}
              </div>
              
              <div style={{ flex: 1, lineHeight: 1.7, fontSize: '1rem' }}>
                {msg.role === 'user' ? (
                  <p style={{ margin: 0, fontSize: '1.1rem' }}>{msg.content}</p>
                ) : (
                  <>
                    <div className="prose prose-invert">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                    {msg.sources && msg.sources.length > 0 && (
                      <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #27272a' }}>
                        <p style={{ fontSize: '0.8rem', color: '#a1a1aa', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Globe size={14} /> Sources
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {[...new Set(msg.sources)].map((src, i) => (
                            <a key={i} href={src} target="_blank" rel="noreferrer" style={{ 
                              background: '#18181b', color: '#a855f7', padding: '0.25rem 0.75rem', 
                              borderRadius: '1rem', fontSize: '0.75rem', textDecoration: 'none',
                              border: '1px solid #3f3f46'
                            }}>
                              {new URL(src).hostname.replace('www.', '')}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Status Indicator */}
        {status && (
          <div style={{ padding: '1rem 2rem 1rem 5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#a1a1aa' }}>
            <Loader2 className="animate-spin" size={16} />
            <span style={{ fontSize: '0.9rem', fontFamily: 'monospace' }}>{status}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={{ padding: '2rem', background: '#09090b' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', position: 'relative' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask anything..."
            disabled={isStreaming}
            style={{
              width: '100%',
              padding: '1rem 3.5rem 1rem 1.5rem',
              borderRadius: '1.5rem',
              background: '#18181b',
              border: '1px solid #27272a',
              color: 'white',
              fontSize: '1rem',
              outline: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input}
            style={{
              position: 'absolute', right: '0.75rem', top: '0.5rem',
              background: '#a855f7',
              color: 'white',
              border: 'none',
              borderRadius: '50%',
              width: '2.5rem', height: '2.5rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: isStreaming ? 'not-allowed' : 'pointer',
              opacity: isStreaming ? 0.5 : 1
            }}
          >
            <Send size={18} />
          </button>
        </div>
        <p style={{ textAlign: 'center', color: '#52525b', fontSize: '0.75rem', marginTop: '1rem' }}>
          Gemini 3 Hackathon • The Scholar
        </p>
      </div>
    </div>
  );
}

export default App;
