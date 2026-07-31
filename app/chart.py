import io
import base64

def has_active_figure(plt) -> bool:
    return len(plt.get_fignums()) > 0


def figure_to_base64(plt) -> str:
    buffer = io.BytesIO()

    plt.savefig(buffer, format="png", bbox_inches="tight")

    buffer.seek(0)

    image_base64 = base64.b64encode(buffer.read()).decode("utf-8")

    buffer.close()

    plt.close("all")

    return image_base64