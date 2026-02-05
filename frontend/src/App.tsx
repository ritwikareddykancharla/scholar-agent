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
  const reportExportRef = useRef<HTMLDivElement>(null);

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
                  if (data.sources && data.sources.length > 0) {
                    last.sourceTitles = { ...fallbackTitles, ...extractedTitles };
                    last.content = stripSourcesSection(rawContent);
                    last.sources = data.sources;
                  } else {
                    const parsed = extractSourcesFromContent(rawContent);
                    if (parsed.sources.length > 0) {
                      const parsedTitles: Record<number, string> = {};
                      parsed.sources.forEach((source, index) => {
                        parsedTitles[index + 1] = parsed.titles[index + 1] || getHostTitle(source);
                      });
                      last.sourceTitles = parsedTitles;
                      last.sources = parsed.sources;
                      last.content = stripSourcesSection(rawContent);
                    } else {
                      last.content = rawContent;
                    }
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
  const normalizedReport = latestReport ? {
    ...latestReport,
    content: latestReport.content.replace(/^\s*Deep Research Report\s*:\s*/i, '')
  } : null;
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

  const extractSourcesFromContent = (content: string) => {
    const sources: string[] = [];
    const titles: Record<number, string> = {};
    const lines = content.split('\n');
    let inSources = false;
    let pendingIndex: number | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/^(#{1,3}\s*)?Sources$/i.test(line)) {
        if (inSources) break;
        inSources = true;
        continue;
      }
      if (!inSources) continue;

      const urlMatch = line.match(/https?:\/\/[^\s)]+/);
      if (urlMatch) {
        const url = urlMatch[0].replace(/[.,)]$/, '');
        if (!sources.includes(url)) {
          sources.push(url);
        }
        if (pendingIndex !== null && titles[pendingIndex]) {
          pendingIndex = null;
        }
        continue;
      }

      const titledMatch = line.match(/^\[(\d+)\]\s+(.*?)(?:\s+—\s+|\s+-\s+)?(https?:\/\/\S+)?$/);
      if (titledMatch) {
        const index = parseInt(titledMatch[1], 10);
        const title = titledMatch[2].trim();
        const url = titledMatch[3];
        titles[index] = title;
        if (url) {
          const cleanedUrl = url.replace(/[.,)]$/, '');
          if (!sources.includes(cleanedUrl)) {
            sources.push(cleanedUrl);
          }
        } else {
          pendingIndex = index;
        }
      }
    }

    return { sources, titles };
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

  const extractFirstTable = (content: string) => {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length - 1; i += 1) {
      const header = lines[i].trim();
      const divider = lines[i + 1].trim();
      if (header.startsWith('|') && divider.match(/^\|?\s*[-: ]+\|/)) {
        const headers = header.split('|').map(h => h.trim()).filter(Boolean);
        const rows: { label: string; values: string[] }[] = [];
        let j = i + 2;
        while (j < lines.length && lines[j].trim().startsWith('|')) {
          const cols = lines[j].split('|').map(c => c.trim()).filter(Boolean);
          if (cols.length > 1) {
            rows.push({ label: cols[0], values: cols.slice(1) });
          }
          j += 1;
        }
        return { headers, rows };
      }
    }
    return null;
  };

  const parseAmount = (value: string) => {
    if (!value) return null;
    const cleaned = value.replace(/[$,%]/g, '').toLowerCase();
    const number = parseFloat(cleaned);
    if (Number.isNaN(number)) return null;
    if (cleaned.includes('trillion') || cleaned.includes(' t')) return number * 1_000;
    if (cleaned.includes('billion') || cleaned.includes(' b')) return number;
    if (cleaned.includes('million') || cleaned.includes(' m')) return number / 1_000;
    return number;
  };

  const buildReportData = (content: string) => {
    const sections = parseSections(content).filter(section => !/sources/i.test(section.title));
    const table = extractFirstTable(content);
    const executive = sections.find(section => /executive summary/i.test(section.title)) || sections[0];
    const remainingSections = sections.filter(section => section !== executive);
    const metrics = table?.rows
      .filter(row => /revenue|gross margin|eps|earnings per share|net income/i.test(row.label))
      .map(row => ({
        label: row.label,
        value: row.values[row.values.length - 1] || row.values[0] || ''
      })) || [];
    const revenueRow = table?.rows.find(row => /revenue/i.test(row.label));
    const chart = revenueRow
      ? revenueRow.values.map((value, idx) => ({
          label: table?.headers[idx + 1] || `Period ${idx + 1}`,
          value,
          numeric: parseAmount(value)
        }))
      : [];
    const max = Math.max(...chart.map(item => item.numeric || 0), 0);

    return {
      sections,
      remainingSections,
      executive,
      table,
      metrics,
      chart,
      chartMax: max || 1
    };
  };

  const reportData = normalizedReport ? buildReportData(normalizedReport.content) : null;

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

  const stripExecutiveSummarySection = (content: string) => {
    const cleaned = content.replace(
      /(^|\n)#{1,3}\s*Executive Summary[\s\S]*?(?=\n#{1,3}\s|\nSources\b|$)/i,
      '\n'
    );
    return cleaned.trim();
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

  const handleDownloadReportPdf = async () => {
    if (!latestReport) return;
    const container = reportExportRef.current;
    if (!container) return;

    const canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: null,
      useCORS: true
    });
    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: 'a4'
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = canvas.height * (imgWidth / canvas.width);
    let y = 0;

    while (y < imgHeight) {
      pdf.addImage(imgData, 'PNG', 0, -y, imgWidth, imgHeight);
      y += pageHeight;
      if (y < imgHeight) {
        pdf.addPage();
      }
    }

    pdf.save(`scholar-report-${Date.now()}.pdf`);
  };

  const renderReport = (exportMode = false) => {
    if (!normalizedReport || !reportData) return null;
    return (
      <div
        className={`report ${exportMode ? 'report-export' : ''}`}
        style={{
          ['--report-accent' as string]: slideTheme.accent,
          ['--report-accent-soft' as string]: slideTheme.accentSoft
        }}
      >
        <div className="report-header">
          <div>
            <div className="report-kicker">Deep Research Report</div>
            <h1>{latestUserPrompt}</h1>
            <div className="report-meta">Generated {new Date().toLocaleDateString()}</div>
          </div>
          <div className="report-badge">Scholar</div>
        </div>

        {exportMode && reportData.executive && (
          <div className="report-summary">
            <div className="report-section-title">Executive Summary</div>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {reportData.executive.lines.join('\n')}
            </ReactMarkdown>
          </div>
        )}

        {reportData.metrics.length > 0 && (
          <div className="report-metrics">
            {reportData.metrics.slice(0, 4).map(metric => (
              <div key={metric.label} className="metric-card">
                <div className="metric-label">{metric.label}</div>
                <div className="metric-value">{metric.value}</div>
              </div>
            ))}
          </div>
        )}

        {reportData.chart.length > 0 && (
          <div className="report-chart">
            <div className="report-section-title">Revenue Trend</div>
            <div className="chart-grid">
              {reportData.chart.map(item => (
                <div key={item.label} className="chart-row">
                  <div className="chart-label">{item.label}</div>
                  <div className="chart-bar">
                    <span
                      style={{ width: `${((item.numeric || 0) / reportData.chartMax) * 100}%` }}
                    />
                  </div>
                  <div className="chart-value">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {reportData.remainingSections.map(section => (
          <div key={section.title} className="report-section">
            <div className="report-section-title">{section.title}</div>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {section.lines.join('\n')}
            </ReactMarkdown>
          </div>
        ))}

        {normalizedReport.sources && normalizedReport.sources.length > 0 && (
          <div className="report-section">
            <div className="report-section-title">Sources</div>
            <ol className="report-sources">
              {normalizedReport.sources.map((source, index) => {
                const title = normalizedReport.sourceTitles?.[index + 1];
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
    );
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
                onClick={handleDownloadReportPdf}
                disabled={!latestReport}
                title={latestReport ? 'Download report PDF' : 'Run a query to generate a report'}
              >
                Download Report PDF
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

          {latestReport && reportData && (
            <div className="report-view">
              {renderReport(false)}
            </div>
          )}

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

            {messages.map((msg, idx) => {
              const displayContent = msg === latestReport && msg.role === 'assistant'
                ? stripExecutiveSummarySection(msg.content)
                : msg.content;
              return (
              <div key={idx} className={`message ${msg.role}`}>
                <div className={`avatar ${msg.role}`}>
                  {msg.role === 'user' ? 'U' : 'AI'}
                </div>
                <div className="bubble">
                  <div className="meta">
                    {msg.role === 'user' ? 'You' : 'The Scholar'}
                  </div>
                  <div className="md">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
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
            );
            })}

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
      <div className="report-export-wrapper" ref={reportExportRef} aria-hidden="true">
        {renderReport(true)}
      </div>
    </div>
  );
}

export default App;
