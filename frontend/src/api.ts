// ─── API Client ──────────────────────────────────────────────────────────────
// All calls go to the FastAPI Python backend running on :8000

const BASE_URL = 'http://localhost:8000'

// ─── Types (matching backend response shapes) ─────────────────────────────────

export interface ParsedCSVResponse {
  file_id: string
  columns: { name: string; dtype: string }[]
  row_count: number
  preview: Record<string, unknown>[]
}

export interface ParsedPDFResponse {
  file_id: string
  page_count: number
  chunks: { file_id: string; page: number; text: string }[]
}

export interface CleanResponse {
  file_id: string
  summary: string
}

export interface SearchResult {
  text: string
  file_id: string | null
  page: number | null
  distance: number
}

export interface ExecuteResponse {
  stdout: string | null
  chartBase64: string | null
  error: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

/** Upload a CSV file, parse it and get back schema + preview */
export async function parseCSV(file: File): Promise<ParsedCSVResponse> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE_URL}/parse/csv`, { method: 'POST', body: form })
  return handleResponse<ParsedCSVResponse>(res)
}

/** Upload a PDF file, extract text chunks */
export async function parsePDF(file: File): Promise<ParsedPDFResponse> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE_URL}/parse/pdf`, { method: 'POST', body: form })
  return handleResponse<ParsedPDFResponse>(res)
}

/** Apply a cleaning operation to an in-memory DataFrame */
export async function cleanData(
  fileId: string,
  operation: string,
  column?: string,
  extraArg?: string,
): Promise<CleanResponse> {
  const res = await fetch(`${BASE_URL}/clean`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId, operation, column, extra_arg: extraArg }),
  })
  return handleResponse<CleanResponse>(res)
}

/** Semantic search over indexed documents */
export async function searchDocs(query: string, topK: number = 5): Promise<SearchResult[]> {
  const res = await fetch(`${BASE_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k: topK }),
  })
  return handleResponse<SearchResult[]>(res)
}

/** Execute Python code against an uploaded DataFrame */
export async function executeCode(fileId: string, code: string): Promise<ExecuteResponse> {
  const res = await fetch(`${BASE_URL}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, code }),
  })
  return handleResponse<ExecuteResponse>(res)
}

/** Embed chunks from a parsed PDF into the vector DB */
export async function embedChunks(
  chunks: { file_id: string; page: number; text: string }[],
): Promise<{ message: string }> {
  const res = await fetch(`${BASE_URL}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chunks }),
  })
  return handleResponse<{ message: string }>(res)
}
