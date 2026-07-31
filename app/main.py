import io
import subprocess
import uuid

import fitz
import pandas as pd
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from typing import List, Optional

from app.storage import CHUNKS_DB, FILES_DB, chroma_client, vector_collection

from app.models import ExecuteRequest
from app.executor import execute_code


# Define the expected JSON body for the search request
class SearchRequest(BaseModel):
    query: str
    top_k: Optional[int] = 5  # Default to returning the top 5 chunks if not specified

# Define the expected JSON body for the request
class IndexRequest(BaseModel):
    file_id: str

class CleanRequest(BaseModel):
    file_id: str
    operation: str
    column: Optional[str] = None
    extra_arg: Optional[str] = None

# This is the "app" that Uvicorn is looking for!
app = FastAPI()

# Allow the Vite dev server and any local frontend to call the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:8443",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8443",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# 1. Load the model globally (OUTSIDE the endpoint)
# This takes a few seconds to load, so doing it here means it only happens 
# once when the server starts, not every time a user makes a request.
print("Loading Embedding Model...")
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
print("Model Loaded!")

# 2. Define the exact JSON structure we expect from the orchestrator
class Chunk(BaseModel):
    file_id: str
    page: int
    text: str

class EmbedRequest(BaseModel):
    chunks: List[Chunk]

# 3. Create the endpoint
@app.post("/embed")
async def generate_and_store_embeddings(request: EmbedRequest):
    # 1. Generate the embeddings (Phase 8)
    texts_to_embed = [chunk.text for chunk in request.chunks]
    vectors = embedding_model.encode(texts_to_embed)
    
    # 2. Prepare the lists required by ChromaDB (Phase 9)
    ids = []
    documents = []
    embeddings = []
    metadatas = []
    for i, chunk in enumerate(request.chunks):
        # uuid4 generates a randomized, guaranteed-unique ID string for every chunk
        chunk_id = str(uuid.uuid4())
        
        ids.append(chunk_id)
        documents.append(chunk.text)
        embeddings.append(vectors[i].tolist())
        
        # We store 'file_id' and 'page' in the metadata dictionary
        # This allows you to filter searches later (e.g., "only search file 123")
        metadatas.append({
            "file_id": chunk.file_id,
            "page": chunk.page
        })
        
    # 3. Insert everything into the vector database at once
    vector_collection.add(
        ids=ids,
        documents=documents,
        embeddings=embeddings,
        metadatas=metadatas
    )
        
    return {
        "message": f"Successfully embedded and stored {len(ids)} chunks in ChromaDB."
    }
    
# Temporary in-memory dictionary to store your loaded DataFrames

# Your first required endpoint
@app.post("/parse/csv")
async def parse_csv(file: UploadFile = File(...)):
    # Read the uploaded file into pandas
    df = pd.read_csv(io.BytesIO(await file.read()))
    
    file_id = str(id(df))
    FILES_DB[file_id] = df
    
    return {
        "file_id": file_id,
        "columns": [{"name": col, "dtype": str(dtype)} for col, dtype in df.dtypes.items()],
        "row_count": len(df),
        "preview": df.head(5).to_dict(orient="records")
    }

@app.post("/clean")
async def clean_data(req: CleanRequest):
    # 1. Verify the file exists in memory
    if req.file_id not in FILES_DB:
        raise HTTPException(status_code=404, detail=f"File ID {req.file_id} not found in memory.")
    
    df = FILES_DB[req.file_id]
    original_row_count = len(df)
    summary = ""
    try:
        # 2. Route the requested operation
        if req.operation == "drop_nulls":
            if req.column:
                df.dropna(subset=[req.column], inplace=True)
                summary = f"Dropped nulls in '{req.column}'."
            else:
                df.dropna(inplace=True)
                summary = "Dropped all rows containing any null values."
            summary += f" Rows changed: {original_row_count} -> {len(df)}"

        elif req.operation == "fill_nulls":
            fill_val = req.extra_arg if req.extra_arg is not None else "0"
            if req.column:
                df[req.column] = df[req.column].fillna(fill_val)
                summary = f"Filled nulls in '{req.column}' with '{fill_val}'."
            else:
                df.fillna(fill_val, inplace=True)
                summary = f"Filled all nulls across the dataset with '{fill_val}'."

        elif req.operation == "cast_dtype":
            if not req.column or not req.extra_arg:
                raise HTTPException(
                    status_code=400, 
                    detail="cast_dtype requires both 'column' and 'extra_arg' (e.g., 'float64', 'int', 'string')."
                )
            df[req.column] = df[req.column].astype(req.extra_arg)
            summary = f"Successfully cast column '{req.column}' to {req.extra_arg}."

        elif req.operation == "dedupe":
            if req.column:
                df.drop_duplicates(subset=[req.column], inplace=True)
                summary = f"Removed duplicate rows based on column '{req.column}'."
            else:
                df.drop_duplicates(inplace=True)
                summary = "Removed all exact duplicate rows across the dataset."
            summary += f" Rows changed: {original_row_count} -> {len(df)}"

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported operation: {req.operation}")

        # 3. Update the stored DataFrame
        FILES_DB[req.file_id] = df

        # 4. Return the contract payload
        return {
            "file_id": req.file_id,
            "summary": summary
        }

    except KeyError:
        raise HTTPException(status_code=400, detail=f"Column '{req.column}' does not exist in the dataset.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cleaning operation failed: {str(e)}")
@app.post("/parse/pdf")
async def parse_pdf(file: UploadFile = File(...)):
    # 1. Read the uploaded PDF
    file_bytes = await file.read()
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    
    file_id = str(id(doc))
    page_count = len(doc)
    
    chunks = []
    TARGET_WORD_COUNT = 400
# 2. Page Level: Iterate through every page
    for page_num in range(page_count):
        page = doc.load_page(page_num)
        
        # PyMuPDF's "blocks" extraction naturally separates text into paragraphs
        blocks = page.get_text("blocks")
        
        current_chunk_text = ""
        current_word_count = 0
        
        # 3. Paragraph Level: Iterate through each paragraph block on the page
        for block in blocks:
            # block[6] == 0 ensures we are only looking at text, not images
            if block[6] == 0: 
                paragraph = block[4].strip()
                if not paragraph:
                    continue
                
                paragraph_words = paragraph.split()
                word_count = len(paragraph_words)
                
                # 4. Chunk Level: If adding this paragraph exceeds our target, save the chunk
                if current_word_count + word_count > TARGET_WORD_COUNT and current_word_count > 0:
                    chunks.append({
                        "file_id": file_id,
                        "page": page_num + 1,
                        "text": current_chunk_text.strip()
                    })
                    # Reset for the next chunk
                    current_chunk_text = ""
                    current_word_count = 0
                
                # Add the paragraph to the current working chunk
                current_chunk_text += paragraph + "\n\n"
                current_word_count += word_count
                
        # Catch any leftover text at the end of the page before moving to the next one
        if current_word_count > 0:
            chunks.append({
                "file_id": file_id,
                "page": page_num + 1,
                "text": current_chunk_text.strip()
            })

    # Return the structured payload expected by the orchestrator
    return {
        "file_id": file_id,
        "page_count": page_count,
        "chunks": chunks
    }



@app.post("/index")
async def index_document(request: IndexRequest):
    file_id = request.file_id
    
    # 1. Get stored chunks
    if file_id not in CHUNKS_DB:
        return {"error": f"No chunks found for file_id: {file_id}"}
        
    chunks = CHUNKS_DB[file_id]
    
    # 2. Embed the text
    texts_to_embed = [chunk["text"] for chunk in chunks]
    vectors = embedding_model.encode(texts_to_embed)
    
    # 3. Prepare data for ChromaDB
    ids = []
    documents = []
    embeddings = []
    metadatas = []
    
    for i, chunk in enumerate(chunks):
        ids.append(str(uuid.uuid4()))
        documents.append(chunk["text"])
        embeddings.append(vectors[i].tolist())
        metadatas.append({
            "file_id": file_id,
            "page": chunk["page"]
        })
        
    # 4. Insert into Chroma
    vector_collection.add(
        ids=ids,
        documents=documents,
        embeddings=embeddings,
        metadatas=metadatas
    )
    
    # Optional clean-up: clear the chunks from RAM now that they are in the database
    del CHUNKS_DB[file_id]
    
    # 5. Return the exact required JSON contract
    return {
        "indexed_count": len(ids)
    }

@app.post("/search")
async def search_documents(request: SearchRequest):
    # 1. Embed the query
    # We pass it as a list and extract the first item because .encode() expects a list of strings
    query_vector = embedding_model.encode([request.query])[0].tolist()
    
    # 2. Search Chroma
    # We ask Chroma to find the mathematical nearest neighbors to our query vector
    results = vector_collection.query(
        query_embeddings=[query_vector],
        n_results=request.top_k
    )
    
    # 3. Format the Top K results
    formatted_results = []
    
    # Chroma returns lists of lists (because it supports batch querying).
    # We grab index [0] to get the results for our single query.
    if results["documents"] and len(results["documents"][0]) > 0:
        docs = results["documents"][0]
        metas = results["metadatas"][0]
        distances = results["distances"][0] # Lower distance = better match
        
        for i in range(len(docs)):
            formatted_results.append({
                "text": docs[i],
                "file_id": metas[i].get("file_id"),
                "page": metas[i].get("page"),
                "distance": distances[i]
            })
            
    # 4. Return the payload
    return formatted_results

@app.post("/execute")
async def execute(req: ExecuteRequest):
    return execute_code(req)