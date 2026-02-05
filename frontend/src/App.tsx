import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, GraduationCap, Loader2, Sparkles, Globe, FileText, Zap } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import ColorThief from 'color-thief-browser';

interface Message {
  role: 'user' | 'model';
  content: string;
  sources?: string[];
  sourceTitles?: Record<number, string>;
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
  const [timeline, setTimeline] = useState<{ time: string; label: string }[]>([]);
  const [slideTheme, setSlideTheme] = useState({
    accent: '#2563eb',
    accentSoft: '#EEF2FF',
    bg1: '#F8FAFC',
    bg2: '#EEF2FF'
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const slidesRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const addTimeline = (label: string) => {
    setTimeline(prev => {
      const last = prev[prev.length - 1];
      if (last && last.label === label) return prev;
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return [...prev, { time, label }].slice(-12);
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, status]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setTimeline([{ time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), label: 'Session started' }]);
    setInput('');
    setIsStreaming(true);
    setStatus('Initializing Scholar...');
    addTimeline('Initializing Scholar...');

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
              } else if (data.type === 'final') {
                setMessages(prev => {
                  const newMsgs = [...prev];
                  const last = newMsgs[newMsgs.length - 1];
                  const rawContent = data.content ?? last.content;
                  const extractedTitles = extractSourceTitles(rawContent);
                  const fallbackTitles: Record<number, string> = {};
                  if (data.sources) {
                    data.sources.forEach((source: string, index: number) => {
                      fallbackTitles[index + 1] = extractedTitles[index + 1] || getHostTitle(source);
                    });
                  }
                  last.sourceTitles = { ...fallbackTitles, ...extractedTitles };
                  last.content = stripSourcesSection(rawContent);
                  if (data.sources) {
                    last.sources = data.sources;
                  }
                  return newMsgs;
                });
                addTimeline('Report generated');
              } else if (data.type === 'status' || data.type === 'log') {
                setStatus(data.content);
                addTimeline(data.content);
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
      addTimeline('Error generating report');
    } finally {
      setIsStreaming(false);
      setStatus('');
    }
  };

  const statusLabel = status || (isStreaming ? 'Synthesizing response...' : 'Ready for research.');
  const latestReport = [...messages].reverse().find(msg => msg.role === 'model' && msg.content.trim());
  const latestUserPrompt = [...messages].reverse().find(msg => msg.role === 'user')?.content ?? 'Research Report';

  const defaultTheme = {
    accent: '#2563eb',
    accentSoft: '#EEF2FF',
    bg1: '#F8FAFC',
    bg2: '#EEF2FF'
  };

  const getHostTitle = (url: string) => {
    try {
      const host = new URL(url).hostname.replace('www.', '');
      return host.charAt(0).toUpperCase() + host.slice(1);
    } catch {
      return url;
    }
  };

  const getPrimaryDomain = (sources?: string[]) => {
    if (!sources || sources.length === 0) return null;
    const counts = new Map<string, number>();
    sources.forEach(source => {
      try {
        const host = new URL(source).hostname.replace('www.', '');
        counts.set(host, (counts.get(host) || 0) + 1);
      } catch {
        return;
      }
    });
    if (counts.size === 0) return null;
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  const toHex = (value: number) => value.toString(16).padStart(2, '0');

  const rgbToHex = (rgb: number[]) => {
    const [r, g, b] = rgb.map(c => Math.max(0, Math.min(255, Math.round(c))));
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  const mixColors = (rgb: number[], weight: number, mixWith = [255, 255, 255]) => {
    return rgb.map((c, i) => Math.round(c * (1 - weight) + mixWith[i] * weight));
  };

  useEffect(() => {
    const domain = getPrimaryDomain(latestReport?.sources);
    if (!domain) {
      setSlideTheme(defaultTheme);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `https://www.google.com/s2/favicons?sz=128&domain_url=${domain}`;

    img.onload = () => {
      try {
        const thief = new ColorThief();
        const palette = thief.getPalette(img, 3);
        const accentRgb = palette?.[0] || thief.getColor(img);
        const accentSoftRgb = mixColors(accentRgb, 0.85);
        const bg1Rgb = mixColors(accentRgb, 0.95);
        const bg2Rgb = mixColors(accentRgb, 0.9);
        setSlideTheme({
          accent: rgbToHex(accentRgb),
          accentSoft: rgbToHex(accentSoftRgb),
          bg1: rgbToHex(bg1Rgb),
          bg2: rgbToHex(bg2Rgb)
        });
      } catch {
        setSlideTheme(defaultTheme);
      }
    };

    img.onerror = () => setSlideTheme(defaultTheme);
  }, [latestReport?.sources?.join('|') ?? '', latestUserPrompt]);

  const stripSourcesSection = (content: string) => {
    const pattern = /\n(?:#{1,3}\s*)?Sources\s*\n[\s\S]*$/i;
    return content.replace(pattern, '').trim();
  };

  const extractSourceTitles = (content: string) => {
    const titles: Record<number, string> = {};
    const lines = content.split('\n');
    let inSources = false;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/^(#{1,3}\s*)?Sources$/i.test(line)) {
        if (inSources) break;
        inSources = true;
        continue;
      }
      if (!inSources) continue;
      if (line.startsWith('http://') || line.startsWith('https://')) {
        continue;
      }
      const match = line.match(/^\[(\d+)\]\s+(.*)$/);
      if (match) {
        const index = parseInt(match[1], 10);
        titles[index] = match[2].trim();
      }
    }
    return titles;
  };

  const parseSections = (content: string) => {
    const lines = content.split('\n');
    const sections: { title: string; lines: string[] }[] = [];
    let current = { title: 'Summary', lines: [] as string[] };

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('#')) {
        if (current.lines.length > 0 || current.title !== 'Summary') {
          sections.push(current);
        }
        current = { title: line.replace(/^#+\s*/, ''), lines: [] };
      } else {
        current.lines.push(line);
      }
    }
    if (current.lines.length > 0 || sections.length === 0) {
      sections.push(current);
    }
    return sections;
  };

  const buildBullets = (lines: string[]) => {
    const bullets = lines
      .filter(line => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
      .map(line => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''));
    if (bullets.length > 0) {
      return bullets.slice(0, 6);
    }
    const text = lines.join(' ');
    return text.split('. ').map(s => s.trim()).filter(Boolean).slice(0, 6);
  };

  const slides = latestReport
    ? (() => {
        const sections = parseSections(latestReport.content);
        const slideItems = sections.map(section => ({
          title: section.title,
          bullets: buildBullets(section.lines)
        }));
        return slideItems;
      })()
    : [];

  const buildReportMarkdown = (msg: Message) => {
    const timestamp = new Date().toLocaleString();
    const header = `# Research Report\n\nGenerated: ${timestamp}\n\n`;
    const sources = msg.sources && msg.sources.length > 0
      ? `\n\n## Sources\n${msg.sources.map((source, index) => `${index + 1}. ${source}`).join('\n')}\n`
      : '';
    return `${header}${msg.content}${sources}`;
  };

  const stripInlineMarkdown = (text: string) => {
    let out = text;
    out = out.replace(/`([^`]+)`/g, '$1');
    out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
    out = out.replace(/\*([^*]+)\*/g, '$1');
    out = out.replace(/\[(.*?)\]\((.*?)\)/g, '$1 ($2)');
    return out;
  };

  const handleDownload = () => {
    if (!latestReport) return;
    const report = buildReportMarkdown(latestReport);
    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `scholar-report-${Date.now()}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSlidesPdf = async () => {
    if (!latestReport) return;
    const container = slidesRef.current;
    if (!container) return;
    const slideNodes = Array.from(container.querySelectorAll('.slide')) as HTMLElement[];
    if (slideNodes.length === 0) return;

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [1280, 720]
    });

    for (let i = 0; i < slideNodes.length; i += 1) {
      const slide = slideNodes[i];
      const canvas = await html2canvas(slide, {
        scale: 2,
        backgroundColor: null
      });
      const imgData = canvas.toDataURL('image/png');
      if (i > 0) {
        pdf.addPage([1280, 720], 'landscape');
      }
      pdf.addImage(imgData, 'PNG', 0, 0, 1280, 720);
    }

    pdf.save(`scholar-report-${Date.now()}.pdf`);
  };

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
          <div className="sidebar-card">
            <div className="eyebrow">Research Timeline</div>
            {timeline.length === 0 ? (
              <div className="timeline-empty">Timeline appears during research.</div>
            ) : (
              <ul className="timeline">
                {timeline.map((entry, index) => (
                  <li key={`${entry.time}-${index}`} className="timeline-item">
                    <span className="timeline-time">{entry.time}</span>
                    <span className="timeline-label">{entry.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <section className="workspace">
          <div className="workspace-header">
            <div>
              <div className="eyebrow">Session</div>
              <h1>Evidence-first synthesis</h1>
              <p>Structured answers, transparent sources, and clear reasoning.</p>
            </div>
            <div className="workspace-actions">
              <button
                className="download-button"
                onClick={handleDownloadSlidesPdf}
                disabled={!latestReport}
                title={latestReport ? 'Download slides PDF' : 'Run a query to generate a report'}
              >
                Download Slides PDF
              </button>
              <button
                className="download-button secondary"
                onClick={handleDownload}
                disabled={!latestReport}
                title={latestReport ? 'Download report as Markdown' : 'Run a query to generate a report'}
              >
                Download MD
              </button>
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
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="sources">
                      <div className="sources-title">Sources</div>
                      <ol>
                        {msg.sources.map((source, index) => {
                          const title = msg.sourceTitles?.[index + 1];
                          return (
                          <li key={`${source}-${index}`}>
                            <a href={source} target="_blank" rel="noreferrer">
                              {title ? `${title}` : source}
                            </a>
                          </li>
                          );
                        })}
                      </ol>
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
      <div
        className="slides-export"
        ref={slidesRef}
        aria-hidden="true"
        style={{
          ['--slide-accent' as string]: slideTheme.accent,
          ['--slide-accent-soft' as string]: slideTheme.accentSoft,
          ['--slide-bg1' as string]: slideTheme.bg1,
          ['--slide-bg2' as string]: slideTheme.bg2
        }}
      >
        {latestReport && (
          <>
            <div className="slide cover">
              <div className="slide-inner">
                <div className="slide-kicker">Deep Research Report</div>
                <h1>{stripInlineMarkdown(latestUserPrompt)}</h1>
                <p>Generated {new Date().toLocaleDateString()}</p>
              </div>
            </div>
            {slides.map((slide, index) => (
              <div key={`${slide.title}-${index}`} className={`slide ${index % 2 === 0 ? 'alt' : ''}`}>
                <div className="slide-inner">
                  <h2>{stripInlineMarkdown(slide.title)}</h2>
                  <ul>
                    {slide.bullets.map((bullet, bulletIndex) => (
                      <li key={`${bullet}-${bulletIndex}`}>{stripInlineMarkdown(bullet)}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
            {latestReport.sources && latestReport.sources.length > 0 && (
              <div className="slide sources-slide">
                <div className="slide-inner">
                  <h2>Sources</h2>
                  <ol>
                    {latestReport.sources.map((source, index) => {
                      const title = latestReport.sourceTitles?.[index + 1];
                      return (
                        <li key={`${source}-${index}`}>
                          {title ? `${title} — ${source}` : source}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
