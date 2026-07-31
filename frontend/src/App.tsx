import React, { useState, useEffect, useRef, useCallback } from 'react'
import { parseCSV, parsePDF, cleanData, searchDocs, executeCode, embedChunks, SearchResult } from './api'

// ─── Types ─────────────────────────────────────────────────────────────────────

type ActiveTab = 'ingest' | 'chat' | 'search' | 'sandbox'
type SandboxView = 'editor' | 'matrix'
type CleanOp = 'drop_nulls' | 'fill_nulls' | 'dedupe' | 'cast_types'
type ToastKind = 'ok' | 'err' | 'info'

interface ParsedFile {
  id: string
  name: string
  type: 'csv' | 'pdf'
  size: string
  rows?: number
  pages?: number
  cols?: { name: string; dtype: string }[]
  nullPct: number
  typeMismatches: number
  dupeRows: number
  status: 'parsing' | 'done'
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  hasChart?: boolean
  citations?: { file: string; page?: number; rowRange?: string }[]
  timestamp: string
  thinking?: boolean
}

interface ToolStep {
  id: string
  tool: 'runPython' | 'searchDocuments' | 'hybrid'
  status: 'done' | 'running' | 'pending'
  durationMs: number
  payload: string
  responseCode: number
  timestamp: string
}

interface SearchHit {
  id: string
  text: string
  score: number
  source: string
  page?: number
  rowRange?: string
  entities: string[]
}

interface Toast {
  id: string
  msg: string
  kind: ToastKind
}

// ─── Mock Data ──────────────────────────────────────────────────────────────────

const MOCK_FILES: ParsedFile[] = [
  {
    id: 'file_7k2mxp9q',
    name: 'hackathon_submissions_2024.csv',
    type: 'csv',
    size: '2.4 MB',
    rows: 8420,
    cols: [
      { name: 'team_id', dtype: 'str' },
      { name: 'project_name', dtype: 'str' },
      { name: 'category', dtype: 'str' },
      { name: 'score', dtype: 'float64' },
      { name: 'judges', dtype: 'int32' },
      { name: 'submission_url', dtype: 'str' },
    ],
    nullPct: 3.2,
    typeMismatches: 12,
    dupeRows: 47,
    status: 'done',
  },
  {
    id: 'file_3n8wxr1t',
    name: 'technical_architecture_v3.pdf',
    type: 'pdf',
    size: '8.7 MB',
    pages: 94,
    nullPct: 0,
    typeMismatches: 0,
    dupeRows: 0,
    status: 'done',
  },
]

const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: 'msg_0',
    role: 'user',
    content:
      'Show me the top 5 hackathon projects by score, and summarize the distributed systems section from the architecture doc.',
    timestamp: '14:32:07',
  },
  {
    id: 'msg_1',
    role: 'assistant',
    content: `## Top 5 Projects by Score

| Rank | Team | Project | Score | Category |
|------|------|---------|-------|----------|
| 1 | AlphaNode | QuantumSync AI | 97.4 | AI/ML |
| 2 | ByteForge | NeuralMesh | 96.1 | Blockchain |
| 3 | CipherLab | EdgeOracle | 94.8 | Security |
| 4 | DeltaCore | FluxDB | 93.2 | Databases |
| 5 | EchoSystems | GridMind | 92.7 | Systems |

## Distributed Systems Architecture

The document outlines a **three-tier consensus protocol** using Raft-based leader election with sub-50ms failover guarantees. Key design decisions:

- **Replication Factor**: 3× across availability zones via consistent hashing (256 virtual nodes/shard)
- **Consistency**: Eventual consistency under partition; strong consistency in steady-state
- **Failover**: Randomized heartbeat timeouts (150–300ms) prevent split-vote scenarios
- **Recovery**: Vector clock reconciliation post-partition with last-writer-wins conflict resolution`,
    hasChart: true,
    citations: [
      { file: 'hackathon_submissions_2024.csv', rowRange: 'rows 1–8420' },
      { file: 'technical_architecture_v3.pdf', page: 34 },
      { file: 'technical_architecture_v3.pdf', page: 38 },
      { file: 'technical_architecture_v3.pdf', page: 51 },
    ],
    timestamp: '14:32:24',
  },
]

const MOCK_STEPS: ToolStep[] = [
  {
    id: 's1',
    tool: 'searchDocuments',
    status: 'done',
    durationMs: 18,
    payload: '{"query":"top hackathon projects score ranking","topK":5,"file_id":"file_7k2mxp9q","rerank":true}',
    responseCode: 200,
    timestamp: '14:32:08',
  },
  {
    id: 's2',
    tool: 'runPython',
    status: 'done',
    durationMs: 67,
    payload:
      '{"code":"df=ctx.df(\'file_7k2mxp9q\');top5=df.nlargest(5,\'score\')[fields]","fields":["team_id","project_name","score","category"]}',
    responseCode: 200,
    timestamp: '14:32:09',
  },
  {
    id: 's3',
    tool: 'searchDocuments',
    status: 'done',
    durationMs: 22,
    payload:
      '{"query":"distributed systems architecture consensus Raft leader election","topK":8,"file_id":"file_3n8wxr1t"}',
    responseCode: 200,
    timestamp: '14:32:12',
  },
  {
    id: 's4',
    tool: 'hybrid',
    status: 'done',
    durationMs: 141,
    payload:
      '{"strategy":"synthesize","sources":["s1","s2","s3"],"model":"claude-sonnet-4-6","temperature":0.1,"max_tokens":1024}',
    responseCode: 200,
    timestamp: '14:32:13',
  },
]

const MOCK_SEARCH_HITS: SearchHit[] = [
  {
    id: 'h1',
    text: 'The Raft consensus algorithm ensures leader election within 150ms under normal network conditions. Each follower maintains a heartbeat timeout between 150–300ms, randomized to prevent split votes during leader failures in a distributed cluster.',
    score: 0.12,
    source: 'technical_architecture_v3.pdf',
    page: 34,
    entities: ['Raft', 'leader election', 'consensus', '150ms'],
  },
  {
    id: 'h2',
    text: 'Horizontal scaling is achieved through consistent hashing across 256 virtual nodes per physical shard. Replication factor defaults to 3, ensuring no single point of failure across any availability zone.',
    score: 0.19,
    source: 'technical_architecture_v3.pdf',
    page: 38,
    entities: ['consistent hashing', 'replication factor', 'sharding'],
  },
  {
    id: 'h3',
    text: 'AlphaNode "QuantumSync AI" achieved top score of 97.4 in the AI/ML category. Key innovations: real-time model compression pipeline and edge inference with sub-10ms latency on ARM silicon.',
    score: 0.31,
    source: 'hackathon_submissions_2024.csv',
    rowRange: 'rows 1–15',
    entities: ['AlphaNode', 'QuantumSync AI', 'model compression'],
  },
  {
    id: 'h4',
    text: 'Network partition tolerance is guaranteed via CAP theorem tradeoff: the system prioritizes availability over strict consistency during partition events, using vector clock reconciliation post-recovery.',
    score: 0.38,
    source: 'technical_architecture_v3.pdf',
    page: 51,
    entities: ['CAP theorem', 'vector clock', 'partition tolerance'],
  },
  {
    id: 'h5',
    text: 'ByteForge NeuralMesh received 96.1 from 5 judges in the Blockchain category. The project demonstrates a novel zero-knowledge proof system for cross-chain asset verification with O(log n) prover complexity.',
    score: 0.44,
    source: 'hackathon_submissions_2024.csv',
    rowRange: 'rows 16–30',
    entities: ['ByteForge', 'NeuralMesh', 'zero-knowledge proof'],
  },
]

const DEMO_CODE = `import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io, base64, sys

# Load active DataFrame from context
df = context.get_dataframe('file_7k2mxp9q')

# Compute top-10 by score
top10 = df.nlargest(10, 'score')[['project_name', 'score', 'category']]

# Render horizontal bar chart
fig, ax = plt.subplots(figsize=(10, 6), facecolor='#09090b')
ax.set_facecolor('#0f0f11')
colors = ['#a3e635' if s >= 95 else '#10b981' for s in top10['score']]
ax.barh(top10['project_name'], top10['score'], color=colors, height=0.65)
ax.tick_params(colors='#a1a1aa', labelsize=9)
ax.spines[:].set_color('#27272a')
ax.set_xlim(85, 100)
ax.set_xlabel('Score', color='#a1a1aa', fontsize=9)
ax.set_title('Top 10 Hackathon Projects · 2024', color='#f4f4f5', pad=14)

buf = io.BytesIO()
plt.savefig(buf, format='png', bbox_inches='tight', dpi=150, facecolor='#09090b')
buf.seek(0)
sys.stdout.write("chart:base64:" + base64.b64encode(buf.read()).decode() + "\\n")
print(top10.to_string(index=False))
`

const DEMO_TERMINAL_LINES = [
  '$ Executing Python code...',
  '  ↳ Runtime: Python 3.11.8 · pandas 2.2.1 · matplotlib 3.8.3',
  '  ↳ Loading DataFrame: file_7k2mxp9q ...',
  '  ↳ Shape: (8420 rows × 6 cols)  |  Memory: 3.94 MB',
  '',
  '        project_name  score     category',
  '      QuantumSync AI   97.4        AI/ML',
  '          NeuralMesh   96.1   Blockchain',
  '          EdgeOracle   94.8     Security',
  '              FluxDB   93.2    Databases',
  '            GridMind   92.7      Systems',
  '         VectorPulse   91.3        AI/ML',
  '           NanoForge   90.8     Hardware',
  '           SynthWave   89.6        AI/ML',
  '          Heliograph   88.2     Security',
  '           ChronoSQL   87.9    Databases',
  '',
  '  chart:base64: [PNG · 48.2 KB · 1500×900px]',
  '',
  '$ Executed in 42ms  ·  Exit code: 0',
]

const CSV_COLS = ['team_id', 'project_name', 'category', 'score', 'judges', 'submission_url']
const CSV_DTYPES = ['str', 'str', 'str', 'float64', 'int32', 'str']
const CSV_ROWS = [
  ['TM_001', 'QuantumSync AI', 'AI/ML', '97.4', '5', 'submit.io/qa7x2'],
  ['TM_002', 'NeuralMesh', 'Blockchain', '96.1', '5', 'submit.io/nm3k9'],
  ['TM_003', 'EdgeOracle', 'Security', '94.8', '4', 'submit.io/eo1p4'],
  ['TM_004', 'FluxDB', 'Databases', '93.2', '5', 'submit.io/fd8r1'],
  ['TM_005', 'GridMind', 'Systems', '92.7', '4', 'submit.io/gm2v5'],
  ['TM_006', 'VectorPulse', 'AI/ML', '91.3', '3', 'submit.io/vp9x7'],
  ['TM_007', 'NanoForge', 'Hardware', '90.8', '5', 'submit.io/nf4q2'],
  ['TM_008', 'SynthWave', 'AI/ML', '89.6', '4', 'submit.io/sw6k3'],
  ['TM_009', 'Heliograph', 'Security', '88.2', '5', 'submit.io/hg1m8'],
  ['TM_010', 'ChronoSQL', 'Databases', '87.9', '3', 'submit.io/cs5r2'],
]

// ─── Utility Components ─────────────────────────────────────────────────────────

function PulsingDot() {
  return (
    <span className="relative inline-flex h-2 w-2 flex-shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
    </span>
  )
}

function CopyBtn({ text, label = 'copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setDone(true)
      setTimeout(() => setDone(false), 1800)
    })
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-all text-xs font-mono"
    >
      {done ? (
        <span className="text-emerald-400">✓ copied</span>
      ) : (
        <>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="0.5" y="2.5" width="6" height="7" rx="1" stroke="currentColor" strokeWidth="1" />
            <path d="M3 2.5V1.5a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1H7.5" stroke="currentColor" strokeWidth="1" />
          </svg>
          {label}
        </>
      )}
    </button>
  )
}

function Skeleton({ w = 'w-full', h = 'h-3' }: { w?: string; h?: string }) {
  return <div className={`${w} ${h} rounded shimmer`} />
}

function ToolBadge({ tool }: { tool: ToolStep['tool'] }) {
  const cfg = {
    runPython: { cls: 'text-lime-400 bg-lime-400/10 border-lime-400/20' },
    searchDocuments: { cls: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
    hybrid: { cls: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  }[tool]
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-mono text-xs border ${cfg.cls}`}>
      {tool}
    </span>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score < 0.2
      ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/25'
      : score > 0.35
        ? 'text-amber-400 bg-amber-400/10 border-amber-400/25'
        : 'text-zinc-300 bg-zinc-800 border-zinc-700'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-mono text-xs border ${cls}`}>
      Δ {score.toFixed(3)}
    </span>
  )
}

// Simple markdown → JSX renderer
function MessageContent({ content }: { content: string }) {
  const lines = content.split('\n')
  const nodes: React.ReactNode[] = []
  const tableBuffer: string[] = []
  let key = 0

  const boldify = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*[^*]+\*\*)/)
    return parts.map((p, i) =>
      p.startsWith('**') && p.endsWith('**') ? (
        <strong key={i} className="text-zinc-100 font-semibold">
          {p.slice(2, -2)}
        </strong>
      ) : (
        p
      ),
    )
  }

  const flushTable = () => {
    if (!tableBuffer.length) return
    const rows = tableBuffer.filter((r) => !r.replace(/[\s|]/g, '').match(/^-+$/))
    const [header, ...body] = rows
    const headerCells = header
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean)
    nodes.push(
      <div key={key++} className="overflow-x-auto my-2 rounded border border-zinc-800">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/60">
              {headerCells.map((c, j) => (
                <th key={j} className="px-3 py-1.5 text-zinc-500 uppercase tracking-wide font-mono text-xs">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => {
              const cells = row
                .split('|')
                .map((c) => c.trim())
                .filter(Boolean)
              return (
                <tr key={ri} className="border-b border-zinc-900 last:border-0 hover:bg-zinc-800/20">
                  {cells.map((c, j) => (
                    <td key={j} className="px-3 py-1.5 text-zinc-300">
                      {c}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>,
    )
    tableBuffer.length = 0
  }

  for (const line of lines) {
    if (line.trim().startsWith('|')) {
      tableBuffer.push(line)
      continue
    }
    flushTable()

    if (line.startsWith('## '))
      nodes.push(
        <h3 key={key++} className="text-sm font-semibold text-zinc-100 mt-3 mb-1.5">
          {line.slice(3)}
        </h3>,
      )
    else if (line.startsWith('# '))
      nodes.push(
        <h2 key={key++} className="text-base font-bold text-zinc-100 mt-3 mb-2">
          {line.slice(2)}
        </h2>,
      )
    else if (line.startsWith('- '))
      nodes.push(
        <li key={key++} className="text-sm text-zinc-300 ml-4 list-disc leading-relaxed">
          {boldify(line.slice(2))}
        </li>,
      )
    else if (line.trim() === '') nodes.push(<div key={key++} className="h-1" />)
    else
      nodes.push(
        <p key={key++} className="text-sm text-zinc-300 leading-relaxed">
          {boldify(line)}
        </p>,
      )
  }
  flushTable()

  return <div className="space-y-0.5">{nodes}</div>
}

// Inline synthetic bar chart (replaces base64 matplotlib output)
function InlineBarChart() {
  const bars = [
    { name: 'QuantumSync AI', val: 97.4, highlight: true },
    { name: 'NeuralMesh', val: 96.1, highlight: true },
    { name: 'EdgeOracle', val: 94.8, highlight: false },
    { name: 'FluxDB', val: 93.2, highlight: false },
    { name: 'GridMind', val: 92.7, highlight: false },
  ]
  const barH = 22
  const gap = 8
  const labelW = 108
  const chartW = 260
  const H = bars.length * (barH + gap) + 32

  return (
    <svg width="100%" viewBox={`0 0 ${labelW + chartW + 60} ${H}`} className="w-full">
      <text x={labelW} y={14} fontSize={9} fill="#71717a" fontFamily="JetBrains Mono, monospace">
        Score Distribution · Top Projects 2024
      </text>
      {bars.map((d, i) => {
        const y = 22 + i * (barH + gap)
        const w = ((d.val - 90) / 10) * chartW
        return (
          <g key={d.name}>
            <text
              x={labelW - 8}
              y={y + barH / 2 + 4}
              textAnchor="end"
              fontSize={9}
              fill="#71717a"
              fontFamily="JetBrains Mono, monospace"
            >
              {d.name.length > 14 ? d.name.slice(0, 13) + '…' : d.name}
            </text>
            <rect x={labelW} y={y} width={w} height={barH} rx={2} fill={d.highlight ? '#a3e635' : '#10b981'} opacity={0.8} />
            <text
              x={labelW + w + 6}
              y={y + barH / 2 + 4}
              fontSize={9}
              fill="#a1a1aa"
              fontFamily="JetBrains Mono, monospace"
            >
              {d.val}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Header ──────────────────────────────────────────────────────────────────────

function Header({
  sessionId,
  onDemo,
  addToast,
}: {
  sessionId: string
  onDemo: () => void
  addToast: (msg: string, kind: ToastKind) => void
}) {
  return (
    <header className="h-12 flex items-center px-4 gap-3 border-b border-zinc-800 bg-zinc-950 flex-shrink-0 z-20">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-1">
        <div className="w-6 h-6 rounded bg-lime-400/10 border border-lime-400/25 flex items-center justify-center flex-shrink-0">
          <span className="text-lime-400 text-xs font-mono font-bold leading-none">R</span>
        </div>
        <span className="text-zinc-100 text-sm font-semibold tracking-tight whitespace-nowrap">RAG Console</span>
        <span className="text-zinc-700 text-xs font-mono hidden sm:inline">v2.4.1</span>
      </div>

      <div className="w-px h-4 bg-zinc-800 flex-shrink-0" />

      {/* Status pills */}
      <div className="flex items-center gap-2">
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-xs whitespace-nowrap">
          <PulsingDot />
          <span className="font-mono text-zinc-300">Java Orchestrator</span>
          <span className="text-zinc-600">@:8080</span>
        </div>
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-xs whitespace-nowrap">
          <PulsingDot />
          <span className="font-mono text-zinc-300">Python Engine</span>
          <span className="text-zinc-600">@:8000</span>
        </div>
      </div>

      {/* Session ID */}
      <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-900/60 border border-zinc-800 flex-shrink-0">
        <span className="text-zinc-700 text-xs font-mono">session</span>
        <span className="font-mono text-xs text-zinc-400">{sessionId}</span>
      </div>

      <div className="flex-1" />

      {/* Demo button */}
      <button
        onClick={onDemo}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-lime-400/10 border border-lime-400/25 text-lime-400 text-xs font-medium hover:bg-lime-400/20 transition-colors whitespace-nowrap"
      >
        <span>⚡</span>
        <span className="hidden sm:inline">Load Hackathon Demo Dataset</span>
        <span className="sm:hidden">Demo</span>
      </button>

      {/* Quick actions */}
      <div className="hidden sm:flex items-center gap-0.5">
        {[
          { label: 'Health', msg: '[GET /health 200 OK - 3ms]', kind: 'ok' as ToastKind },
          { label: 'Reset', msg: '[POST /session/reset 200 OK - 8ms]', kind: 'info' as ToastKind },
        ].map((a) => (
          <button
            key={a.label}
            onClick={() => addToast(a.msg, a.kind)}
            className="px-2.5 py-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors text-xs"
          >
            {a.label}
          </button>
        ))}
      </div>
    </header>
  )
}

// ─── Module 1: Ingestion & Profiling ────────────────────────────────────────────

function ModuleIngestion({
  files,
  setFiles,
  addToast,
}: {
  files: ParsedFile[]
  setFiles: React.Dispatch<React.SetStateAction<ParsedFile[]>>
  addToast: (msg: string, kind: ToastKind) => void
}) {
  const [dragging, setDragging] = useState(false)
  const [cleanLoading, setCleanLoading] = useState<CleanOp | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (dropped: File[]) => {
    if (!dropped.length) return
    const f = dropped[0]
    const isCSV = f.name.toLowerCase().endsWith('.csv')
    const placeholderId = 'file_' + Math.random().toString(36).slice(2, 10)
    const placeholder: ParsedFile = {
      id: placeholderId,
      name: f.name,
      type: isCSV ? 'csv' : 'pdf',
      size: `${(f.size / 1048576).toFixed(1)} MB`,
      nullPct: 0,
      typeMismatches: 0,
      dupeRows: 0,
      status: 'parsing',
    }
    setFiles((prev) => [placeholder, ...prev])

    const t0 = Date.now()
    try {
      if (isCSV) {
        const data = await parseCSV(f)
        const ms = Date.now() - t0
        setFiles((prev) =>
          prev.map((file) =>
            file.id === placeholderId
              ? {
                  ...file,
                  id: data.file_id,
                  rows: data.row_count,
                  cols: data.columns,
                  nullPct: 0,
                  typeMismatches: 0,
                  dupeRows: 0,
                  status: 'done',
                }
              : file,
          ),
        )
        addToast(`[POST /parse/csv 200 OK - ${ms}ms] ${data.file_id}`, 'ok')
      } else {
        const data = await parsePDF(f)
        const ms = Date.now() - t0
        setFiles((prev) =>
          prev.map((file) =>
            file.id === placeholderId
              ? {
                  ...file,
                  id: data.file_id,
                  pages: data.page_count,
                  nullPct: 0,
                  typeMismatches: 0,
                  dupeRows: 0,
                  status: 'done',
                }
              : file,
          ),
        )
        addToast(`[POST /parse/pdf 200 OK - ${ms}ms] ${data.file_id} · ${data.chunks.length} chunks`, 'ok')
        // Auto-embed chunks into the vector store
        if (data.chunks.length > 0) {
          const t1 = Date.now()
          await embedChunks(data.chunks)
          addToast(`[POST /embed 200 OK - ${Date.now() - t1}ms] ${data.chunks.length} chunks indexed`, 'ok')
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setFiles((prev) => prev.filter((file) => file.id !== placeholderId))
      addToast(`[ERROR] Parse failed: ${msg}`, 'err')
    }
  }

  const handleClean = async (op: CleanOp) => {
    if (!selectedFile) return
    setCleanLoading(op)
    const t0 = Date.now()
    // map frontend op names to backend operation names
    const opMap: Record<CleanOp, string> = {
      drop_nulls: 'drop_nulls',
      fill_nulls: 'fill_nulls',
      dedupe: 'dedupe',
      cast_types: 'cast_dtype',
    }
    try {
      const data = await cleanData(selectedFile.id, opMap[op])
      addToast(`[POST /clean 200 OK - ${Date.now() - t0}ms] ${data.summary}`, 'ok')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      addToast(`[ERROR] Clean failed: ${msg}`, 'err')
    } finally {
      setCleanLoading(null)
    }
  }

  const selectedFile = files.find((f) => f.type === 'csv' && f.status === 'done') ?? files[0]

  const cleanOps: { op: CleanOp; label: string; desc: string }[] = [
    { op: 'drop_nulls', label: 'Drop Nulls', desc: 'Remove rows with NaN' },
    { op: 'fill_nulls', label: 'Fill Nulls', desc: 'Forward-fill missing' },
    { op: 'dedupe', label: 'Dedupe', desc: 'Remove duplicate rows' },
    { op: 'cast_types', label: 'Cast Types', desc: 'Infer & coerce dtypes' },
  ]

  return (
    <div className="flex-1 overflow-hidden p-4 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 min-h-0">
      {/* Left: Dropzone + file cards */}
      <div className="flex flex-col gap-4 overflow-y-auto hide-scrollbar min-h-0">
        {/* Dropzone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(Array.from(e.dataTransfer.files)) }}
          onClick={() => fileRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-3 rounded border-2 border-dashed py-10 px-6 cursor-pointer transition-all ${
            dragging
              ? 'border-lime-400/50 bg-lime-400/5'
              : 'border-zinc-700/60 bg-zinc-900/20 hover:border-zinc-600 hover:bg-zinc-900/40'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.pdf"
            className="hidden"
            onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
          />
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-colors ${
              dragging ? 'border-lime-400/40 bg-lime-400/10' : 'border-zinc-700 bg-zinc-900'
            }`}
          >
            <svg
              className={`w-5 h-5 transition-colors ${dragging ? 'text-lime-400' : 'text-zinc-500'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm text-zinc-300">
              {dragging ? 'Release to parse' : 'Drop files here or click to browse'}
            </p>
            <p className="text-xs text-zinc-600 mt-1 font-mono">Supports .csv · .pdf</p>
          </div>
        </div>

        {/* File cards */}
        <div className="space-y-3">
          {files.length === 0 && (
            <div className="text-center py-12 text-zinc-700 text-sm font-mono">
              No files ingested — drop a file or load the demo dataset
            </div>
          )}
          {files.map((file) => (
            <div key={file.id} className="rounded border border-zinc-800 bg-zinc-900/40 p-4 group">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`flex-shrink-0 text-xs font-mono px-1.5 py-0.5 rounded border ${
                      file.type === 'csv'
                        ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                        : 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                    }`}
                  >
                    {file.type.toUpperCase()}
                  </span>
                  <span className="text-sm text-zinc-100 font-medium truncate">{file.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {file.status === 'parsing' ? (
                    <span className="flex items-center gap-1 text-xs text-zinc-500 font-mono">
                      <span className="animate-spin inline-block">◐</span> parsing
                    </span>
                  ) : (
                    <span className="text-xs text-emerald-400 font-mono">✓ parsed</span>
                  )}
                  <CopyBtn text={file.id} label="id" />
                </div>
              </div>

              {file.status === 'parsing' ? (
                <div className="space-y-2">
                  <Skeleton w="w-3/4" />
                  <Skeleton w="w-1/2" />
                  <Skeleton w="w-2/3" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    {[
                      { label: 'FILE_ID', val: file.id },
                      { label: 'SIZE', val: file.size },
                      {
                        label: file.type === 'csv' ? 'ROWS' : 'PAGES',
                        val: file.type === 'csv' ? (file.rows ?? 0).toLocaleString() : String(file.pages),
                      },
                    ].map((s) => (
                      <div key={s.label}>
                        <p className="text-xs text-zinc-700 mb-0.5 font-mono">{s.label}</p>
                        <p className="text-xs font-mono text-zinc-400 truncate">{s.val}</p>
                      </div>
                    ))}
                  </div>
                  {file.cols && (
                    <div className="mb-3">
                      <p className="text-xs text-zinc-700 mb-1.5 font-mono">SCHEMA</p>
                      <div className="flex flex-wrap gap-1.5">
                        {file.cols.map((col) => (
                          <span
                            key={col.name}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/60 text-xs font-mono"
                          >
                            <span className="text-zinc-200">{col.name}</span>
                            <span className="text-zinc-600">:{col.dtype}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Parsed badge */}
                  <div className="pt-3 border-t border-zinc-800/60">
                    <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 14 14" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M2 7l4 4 6-6" />
                      </svg>
                      Parsed &amp; stored in backend · {file.id}
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Upload more files button — shown below existing file cards */}
          {files.length > 0 && (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded border border-dashed border-zinc-700/50 text-xs font-mono text-zinc-600 hover:border-zinc-500 hover:text-zinc-400 hover:bg-zinc-900/30 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 3v10M3 8h10" />
              </svg>
              Upload another file
            </button>
          )}
        </div>
      </div>

      {/* Right: Profiling + Cleaning + Endpoints */}
      <div className="flex flex-col gap-4 overflow-y-auto hide-scrollbar min-h-0">
        {/* Data Profiling */}
        {selectedFile?.status === 'done' ? (
          <div className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-zinc-100">Data Profiling</h3>
              <span className="text-xs font-mono text-zinc-600 truncate max-w-[160px]">{selectedFile.name}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                {
                  label: 'NULL %',
                  val: `${selectedFile.nullPct}%`,
                  cls: selectedFile.nullPct > 5 ? 'text-red-400' : 'text-zinc-200',
                },
                {
                  label: 'TYPE ERR',
                  val: String(selectedFile.typeMismatches),
                  cls: selectedFile.typeMismatches > 0 ? 'text-amber-400' : 'text-emerald-400',
                },
                {
                  label: 'DUPES',
                  val: String(selectedFile.dupeRows),
                  cls: selectedFile.dupeRows > 0 ? 'text-amber-400' : 'text-emerald-400',
                },
              ].map((s) => (
                <div key={s.label} className="rounded bg-zinc-950/60 border border-zinc-800 p-3 text-center">
                  <p className="text-xs text-zinc-700 mb-1 font-mono">{s.label}</p>
                  <p className={`text-lg font-mono font-semibold ${s.cls}`}>{s.val}</p>
                </div>
              ))}
            </div>
            {/* Null distribution */}
            <p className="text-xs text-zinc-700 font-mono mb-2">NULL DISTRIBUTION</p>
            <div className="space-y-2">
              {(selectedFile.cols ?? [
                { name: 'column_0', dtype: 'str' },
                { name: 'column_1', dtype: 'float64' },
                { name: 'column_2', dtype: 'str' },
                { name: 'column_3', dtype: 'int32' },
              ])
                .slice(0, 4)
                .map((col, i) => {
                  const pct = i === 1 ? selectedFile.nullPct * 2.8 : i === 0 ? selectedFile.nullPct * 0.3 : selectedFile.nullPct * 0.6
                  return (
                    <div key={col.name} className="flex items-center gap-2">
                      <span className="w-20 text-xs font-mono text-zinc-500 truncate">{col.name}</span>
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${pct > 5 ? 'bg-red-400' : 'bg-zinc-600'}`}
                          style={{ width: `${Math.min(pct * 8, 100)}%` }}
                        />
                      </div>
                      <span className="w-10 text-xs font-mono text-zinc-600 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  )
                })}
            </div>
          </div>
        ) : (
          <div className="rounded border border-zinc-800 bg-zinc-900/30 p-4">
            <div className="space-y-3">
              <Skeleton w="w-1/2" h="h-4" />
              <div className="grid grid-cols-3 gap-2">
                <Skeleton h="h-16" />
                <Skeleton h="h-16" />
                <Skeleton h="h-16" />
              </div>
              <Skeleton />
              <Skeleton w="w-5/6" />
              <Skeleton w="w-3/4" />
              <Skeleton w="w-2/3" />
            </div>
          </div>
        )}

        {/* Cleaning Actions */}
        <div className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="text-sm font-semibold text-zinc-100">Data Cleaning</h3>
            <span className="text-xs font-mono text-zinc-700">POST /clean</span>
          </div>
          <p className="text-xs font-mono text-zinc-700 mb-3">
            target: {selectedFile?.id ?? 'no file selected'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {cleanOps.map(({ op, label, desc }) => (
              <button
                key={op}
                onClick={() => handleClean(op)}
                disabled={!selectedFile || cleanLoading !== null}
                title={desc}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded border text-xs font-mono transition-all ${
                  cleanLoading === op
                    ? 'border-lime-400/40 bg-lime-400/10 text-lime-400'
                    : 'border-zinc-700/60 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed'
                }`}
              >
                {cleanLoading === op && <span className="animate-spin inline-block">◐</span>}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Endpoint reference */}
        <div className="rounded border border-zinc-800 bg-zinc-900/30 p-4">
          <p className="text-xs font-mono text-zinc-700 mb-2.5">ENDPOINT REFERENCE</p>
          <div className="space-y-1.5">
            {[
              { method: 'POST', path: '/parse/csv', desc: 'Ingest & profile CSV' },
              { method: 'POST', path: '/parse/pdf', desc: 'Extract & chunk PDF' },
              { method: 'POST', path: '/clean', desc: 'Apply cleaning operation' },
              { method: 'GET', path: '/parse/status/:id', desc: 'Async parse status' },
            ].map((ep) => (
              <div key={ep.path} className="flex items-center gap-2">
                <span
                  className={`text-xs font-mono px-1.5 py-0.5 rounded flex-shrink-0 ${
                    ep.method === 'POST' ? 'text-lime-400 bg-lime-400/10' : 'text-blue-400 bg-blue-400/10'
                  }`}
                >
                  {ep.method}
                </span>
                <span className="text-xs font-mono text-zinc-400">{ep.path}</span>
                <span className="text-xs text-zinc-700 ml-auto truncate">{ep.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Module 2: Chat & Agent Workspace ---

function ModuleChat({ addToast }: { addToast: (msg: string, kind: ToastKind) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES)
  const [steps, setSteps] = useState<ToolStep[]>(MOCK_STEPS)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const sendMessage = async () => {
    if (!input.trim() || sending) return
    const userMsg: ChatMessage = {
      id: 'u_' + Date.now(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
    }
    const thinkingId = 'think_' + Date.now()
    const thinkingMsg: ChatMessage = {
      id: thinkingId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      thinking: true,
    }
    setMessages((prev) => [...prev, userMsg, thinkingMsg])
    setInput('')
    setSending(true)

    const stepId = 'ns_' + Date.now()
    const newStep: ToolStep = {
      id: stepId,
      tool: 'searchDocuments',
      status: 'running',
      durationMs: 0,
      payload: JSON.stringify({ query: userMsg.content.slice(0, 80), topK: 5 }),
      responseCode: 0,
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
    }
    setSteps((prev) => [...prev, newStep])

    const t0 = Date.now()
    try {
      // Step 1: Real semantic search via /search
      const results = await searchDocs(userMsg.content, 5)
      const dur = Date.now() - t0
      setSteps((prev) =>
        prev.map((s) =>
          s.id === stepId ? { ...s, status: 'done', durationMs: dur, responseCode: 200 } : s,
        ),
      )

      // Step 2: Synthesize a response from search results (orchestrator not available, summarize locally)
      const topChunks = results.slice(0, 3)
      const avgDist = topChunks.length
        ? (topChunks.reduce((a, r) => a + r.distance, 0) / topChunks.length).toFixed(3)
        : 'N/A'
      const sources = [...new Set(topChunks.map((r) => r.file_id ?? 'unknown'))]
      const snippets = topChunks
        .map((r, i) => `**[${i + 1}]** (Δ ${r.distance.toFixed(3)}) ${r.text.slice(0, 200)}…`)
        .join('\n\n')

      const responseContent =
        topChunks.length > 0
          ? `Found **${results.length} relevant chunks** from the vector index.\n\n${snippets}\n\n**Avg. distance**: ${avgDist}  ·  **Sources**: ${sources.join(', ')}`
          : `No indexed content found matching your query. Upload and index a PDF or CSV first, then try again.`

      const citations = topChunks.map((r) => ({
        file: r.file_id ?? 'unknown',
        page: r.page ?? undefined,
      }))

      setMessages((prev) =>
        prev.map((m) =>
          m.id === thinkingId
            ? { ...m, thinking: false, content: responseContent, citations }
            : m,
        ),
      )
      addToast(`[POST /search 200 OK - ${dur}ms] ${results.length} chunks`, 'ok')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setSteps((prev) =>
        prev.map((s) =>
          s.id === stepId ? { ...s, status: 'done', durationMs: Date.now() - t0, responseCode: 500 } : s,
        ),
      )
      setMessages((prev) =>
        prev.map((m) =>
          m.id === thinkingId
            ? { ...m, thinking: false, content: `Search failed: ${msg}\n\nIs the backend running on :8000?` }
            : m,
        ),
      )
      addToast(`[ERROR] Search failed: ${msg}`, 'err')
    } finally {
      setSending(false)
    }
  }Messages((prev) =>
        prev.map((m) =>
          m.id === thinkingId
            ? {
                ...m,
                thinking: false,
                content: `Based on the indexed knowledge, I found **${Math.floor(Math.random() * 4 + 2)} relevant chunks** matching your query.\n\nThe most relevant passage scores Δ 0.14 against your query vector. No Python execution was required — this was a pure retrieval task.\n\n**Confidence**: High  ·  **Avg. distance**: 0.21  ·  **Sources**: 2 files`,
                citations: [{ file: 'technical_architecture_v3.pdf', page: 22 }],
              }
            : m,
        ),
      )
      setSending(false)
      addToast(`[POST /api/ask 200 OK - ${Math.floor(Math.random() * 200 + 100)}ms]`, 'ok')
    }, 2200)
  }

  return (
    <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_360px] min-h-0">
      {/* Left: Chat */}
      <div className="flex flex-col border-r border-zinc-800 min-h-0 overflow-hidden">
        <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between flex-shrink-0 bg-zinc-950/50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-zinc-600">POST /api/ask</span>
            <span className="h-3 w-px bg-zinc-800" />
            <span className="text-xs font-mono text-zinc-700">claude-sonnet-4-6</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-zinc-700">
              {messages.filter((m) => m.role === 'user').length} turns
            </span>
            <button
              onClick={() => setMessages([])}
              className="text-xs font-mono text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              clear
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div
                className={`flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-mono ${
                  msg.role === 'user'
                    ? 'bg-zinc-800 border border-zinc-700 text-zinc-400'
                    : 'bg-lime-400/10 border border-lime-400/25 text-lime-400'
                }`}
              >
                {msg.role === 'user' ? 'U' : 'R'}
              </div>
              <div
                className={`flex-1 flex flex-col gap-1.5 max-w-[88%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`rounded px-3 py-2.5 ${
                    msg.role === 'user'
                      ? 'bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm'
                      : 'bg-zinc-900/50 border border-zinc-800'
                  }`}
                >
                  {msg.thinking ? (
                    <div className="flex items-center gap-2 text-zinc-500 py-0.5">
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-bounce"
                            style={{ animationDelay: `${i * 160}ms` }}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-mono">Agent reasoning...</span>
                    </div>
                  ) : msg.role === 'user' ? (
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  ) : (
                    <MessageContent content={msg.content} />
                  )}
                </div>

                {/* Inline chart */}
                {msg.hasChart && (
                  <div className="w-full rounded border border-zinc-800 bg-zinc-950/70 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <ToolBadge tool="runPython" />
                      <span className="text-xs text-zinc-600 font-mono">matplotlib chart output</span>
                      <span className="ml-auto text-xs font-mono text-zinc-700">67ms</span>
                    </div>
                    <div className="bg-[#09090b] rounded p-2">
                      <InlineBarChart />
                    </div>
                  </div>
                )}

                {/* Citations */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {msg.citations.map((c, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-xs font-mono"
                      >
                        <span className="text-zinc-700">↗</span>
                        <span className="text-zinc-400 truncate max-w-[130px]">{c.file}</span>
                        {c.page && <span className="text-zinc-600">p.{c.page}</span>}
                        {c.rowRange && <span className="text-zinc-600">{c.rowRange}</span>}
                      </span>
                    ))}
                  </div>
                )}

                <span className="text-xs text-zinc-700 font-mono">{msg.timestamp}</span>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-zinc-800 p-3 flex-shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="Ask the RAG agent… (Enter to send)"
              rows={2}
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600/30 resize-none transition-colors"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="flex items-center gap-1.5 px-4 py-2 rounded bg-lime-400 text-zinc-950 text-xs font-semibold hover:bg-lime-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors self-stretch"
            >
              {sending ? <span className="animate-spin">◐</span> : '↑'}
              <span>Send</span>
            </button>
          </div>
          <p className="text-xs text-zinc-700 font-mono mt-1.5 px-0.5">Shift+Enter for newline</p>
        </div>
      </div>

      {/* Right: Agent Trace Inspector */}
      <div className="hidden lg:flex flex-col min-h-0 overflow-hidden">
        <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between flex-shrink-0 bg-zinc-950/50">
          <span className="text-xs font-semibold text-zinc-300">Agent Reasoning Trace</span>
          <span className="text-xs font-mono text-zinc-600">{steps.length} steps</span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 hide-scrollbar">
          {steps.map((step, idx) => (
            <div key={step.id} className="rounded border border-zinc-800 bg-zinc-900/30 overflow-hidden">
              <button
                onClick={() => toggleExpand(step.id)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-800/30 transition-colors"
              >
                <span className="flex-shrink-0 w-5 h-5 rounded bg-zinc-800 border border-zinc-700 text-xs font-mono text-zinc-600 flex items-center justify-center">
                  {idx + 1}
                </span>
                <span
                  className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${
                    step.status === 'done'
                      ? 'bg-emerald-400'
                      : step.status === 'running'
                        ? 'bg-lime-400 animate-pulse'
                        : 'bg-zinc-600'
                  }`}
                />
                <ToolBadge tool={step.tool} />
                <div className="flex-1 min-w-0" />
                <div className="flex items-center gap-2 flex-shrink-0">
                  {step.responseCode > 0 && (
                    <span
                      className={`text-xs font-mono ${step.responseCode === 200 ? 'text-emerald-400' : 'text-red-400'}`}
                    >
                      {step.responseCode}
                    </span>
                  )}
                  {step.durationMs > 0 && (
                    <span className="text-xs font-mono text-zinc-600">{step.durationMs}ms</span>
                  )}
                  <span className="text-zinc-700 text-xs">{expanded.has(step.id) ? '▲' : '▼'}</span>
                </div>
              </button>

              {expanded.has(step.id) && (
                <div className="border-t border-zinc-800/50 px-3 py-2.5 bg-zinc-950/50">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-zinc-700 font-mono">INPUT PAYLOAD</span>
                    <CopyBtn text={step.payload} />
                  </div>
                  <pre className="text-xs font-mono text-zinc-400 whitespace-pre-wrap break-all leading-relaxed">
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(step.payload), null, 2)
                      } catch {
                        return step.payload
                      }
                    })()}
                  </pre>
                  <div className="flex items-center gap-3 mt-2 pt-2 border-t border-zinc-800/30 text-xs font-mono text-zinc-700">
                    <span>ts: {step.timestamp}</span>
                    <span>HTTP {step.responseCode}</span>
                    <span>⏱ {step.durationMs}ms</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="border-t border-zinc-800 px-3 py-2.5 flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <ToolBadge tool="runPython" />
            <ToolBadge tool="searchDocuments" />
            <ToolBadge tool="hybrid" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Module 3: RAG Search Inspector ─────────────────────────────────────────────

function ModuleSearch({
  onSwitchToSearch,
  addToast,
}: {
  onSwitchToSearch: () => void
  addToast: (msg: string, kind: ToastKind) => void
}) {
  const [query, setQuery] = useState('')
  const [topK, setTopK] = useState(5)
  const [entityFilters, setEntityFilters] = useState<string[]>([])
  const [results, setResults] = useState<SearchHit[]>(MOCK_SEARCH_HITS)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onSwitchToSearch()
        setTimeout(() => inputRef.current?.focus(), 80)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onSwitchToSearch])

  const doSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    const t0 = Date.now()
    try {
      const rawResults = await searchDocs(query, topK)
      const ms = Date.now() - t0
      // Map backend SearchResult → SearchHit
      const mapped = rawResults.map((r, i) => ({
        id: `hit_${i}`,
        text: r.text,
        score: r.distance,
        source: r.file_id ?? 'unknown',
        page: r.page ?? undefined,
        entities: [],
      }))
      setResults(mapped)
      addToast(`[POST /search 200 OK - ${ms}ms] ${mapped.length} results`, 'ok')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      addToast(`[ERROR] Search failed: ${msg}`, 'err')
    } finally {
      setSearching(false)
    }
  }

  const allEntities = Array.from(new Set(MOCK_SEARCH_HITS.flatMap((h) => h.entities)))

  const filteredResults = entityFilters.length
    ? results.filter((r) => r.entities.some((e) => entityFilters.includes(e)))
    : results

  return (
    <div className="flex-1 overflow-hidden flex flex-col min-h-0">
      {/* Controls */}
      <div className="p-4 border-b border-zinc-800 flex-shrink-0 space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
              <svg className="w-3.5 h-3.5 text-zinc-600" fill="none" viewBox="0 0 16 16" stroke="currentColor">
                <circle cx="7" cy="7" r="4.5" strokeWidth="1.4" />
                <path d="M10.5 10.5L13 13" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <kbd className="hidden sm:inline px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-600 text-xs font-mono leading-none">
                ⌘K
              </kbd>
            </div>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              placeholder="Search indexed knowledge base..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded pl-12 pr-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600/30 transition-colors"
            />
          </div>
          <button
            onClick={doSearch}
            disabled={!query.trim() || searching}
            className="px-5 py-2.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm font-medium hover:bg-zinc-700 hover:border-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {searching ? <span className="animate-spin inline-block font-mono">◐</span> : 'Search'}
          </button>
        </div>

        <div className="flex items-center gap-6 flex-wrap">
          {/* Top-K */}
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-mono text-zinc-500">Top-K</span>
            <input
              type="range"
              min={1}
              max={20}
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-xs font-mono text-zinc-300 w-4 text-center tabular-nums">{topK}</span>
          </div>

          {/* Entity filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-mono text-zinc-700">Entities:</span>
            {allEntities.slice(0, 7).map((entity) => (
              <button
                key={entity}
                onClick={() =>
                  setEntityFilters((prev) =>
                    prev.includes(entity) ? prev.filter((e) => e !== entity) : [...prev, entity],
                  )
                }
                className={`text-xs px-1.5 py-0.5 rounded border font-mono transition-colors ${
                  entityFilters.includes(entity)
                    ? 'bg-lime-400/10 border-lime-400/25 text-lime-400'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-600 hover:text-zinc-300 hover:border-zinc-700'
                }`}
              >
                {entity}
              </button>
            ))}
            {entityFilters.length > 0 && (
              <button
                onClick={() => setEntityFilters([])}
                className="text-xs font-mono text-zinc-600 hover:text-zinc-300 transition-colors ml-1"
              >
                × clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-mono text-zinc-600">{filteredResults.length} results</span>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-zinc-700">
              <span className="text-emerald-400">●</span> Δ &lt; 0.20
              <span className="text-amber-400 ml-2">●</span> Δ &gt; 0.35
            </span>
          </div>
        </div>

        {searching ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded border border-zinc-800 p-4 space-y-2">
                <div className="flex gap-2">
                  <Skeleton w="w-24" h="h-5" />
                  <Skeleton w="w-16" h="h-5" />
                </div>
                <Skeleton />
                <Skeleton w="w-11/12" />
                <Skeleton w="w-4/5" />
                <div className="flex gap-1.5">
                  <Skeleton w="w-16" h="h-5" />
                  <Skeleton w="w-20" h="h-5" />
                  <Skeleton w="w-14" h="h-5" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredResults.map((hit, idx) => (
              <div
                key={hit.id}
                className="rounded border border-zinc-800 bg-zinc-900/30 p-4 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-zinc-700">#{idx + 1}</span>
                    <span
                      className={`text-xs font-mono px-1.5 py-0.5 rounded border ${
                        hit.source.endsWith('.pdf')
                          ? 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                          : 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                      }`}
                    >
                      {hit.source}
                    </span>
                    {hit.page !== undefined && (
                      <span className="text-xs font-mono text-zinc-600">p.{hit.page}</span>
                    )}
                    {hit.rowRange && <span className="text-xs font-mono text-zinc-600">{hit.rowRange}</span>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <ScoreBadge score={hit.score} />
                    <CopyBtn text={hit.text} />
                  </div>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed mb-3">{hit.text}</p>
                <div className="flex flex-wrap gap-1.5">
                  {hit.entities.map((entity) => (
                    <span
                      key={entity}
                      className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/60 text-zinc-400 font-mono"
                    >
                      {entity}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Module 4: Python Sandbox ────────────────────────────────────────────────────

function ModuleSandbox({ addToast }: { addToast: (msg: string, kind: ToastKind) => void }) {
  const [view, setView] = useState<SandboxView>('editor')
  const [code, setCode] = useState(DEMO_CODE)
  const [running, setRunning] = useState(false)
  const [outputLines, setOutputLines] = useState<string[]>([])
  const [hasRun, setHasRun] = useState(false)
  const [csvSearch, setCsvSearch] = useState('')
  const runningRef = useRef(false)
  const terminalRef = useRef<HTMLDivElement>(null)

  // fileId for the sandbox: use first CSV in the parsed files list, or a demo placeholder
  const [sandboxFileId, setSandboxFileId] = useState<string>('file_7k2mxp9q')
  const [chartBase64, setChartBase64] = useState<string | null>(null)

  const runCode = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    setRunning(true)
    setOutputLines(['$ Executing Python code...', '  ↳ Sending to backend @ :8000/execute'])
    setHasRun(false)
    setChartBase64(null)
    const t0 = Date.now()
    try {
      const result = await executeCode(sandboxFileId, code)
      const ms = Date.now() - t0
      if (result.error) {
        setOutputLines(['$ Error during execution:', `  ${result.error}`, '', `$ Executed in ${ms}ms  ·  Exit code: 1`])
        addToast(`[POST /execute - ${ms}ms] Exit code: 1`, 'err')
      } else {
        const lines = (result.stdout ?? '').split('\n')
        setOutputLines([
          '$ Executing Python code...',
          `  ↳ Runtime: backend Python engine  |  ${ms}ms`,
          '',
          ...lines,
          '',
          `$ Executed in ${ms}ms  ·  Exit code: 0`,
        ])
        if (result.chartBase64) {
          setChartBase64(result.chartBase64)
        }
        addToast(`[POST /execute 200 OK - ${ms}ms]`, 'ok')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setOutputLines(['$ Connection error:', `  ${msg}`, '', '  Is the backend running on :8000?'])
      addToast(`[ERROR] Execute failed: ${msg}`, 'err')
    } finally {
      runningRef.current = false
      setRunning(false)
      setHasRun(true)
    }
  }, [addToast, sandboxFileId, code])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        runCode()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [runCode])

  const codeLines = code.split('\n')
  const filteredRows = CSV_ROWS.filter(
    (row) =>
      !csvSearch ||
      row.some((cell) => cell.toLowerCase().includes(csvSearch.toLowerCase())),
  )

  return (
    <div className="flex-1 overflow-hidden flex flex-col min-h-0">
      {/* Sub-tabs */}
      <div className="flex items-center border-b border-zinc-800 px-4 flex-shrink-0">
        {(['editor', 'matrix'] as SandboxView[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
              view === v
                ? 'border-lime-400 text-lime-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {v === 'editor' ? 'Code Editor' : 'CSV Matrix'}
          </button>
        ))}
        <div className="flex-1" />
        {view === 'editor' && (
          <div className="flex items-center gap-3 py-1.5">
            <span className="text-xs font-mono text-zinc-700">file_id:</span>
            <input
              value={sandboxFileId}
              onChange={(e) => setSandboxFileId(e.target.value)}
              placeholder="Paste a file_id from the Ingest tab"
              className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-zinc-600 w-56 transition-colors"
            />
            <span className="text-xs font-mono text-zinc-700">· Python @ :8000</span>
          </div>
        )}
      </div>

      {view === 'editor' ? (
        <div className="flex-1 overflow-hidden grid grid-rows-[1fr_280px] min-h-0">
          {/* Editor */}
          <div className="overflow-hidden flex flex-col border-b border-zinc-800 min-h-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/30 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-zinc-500">analysis.py</span>
                <span className="text-xs font-mono text-zinc-700">{codeLines.length} lines</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={runCode}
                  disabled={running}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-lime-400 text-zinc-950 text-xs font-semibold hover:bg-lime-300 disabled:opacity-40 transition-colors"
                >
                  {running ? (
                    <span className="animate-spin inline-block">◐</span>
                  ) : (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 12 12">
                      <path d="M3 2l7 4-7 4V2z" />
                    </svg>
                  )}
                  Run
                  <kbd className="px-1 py-0.5 rounded bg-zinc-950/25 text-zinc-900 text-xs font-mono">
                    ⌃↵
                  </kbd>
                </button>
              </div>
            </div>

            <div           {/* Terminal */}
          <div className="bg-[#050507] flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
                </div>
                <span className="text-xs font-mono text-zinc-600">Terminal — Python Engine @ :8000</span>
              </div>
              <div className="flex items-center gap-3">
                {outputLines.length > 0 && <CopyBtn text={outputLines.join('\n')} />}
              </div>
            </div>

            <div ref={terminalRef} className="flex-1 overflow-auto p-4 hide-scrollbar">
              {/* Chart output if returned from backend */}
              {chartBase64 && (
                <div className="mb-4 rounded border border-zinc-800 overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/50 text-xs font-mono text-purple-400">chart output · PNG</div>
                  <img src={`data:image/png;base64,${chartBase64}`} alt="Chart output" className="w-full" />
                </div>
              )}
              {outputLines.length > 0 ? (
                <div
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', lineHeight: '22px' }}
                >
                  {outputLines.map((line, i) => (
                    <div
                      key={i}
                      className={
                        line.startsWith('$')
                          ? 'text-lime-400'
                          : line.includes('Exit code: 0') || line.includes('Exit: 0')
                            ? 'text-emerald-400'
                            : line.toLowerCase().includes('error') || line.includes('Exit code: 1')
                              ? 'text-red-400'
                              : line.startsWith('  ↳')
                                ? 'text-zinc-600'
                                : line.includes('chart:base64:')
                                  ? 'text-purple-400'
                                  : 'text-zinc-400'
                      }
                    >
                      {line || ' '}
                    </div>
                  ))}
                  {running && (
                    <span className="inline-block w-2 h-4 bg-lime-400 animate-pulse" />
                  )}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-xs font-mono text-zinc-700">
                    Press{' '}
                    <kbd className="px-1.5 py-0.5 rounded border border-zinc-800 text-zinc-600 mx-1">
                      Ctrl+Enter
                    </kbd>{' '}
                    or click Run to execute
                  </p>
                </div>
              )}
            </div>
          </div>                       ? 'text-zinc-600'
                                : line.includes('chart:base64:')
                                  ? 'text-purple-400'
                                  : 'text-zinc-400'
                      }
                    >
                      {line || ' '}
                    </div>
                  ))}
                  {running && (
                    <span className="inline-block w-2 h-4 bg-lime-400 animate-pulse" />
                  )}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-xs font-mono text-zinc-700">
                    Press{' '}
                    <kbd className="px-1.5 py-0.5 rounded border border-zinc-800 text-zinc-600 mx-1">
                      Ctrl+Enter
                    </kbd>{' '}
                    or click Run to execute
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* CSV Matrix */
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-zinc-400">hackathon_submissions_2024.csv</span>
              <span className="text-xs font-mono text-zinc-700">8420 rows · 6 cols</span>
              <span className="text-xs font-mono text-zinc-700">RAM: 3.94 MB</span>
            </div>
            <input
              value={csvSearch}
              onChange={(e) => setCsvSearch(e.target.value)}
              placeholder="Filter rows..."
              className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 w-44 font-mono transition-colors"
            />
          </div>

          <div className="flex-1 overflow-auto hide-scrollbar">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur-sm z-10">
                <tr>
                  <th className="px-3 py-2 text-xs font-mono text-zinc-700 border-b border-r border-zinc-800/60 w-8 text-center">
                    #
                  </th>
                  {CSV_COLS.map((col, i) => (
                    <th
                      key={col}
                      className="px-3 py-2 border-b border-r border-zinc-800/60 last:border-r-0"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono text-zinc-300">{col}</span>
                        <span className="text-xs font-mono text-zinc-700 px-1 py-0.5 rounded bg-zinc-900">
                          {CSV_DTYPES[i]}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, ri) => (
                  <tr
                    key={ri}
                    className="border-b border-zinc-900 hover:bg-zinc-800/25 transition-colors"
                  >
                    <td className="px-3 py-2 text-xs font-mono text-zinc-700 border-r border-zinc-800/40 text-center">
                      {ri + 1}
                    </td>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="px-3 py-2 text-xs font-mono border-r border-zinc-800/40 last:border-r-0 max-w-[180px]"
                      >
                        <span
                          className={`truncate block ${
                            CSV_DTYPES[ci] === 'float64' || CSV_DTYPES[ci] === 'int32'
                              ? 'text-lime-400/80 tabular-nums'
                              : cell.startsWith('submit.')
                                ? 'text-blue-400/70'
                                : 'text-zinc-400'
                          }`}
                          title={cell}
                        >
                          {cell}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={CSV_COLS.length + 1} className="px-4 py-8 text-center text-xs font-mono text-zinc-700">
                      No rows match filter "{csvSearch}"
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Toast Stack ─────────────────────────────────────────────────────────────────

function ToastStack({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`toast-enter pointer-events-auto flex items-center gap-2.5 px-3 py-2 rounded border text-xs font-mono shadow-2xl max-w-sm cursor-pointer ${
            t.kind === 'ok'
              ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
              : t.kind === 'err'
                ? 'bg-zinc-900 border-red-500/30 text-zinc-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-300'
          }`}
        >
          <span
            className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${
              t.kind === 'ok' ? 'bg-emerald-400' : t.kind === 'err' ? 'bg-red-400' : 'bg-zinc-500'
            }`}
          />
          {t.msg}
        </div>
      ))}
    </div>
  )
}

// ─── Tab Navigation ───────────────────────────────────────────────────────────────

const TABS: { id: ActiveTab; label: string; endpoint: string }[] = [
  { id: 'ingest', label: 'Ingestion & Profiling', endpoint: '/parse/csv · /parse/pdf · /clean' },
  { id: 'chat', label: 'Agent Workspace', endpoint: '/api/ask' },
  { id: 'search', label: 'RAG Search', endpoint: '/search' },
  { id: 'sandbox', label: 'Python Sandbox', endpoint: '/execute' },
]

// ─── App ──────────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('ingest')
  const [files, setFiles] = useState<ParsedFile[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [sessionId] = useState(() => 'sess_' + Math.random().toString(36).slice(2, 12))

  const addToast = useCallback((msg: string, kind: ToastKind) => {
    const id = Date.now().toString()
    setToasts((prev) => [...prev.slice(-5), { id, msg, kind }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const loadDemo = () => {
    setFiles(MOCK_FILES)
    setActiveTab('ingest')
    addToast('[Demo dataset loaded · 2 files · 8420 rows · 94 pages]', 'ok')
  }

  const switchToSearch = useCallback(() => setActiveTab('search'), [])

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden font-sans">
      <Header sessionId={sessionId} onDemo={loadDemo} addToast={addToast} />

      {/* Tab bar */}
      <div className="flex items-stretch border-b border-zinc-800 px-4 flex-shrink-0 bg-zinc-950 overflow-x-auto hide-scrollbar">
        {TABS.map((tab, i) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs border-b-2 -mb-px transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-lime-400 text-lime-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <span
              className={`w-4 h-4 rounded flex items-center justify-center text-xs font-mono flex-shrink-0 ${
                activeTab === tab.id ? 'bg-lime-400/10 text-lime-400' : 'bg-zinc-800 text-zinc-600'
              }`}
            >
              {i + 1}
            </span>
            {tab.label}
            {activeTab === tab.id && (
              <span className="hidden lg:inline text-zinc-700 font-mono">{tab.endpoint}</span>
            )}
          </button>
        ))}
      </div>

      {/* Module content */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {activeTab === 'ingest' && (
          <ModuleIngestion files={files} setFiles={setFiles} addToast={addToast} />
        )}
        {activeTab === 'chat' && <ModuleChat addToast={addToast} />}
        {activeTab === 'search' && (
          <ModuleSearch onSwitchToSearch={switchToSearch} addToast={addToast} />
        )}
        {activeTab === 'sandbox' && <ModuleSandbox addToast={addToast} />}
      </div>

      <ToastStack toasts={toasts} dismiss={dismissToast} />
    </div>
  )
}
