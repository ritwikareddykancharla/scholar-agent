import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { Send, User, Bot, GraduationCap, Loader2, ExternalLink } from 'lucide-react';

interface Message {
  role: 'user' | 'model';
  content: string;
  sources?: string[];
}

function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      // Prepare history for backend (excluding sources, just content)
      const apiMessages = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content
      }));

      const response = await axios.post('http://localhost:8001/api/chat', {
        messages: apiMessages
      });

      const botMsg: Message = {
        role: 'model',
        content: response.data.response,
        sources: response.data.sources
      };
      
      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      console.error(error);
      const errorMsg: Message = { role: 'model', content: "Error: Could not connect to the Scholar." };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: '1000px', margin: '0 auto', background: '#ffffff', boxShadow: '0 0 20px rgba(0,0,0,0.05)' }}>
      {/* Header */}
      <header style={{ padding: '1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '1rem', background: 'white', zIndex: 10 }}>
        <div style={{ background: '#4f46e5', padding: '0.5rem', borderRadius: '0.5rem' }}>
          <GraduationCap color="white" size={24} />
        </div>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>The Scholar</h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>Context-Aware Research Agent</p>
        </div>
      </header>

      {/* Chat Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', background: '#f9fafb' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '5rem' }}>
            <GraduationCap size={64} style={{ margin: '0 auto 1rem auto', opacity: 0.2 }} />
            <p>Start your research session.<br/>Ask a complex question.</p>
          </div>
        )}
        
        {messages.map((msg, idx) => (
          <div key={idx} style={{ display: 'flex', gap: '1rem', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
            <div style={{ 
              width: '32px', height: '32px', borderRadius: '50%', 
              background: msg.role === 'user' ? '#1f2937' : '#4f46e5',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0
            }}>
              {msg.role === 'user' ? <User size={16} color="white" /> : <Bot size={16} color="white" />}
            </div>
            
            <div style={{ 
              maxWidth: '80%', 
              background: msg.role === 'user' ? '#1f2937' : 'white', 
              color: msg.role === 'user' ? 'white' : '#1f2937',
              padding: '1rem 1.5rem', 
              borderRadius: '1rem',
              borderTopRightRadius: msg.role === 'user' ? '0' : '1rem',
              borderTopLeftRadius: msg.role === 'model' ? '0' : '1rem',
              boxShadow: msg.role === 'model' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
            }}>
              <div className="prose" style={{ lineHeight: 1.6 }}>
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>

              {msg.sources && msg.sources.length > 0 && (
                <div style={{ marginTop: '1rem', paddingTop: '0.5rem', borderTop: '1px solid #e5e7eb', fontSize: '0.85rem' }}>
                  <p style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#6b7280' }}>Sources:</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {msg.sources.map((src, i) => (
                      <a key={i} href={src} target="_blank" rel="noopener noreferrer" style={{ 
                        display: 'flex', alignItems: 'center', gap: '0.25rem', 
                        color: '#4f46e5', textDecoration: 'none', background: '#eef2ff', 
                        padding: '0.25rem 0.5rem', borderRadius: '0.25rem' 
                      }}>
                        <ExternalLink size={10} /> {new URL(src).hostname}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: '1rem' }}>
             <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={16} color="white" />
            </div>
            <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', borderTopLeftRadius: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
              <Loader2 className="animate-spin" size={20} color="#4f46e5" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={{ padding: '1.5rem', background: 'white', borderTop: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', gap: '0.75rem', maxWidth: '100%', position: 'relative' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type your follow-up question..."
            style={{
              flex: 1,
              padding: '1rem 1.25rem',
              borderRadius: '0.75rem',
              border: '2px solid #e5e7eb',
              fontSize: '1rem',
              outline: 'none',
            }}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input}
            style={{
              padding: '0 1.5rem',
              background: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s'
            }}
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;