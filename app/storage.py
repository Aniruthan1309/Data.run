import pandas as pd
import chromadb

FILES_DB: dict[str, pd.DataFrame] = {}

# Add this new dictionary for PDF chunks
CHUNKS_DB: dict[str, list[dict]] = {}

chroma_client = chromadb.PersistentClient(path="./chroma_data")
vector_collection = chroma_client.get_or_create_collection(name="pdf_knowledge_base")