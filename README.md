# Data.run

An AI-powered analytics agent that combines semantic document retrieval and Python-based data analysis to answer natural language queries over CSV and PDF files.

---

## Features

| Module | Description |
|---|---|
| **Ingestion & Profiling** | Upload CSV/PDF files; real-time schema extraction, row counts, and auto-embedding of PDF chunks |
| **Cast Types** | Inline column + dtype selector for casting specific columns (float64, int64, str, bool, datetime64) |
| **RAG Search** | Semantic vector search over indexed PDFs via ChromaDB; shows uploaded files as context badges |
| **Agent Workspace** | Chat interface wired to real `/search`; Knowledge Context panel shows all indexed files |
| **Python Sandbox** | Execute real Python code against uploaded DataFrames; renders stdout and Matplotlib charts |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python · FastAPI · Uvicorn |
| **Embeddings** | Sentence Transformers (`all-MiniLM-L6-v2`) |
| **Vector DB** | ChromaDB |
| **PDF Parsing** | PyMuPDF (fitz) |
| **Data Analysis** | Pandas · Matplotlib |
| **Frontend** | React 18 · TypeScript · Vite · Tailwind CSS |
| **Java Orchestrator** | Spring Boot · Spring AI *(separate branch)* |

---

## Project Structure

```
mainfinal/
├── app/
│   ├── main.py          # FastAPI application & all endpoints
│   ├── executor.py      # Python sandbox execution engine
│   ├── models.py        # Pydantic request/response models
│   └── storage.py       # In-memory DataFrame + chunk stores
├── frontend/
│   ├── src/
│   │   ├── App.tsx      # Full React application (Ingestion, Chat, Search, Sandbox)
│   │   └── api.ts       # Typed API client for all backend endpoints
│   ├── vite.config.ts   # Vite config with /api proxy to :8000
│   └── package.json
├── requirements.txt
└── README.md
```

---

## API Endpoints

| Method | Route | Description |
|---|---|---|
| `POST` | `/parse/csv` | Upload & parse a CSV; returns schema + preview |
| `POST` | `/parse/pdf` | Upload & parse a PDF; returns text chunks |
| `POST` | `/embed` | Embed chunks into ChromaDB vector store |
| `POST` | `/clean` | Clean a DataFrame (drop_nulls, fill_nulls, dedupe, cast_dtype) |
| `POST` | `/search` | Semantic search over indexed chunks |
| `POST` | `/execute` | Execute Python code against a stored DataFrame |

---

## Getting Started

### 1. Backend

```bash
# Install dependencies
pip install -r requirements.txt

# Start the FastAPI server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs available at: **http://localhost:8000/docs**

### 2. Frontend

```bash
cd frontend

# Install Node dependencies (first time only)
npm install

# Start the dev server
npm run dev
```

Frontend available at: **http://localhost:8443**

> The Vite dev server proxies `/api/*` requests to `http://localhost:8000`.

---

## Usage Guide

1. **Ingest** — Go to the **Ingestion** tab and drag-and-drop a `.csv` or `.pdf` file.
   - CSVs are parsed and stored as DataFrames.
   - PDFs are chunked and automatically embedded into the vector store.
   - Copy the `file_id` from the file card for use in the Sandbox.

2. **Clean** — Use the cleaning panel (drop nulls, fill nulls, dedupe). For **Cast Types**, click the button to reveal column name and dtype inputs.

3. **Search** — Switch to the **RAG Search** tab and enter a natural language query. The uploaded files appear as context badges above the search controls.

4. **Chat** — The **Agent Workspace** sends queries to the real `/search` endpoint and displays matching chunks. The right panel shows all indexed files under *Knowledge Context*.

5. **Sandbox** — Go to the **Python Sandbox** tab, paste the `file_id` into the field, write Python code (using `df` as the variable), and press `Ctrl+Enter` or click Run. Real stdout and Matplotlib charts are rendered.

---

## Requirements

```
fastapi
uvicorn[standard]
pandas
sentence-transformers
chromadb
pymupdf
matplotlib
pydantic
requests
qdrant-client
```

---

## License

MIT
