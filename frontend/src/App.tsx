import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, GraduationCap, Loader2, Sparkles, Globe, FileText, Zap } from 'lucide-react';

interface Message {
  role: 'user' | 'model';
  content: string;
  sources?: string[];
}

const samplePrompts = [
  {
    title: 'Market pulse',
    description: 'Summarize the latest AI agent tooling landscape with citations.',
    icon: Zap
  },
  {
    title: 'Deep dive',
    description: 'Compare battery chemistries for EVs and cite sources.',
    icon: FileText
  },
  {
    title: 'Trend scan',
    description: 'Outline key trends in fintech compliance for 2026.',
    icon: Sparkles
  }
];

function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

      if (!reader) throw new Error('No reader');

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
                  newMsgs[newMsgs.length - 1].sources = [
                    ...new Set([...(newMsgs[newMsgs.length - 1].sources || []), ...data.content])
                  ];
                  return newMsgs;
                });
              }
            } catch (e) {
              console.error('Parse error', line, e);
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

  const statusLabel = status || (isStreaming ? 'Synthesizing response...' : 'Ready for research.');

  return (
    <div className="app">
      <div className="app-bg" />
      <header className="topbar">
        <div className="brand">
          <div className="logo">
            <GraduationCap size={18} />
          </div>
          <div>
            <div className="brand-title">The Scholar</div>
            <div className="brand-sub">
              <Sparkles size={14} />
              Manus-grade research UI
            </div>
          </div>
        </div>
        <div className="topbar-info">
          <div className="status-pill">
            <span className={`status-dot ${isStreaming ? 'on' : 'off'}`} />
            {isStreaming ? 'Working' : 'Ready'}
          </div>
          <div className="topbar-meta">
            <Globe size={14} />
            Grounded web search
          </div>
        </div>
      </header>

      <div className="main">
        <aside className="sidebar">
          <div className="sidebar-card">
            <div className="eyebrow">Workspace</div>
            <h2>Research Canvas</h2>
            <p>
              Ask big questions, collect evidence, and synthesize clean reports with
              citations.
            </p>
          </div>
          <div className="sidebar-card">
            <div className="eyebrow">Quick Actions</div>
            <div className="chip-list">
              {samplePrompts.map(prompt => {
                const Icon = prompt.icon;
                return (
                  <button
                    key={prompt.title}
                    className="chip"
                    onClick={() => setInput(prompt.description)}
                  >
                    <Icon size={16} />
                    <div>
                      <div className="chip-title">{prompt.title}</div>
                      <div className="chip-desc">{prompt.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="sidebar-card">
            <div className="eyebrow">Status</div>
            <div className="status-row">
              <span className={`status-dot ${isStreaming ? 'on' : 'off'}`} />
              {statusLabel}
            </div>
          </div>
        </aside>

        <section className="workspace">
          <div className="workspace-header">
            <div>
              <div className="eyebrow">Session</div>
              <h1>Evidence-first synthesis</h1>
              <p>Structured answers, transparent sources, and clear reasoning.</p>
            </div>
          </div>

          <div className="thread">
            {messages.length === 0 && (
              <div className="empty">
                <div className="empty-title">Start a research session</div>
                <div className="empty-sub">
                  Manus-style clarity, with citations you can trust.
                </div>
                <div className="prompt-grid">
                  {samplePrompts.map(prompt => (
                    <button
                      key={prompt.title}
                      className="prompt-card"
                      onClick={() => setInput(prompt.description)}
                    >
                      <div className="prompt-title">{prompt.title}</div>
                      <div className="prompt-desc">{prompt.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div key={idx} className={`message ${msg.role}`}>
                <div className={`avatar ${msg.role}`}>
                  {msg.role === 'user' ? 'U' : 'AI'}
                </div>
                <div className="bubble">
                  <div className="meta">
                    {msg.role === 'user' ? 'You' : 'The Scholar'}
                  </div>
                  <div className="md">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="sources">
                      <div className="sources-title">Sources</div>
                      <ul>
                        {msg.sources.map(source => (
                          <li key={source}>
                            <a href={source} target="_blank" rel="noreferrer">
                              {source}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {status && (
              <div className="status-line">
                <Loader2 className="spin" size={16} />
                {status}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </section>
      </div>

      <div className="composer">
        <div className="composer-inner">
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
            className="composer-input"
            disabled={isStreaming}
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="composer-button"
          >
            {isStreaming ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
