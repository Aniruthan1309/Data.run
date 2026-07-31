# Data.run

An AI-powered analytics agent that combines semantic document retrieval and Python-based data analysis to answer natural language queries over CSV and PDF files.

## 🚀 Features

- **CSV analysis**: Powerful data manipulation and insights using Pandas.
- **PDF semantic search**: Deep search capabilities across document contents.
- **Natural language querying**: Ask questions in plain English and get data-driven answers.
- **Hybrid retrieval + computation**: Merges vector search with on-the-fly Python analytics.
- **Interactive visualizations**: Auto-generated charts and graphs using Matplotlib.
- **Modern React UI**: A sleek, responsive frontend for an optimal user experience.

## 🛠️ Tech Stack

### Frontend
- **React** & **Vite**: For a fast, modern component-based UI.
- **TailwindCSS**: For rapid, responsive, and highly customizable styling.

### Backend
- **Spring Boot** & **Spring AI**: Robust Java framework orchestrating the AI logic.
- **Python** & **FastAPI**: High-performance API for data processing.
- **Pandas**: Core library for tabular data analytics.
- **Sentence Transformers**: Generating embeddings for semantic search.
- **Qdrant**: High-performance vector database for storing and querying embeddings.
- **Matplotlib**: For generating data visualizations on the backend.

## Layer	Tech
-Orchestrator	Java, Spring Boot, Spring AI (ChatClient, @Tool, ChatMemory)
-LLM	flash, via gemini API 
-Inter-service comms	REST/HTTP, JSON contract
-Data service	Python, FastAPI
-CSV parsing	pandas
-PDF parsing	pdfplumber / PyMuPDF (+ camelot-py for tables)
-Embeddings	sentence-transformers (local, no API dependency)
-Vector DB	Chroma
-Execution service	Python, FastAPI, sandboxed subprocess (timeout, restricted namespace)
-Charts	matplotlib (returned as base64 PNG)


## 💡 How It Works
1. **Upload Data**: Users upload CSVs or PDFs through the modern React interface.
2. **Process & Index**: The backend chunks documents and uses Sentence Transformers to store embeddings in Qdrant.
3. **Query**: When a natural language question is asked, the Spring AI orchestrator determines if it requires semantic search (PDF) or data manipulation (CSV/Pandas).
4. **Visualize**: Results and Matplotlib-generated charts are seamlessly returned to the frontend.
