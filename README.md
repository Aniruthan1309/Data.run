Note for Evaluators:
This repository uses a branch-based development workflow. Individual features (such as document upload, search, indexing, data cleaning, and other components) have been developed and tested in separate feature branches. The main branch may not yet contain all completed work. 

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

## 📁 Project Structure

- **`/` (Root)**: Contains the React frontend application.
- **`/Data.run`**: Contains the backend services, Python scripts, and Spring Boot application.

## ⚙️ Setup Instructions

### 1. Frontend Setup
Make sure you have Node.js installed. From the root directory:
```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

### 2. Backend Setup
Navigate into the backend directory to set up the Python and Spring Boot services.
```bash
cd Data.run

# (Optional) Create a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`

# Install Python requirements
pip install -r requirements.txt
```
*Note: Make sure to start both the Python FastAPI server and the Spring Boot application as per the backend's specific startup instructions.*

## 💡 How It Works
1. **Upload Data**: Users upload CSVs or PDFs through the modern React interface.
2. **Process & Index**: The backend chunks documents and uses Sentence Transformers to store embeddings in Qdrant.
3. **Query**: When a natural language question is asked, the Spring AI orchestrator determines if it requires semantic search (PDF) or data manipulation (CSV/Pandas).
4. **Visualize**: Results and Matplotlib-generated charts are seamlessly returned to the frontend.
