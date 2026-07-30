import io
import contextlib
import traceback
import ast
import math
import numpy as np
import multiprocessing
import queue

import pandas as pd

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
                
def _execute_code(code, df, output_queue):
    
    #Execute AI-generated Python code on a pandas DataFrame.

    stdout = io.StringIO()

    import matplotlib
    matplotlib.use("Agg")

    import matplotlib.pyplot as plt

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

            print("Before exec")
            exec(code, {"__builtins__": SAFE_BUILTINS}, local_vars)
            print("After exec")

        output = stdout.getvalue()

        print("Figures:", plt.get_fignums())

        if has_active_figure(plt):
            print("Encoding figure")
            chart = figure_to_base64(plt)
            print("Figure encoded")

        output_queue.put({
            "stdout": output if output else None,
            "chartBase64": chart,
            "error": None,
        })

    except Exception as e:
        plt.close("all")

        output_queue.put({
            "stdout": None,
            "chartBase64": None,
            "error": str(e),
        })
def run_python(code: str, df: pd.DataFrame):

    output_queue = multiprocessing.Queue()

    process = multiprocessing.Process(
        target=_execute_code,
        args=(code, df, output_queue)
    )

    process.start()

    process.join(timeout=5)

    if process.is_alive():

        process.terminate()

        process.join()

        return {
            "stdout": None,
            "chartBase64": None,
            "error": "Execution timed out after 5 seconds."
        }

    try:
        return output_queue.get_nowait()

    except queue.Empty:

        return {
            "stdout": None,
            "chartBase64": None,
            "error": "No output returned."
        }
