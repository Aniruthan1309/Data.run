import pandas as pd


def drop_nulls(df: pd.DataFrame):
    """
    Remove rows containing null values.
    """
    before = len(df)

    cleaned_df = df.dropna()

    after = len(cleaned_df)

    return cleaned_df, {
        "operation": "drop_nulls",
        "rows_removed": before - after,
        "rows_remaining": after
    }


def fill_nulls(df: pd.DataFrame, value=0):
    """
    Fill null values with a specified value.
    """
    null_count = int(df.isna().sum().sum())

    cleaned_df = df.fillna(value)

    return cleaned_df, {
        "operation": "fill_nulls",
        "filled_values": null_count,
        "fill_value": value
    }


def dedupe(df: pd.DataFrame):
    """
    Remove duplicate rows.
    """
    before = len(df)

    cleaned_df = df.drop_duplicates()

    after = len(cleaned_df)

    return cleaned_df, {
        "operation": "dedupe",
        "duplicates_removed": before - after,
        "rows_remaining": after
    }


def cast_dtype(df: pd.DataFrame, column: str, dtype: str):
    """
    Convert a column to the specified datatype.
    """
    if column not in df.columns:
        raise ValueError(f"Column '{column}' not found.")

    cleaned_df = df.copy()

    try:
        cleaned_df[column] = cleaned_df[column].astype(dtype)
    except Exception as e:
        raise ValueError(f"Failed to convert '{column}' to '{dtype}': {e}")

    return cleaned_df, {
        "operation": "cast_dtype",
        "column": column,
        "new_dtype": str(cleaned_df[column].dtype)
    }


def clean_dataframe(
    df: pd.DataFrame,
    operation: str,
    column: str = None,
    value=None,
    dtype: str = None,
):
    """
    Dispatch the requested cleaning operation.
    """

    operation = operation.lower()

    if operation == "drop_nulls":
        return drop_nulls(df)

    elif operation == "fill_nulls":
        return fill_nulls(df, value)

    elif operation == "dedupe":
        return dedupe(df)

    elif operation == "cast_dtype":
        if column is None:
            raise ValueError("Column name is required for cast_dtype.")

        if dtype is None:
            raise ValueError("Target datatype is required for cast_dtype.")

        return cast_dtype(df, column, dtype)

    else:
        raise ValueError(f"Unsupported cleaning operation: {operation}")