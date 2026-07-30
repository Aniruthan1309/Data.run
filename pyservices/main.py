from fastapi import FastAPI
from models import ExecuteRequest
from executor import execute_code

app = FastAPI()


@app.post("/execute")
def execute(request: ExecuteRequest):
    return execute_code(request)