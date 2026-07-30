import pandas as pd

# Centralized in-memory dictionary to store your loaded DataFrames
FILES_DB: dict[str, pd.DataFrame] = {}