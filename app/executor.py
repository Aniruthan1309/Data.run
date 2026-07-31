from app.models import ExecuteRequest
from app.storage import FILES_DB
from app.sandbox import run_python


def execute_code(request: ExecuteRequest):
    """
    Fetch the uploaded DataFrame using the file ID
    and execute the generated Python code.
    """

    df = FILES_DB.get(request.fileId)

    if df is None:
        return {
            "stdout": None,
            "chartBase64": None,
            "error": f"Unknown file_id: {request.fileId}"
        }

    return run_python(request.code, df)
