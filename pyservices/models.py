from pydantic import BaseModel


class ExecuteRequest(BaseModel):
    fileId: str
    code: str