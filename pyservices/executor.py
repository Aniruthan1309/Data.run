from models import ExecuteRequest
from storage import get_dataframe


def execute_code(request: ExecuteRequest):

    df = get_dataframe(request.fileId)

    if df is None:
        return {
            "stdout": None,
            "chartBase64": None,
            "error": f"Unknown file_id: {request.fileId}"
        }

    return {
        "stdout": "DataFrame loaded successfully",
        "chartBase64": None,
        "error": None
    }
