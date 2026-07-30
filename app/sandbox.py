import io
import contextlib
import traceback
import ast
import math
import numpy as np

import pandas as pd
import matplotlib.pyplot as plt

from app.chart import has_active_figure, figure_to_base64

ALLOWED_IMPORTS = {
    "math",
    "numpy",
    "pandas",
    "matplotlib"
}

SAFE_BUILTINS = {
    "print": print,
    "len": len,
    "sum": sum,
    "min": min,
    "max": max,
    "range": range,
    "abs": abs,
    "round": round,
    "sorted": sorted,
    "enumerate": enumerate,
}

def validate_code(code: str):
    """
    Validate that the generated code only imports approved modules.
    """

    tree = ast.parse(code)

    for node in ast.walk(tree):

        if isinstance(node, ast.Import):

            for alias in node.names:

                module = alias.name.split(".")[0]

                if module not in ALLOWED_IMPORTS:
                    raise ValueError(
                        f"Import '{module}' is not allowed."
                    )

        elif isinstance(node, ast.ImportFrom):

            module = node.module.split(".")[0]

            if module not in ALLOWED_IMPORTS:
                raise ValueError(
                    f"Import '{module}' is not allowed."
                )
                
def run_python(code: str, df: pd.DataFrame):
    
    #Execute AI-generated Python code on a pandas DataFrame.

    stdout = io.StringIO()

    local_vars = {
    "df": df,
    "pd": pd,
    "plt": plt,
    "np": np,
    "math": math,
}

    chart = None

    try:
        validate_code(code)
        with contextlib.redirect_stdout(stdout):
            exec(code, {"__builtins__": SAFE_BUILTINS}, local_vars)

        output = stdout.getvalue()

        if "result" in local_vars:
            if output:
                output += "\n"
            output += str(local_vars["result"])

        if has_active_figure():
            chart = figure_to_base64()

        return {
            "stdout": output if output else None,
            "chartBase64": chart,
            "error": None,
        }

    except Exception:
        plt.close("all")

        return {
            "stdout": None,
            "chartBase64": None,
            "error": traceback.format_exc(),
        }
