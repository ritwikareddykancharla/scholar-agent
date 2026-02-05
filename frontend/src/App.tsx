import { useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { Search, BookOpen, Loader2, ExternalLink, GraduationCap } from 'lucide-react';

interface ResearchReport {
  title: str;
  content: str;
  sources: string[];
}

function App() {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ResearchReport | null>(null);

  const handleResearch = async () => {
    setLoading(true);
    setReport(null);
    try {
      const response = await axios.post('http://localhost:8001/api/research', {
        topic,
        depth: 2
      });
      setReport(response.data);
    } catch (error) {
      console.error(error);
      alert('Research failed. Ensure backend is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
          <GraduationCap size={48} color="#4f46e5" />
          <h1 style={{ fontSize: '2.5rem', margin: 0, fontWeight: 800 }}>The Scholar</h1>
        </div>
        <p style={{ color: '#6b7280', fontSize: '1.1rem' }}>Recursive Knowledge Synthesis Engine</p>
      </header>

      <div style={{ position: 'relative', display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Enter a research topic (e.g., 'Impact of Quantum Computing on RSA')..."
          style={{
            flex: 1,
            padding: '1.2rem 1.5rem',
            borderRadius: '1rem',
            border: '2px solid #e5e7eb',
            fontSize: '1.1rem',
            outline: 'none',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
          }}
          onKeyPress={(e) => e.key === 'Enter' && handleResearch()}
        />
        <button
          onClick={handleResearch}
          disabled={loading || !topic}
          style={{
            padding: '0 2rem',
            background: '#4f46e5',
            color: 'white',
            border: 'none',
            borderRadius: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          {loading ? <Loader2 className="animate-spin" /> : <Search size={20} />}
          {loading ? 'Researching...' : 'Search'}
        </button>
      </div>

      {report && (
        <div style={{ background: 'white', padding: '3rem', borderRadius: '1.5rem', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', border: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', color: '#4f46e5' }}>
            <BookOpen size={24} />
            <h2 style={{ margin: 0 }}>{report.title}</h2>
          </div>
          
          <div className="prose" style={{ lineHeight: 1.6, fontSize: '1.1rem' }}>
            <ReactMarkdown>{report.content}</ReactMarkdown>
          </div>

          {report.sources.length > 0 && (
            <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid #e5e7eb' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Sources & Citations</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {report.sources.map((src, i) => (
                  <a key={i} href={src} target="_blank" rel="noopener noreferrer" style={{ color: '#4f46e5', display: 'flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none', fontSize: '0.9rem' }}>
                    <ExternalLink size={14} /> {src}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {loading && !report && (
        <div style={{ textAlign: 'center', padding: '5rem', color: '#6b7280' }}>
          <div style={{ marginBottom: '1rem' }}>
            <Loader2 size={48} className="animate-spin" style={{ margin: '0 auto' }} />
          </div>
          <p>Consulting academic sources and synthesizing knowledge...</p>
        </div>
      )}
    </div>
  );
}

export default App;
