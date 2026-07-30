from typing import Optional
from pydantic import BaseModel


# ---------- Execute ----------

class ExecuteRequest(BaseModel):
    fileId: str
    code: str


class ExecuteResponse(BaseModel):
    stdout: Optional[str] = None
    chartBase64: Optional[str] = None
    error: Optional[str] = None


# ---------- Clean ----------

class CleanRequest(BaseModel):
    file_id: str
    operation: str
    column: Optional[str] = None
    extra_arg: Optional[str] = None


class CleanResponse(BaseModel):
    file_id: str
    summary: str


# ---------- Generic Error ----------

class ErrorResponse(BaseModel):
    error: str
