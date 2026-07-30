import io
import base64
import matplotlib.pyplot as plt


def figure_to_base64():
    """
    Convert the current matplotlib figure to a Base64 string.
    """

    buffer = io.BytesIO()

    plt.savefig(buffer, format="png", bbox_inches="tight")

    buffer.seek(0)

    image_base64 = base64.b64encode(buffer.read()).decode("utf-8")

    buffer.close()

    plt.close()

    return image_base64


def has_active_figure():
    """
    Returns True if a matplotlib figure exists.
    """

    return len(plt.get_fignums()) > 0