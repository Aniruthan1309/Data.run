from fastapi import FastAPI, UploadFile, File
import fitz
import pandas as pd
import io

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