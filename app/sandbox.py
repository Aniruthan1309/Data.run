import io
import contextlib
import traceback

import pandas as pd
import matplotlib.pyplot as plt

from app.chart import has_active_figure, figure_to_base64


def run_python(code: str, df: pd.DataFrame):
    """
    Execute AI-generated Python code on a pandas DataFrame.

    Available variables:
        df  -> Uploaded DataFrame
        pd  -> pandas
        plt -> matplotlib.pyplot

    Optional:
        result -> any object to be returned as text
    """

    stdout = io.StringIO()

    local_vars = {
        "df": df,
        "pd": pd,
        "plt": plt,
    }

    chart = None

    try:
        with contextlib.redirect_stdout(stdout):
            exec(code, {}, local_vars)

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
