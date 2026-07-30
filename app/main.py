from fastapi import FastAPI, UploadFile, File
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