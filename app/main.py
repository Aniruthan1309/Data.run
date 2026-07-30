from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from fastapi import HTTPException
import fitz
import pandas as pd
import io

class CleanRequest(BaseModel):
    file_id: str
    operation: str
    column: Optional[str] = None
    extra_arg: Optional[str] = None

# This is the "app" that Uvicorn is looking for!
app = FastAPI()

# Temporary in-memory dictionary to store your loaded DataFrames
FILES_DB: dict[str, pd.DataFrame] = {}

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
@app.post("/parse/pdf")
async def parse_pdf(file: UploadFile = File(...)):
    # 1. Read the raw binary bytes of the uploaded PDF
    file_bytes = await file.read()
    
    # 2. Open the PDF entirely in memory using PyMuPDF
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    
    page_count = len(doc)
    chunks = []
    
    # 3. Iterate through every page to extract the text
    for page_num in range(page_count):
        page = doc.load_page(page_num)
        text = page.get_text("text").strip()
        
        # Only save the chunk if the page actually contains text
        if text:
            chunks.append({
                "page": page_num + 1,  # 1-indexed for human readability
                "text": text
            })
            
    # 4. Generate a unique ID for this document session
    file_id = str(id(doc))
    
    # 5. Return the exact JSON payload required by the team's API contract
    return {
        "file_id": file_id,
        "page_count": page_count,
        "chunks": chunks
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