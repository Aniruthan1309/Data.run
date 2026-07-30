FILES = {}


def get_dataframe(file_id: str):
    return FILES.get(file_id)


def store_dataframe(file_id: str, df):
    FILES[file_id] = df
