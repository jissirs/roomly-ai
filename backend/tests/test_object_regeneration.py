import cv2
import numpy as np

from app.services.ai_service import build_object_edit_mask


def test_object_edit_mask_only_opens_selected_polygon():
    image = np.full((100, 160, 3), 127, dtype=np.uint8)
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok

    source_bytes, mask_bytes = build_object_edit_mask(
        encoded.tobytes(),
        [[[40, 35], [60, 35], [60, 65], [40, 65]]],
    )

    source = cv2.imdecode(np.frombuffer(source_bytes, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    mask = cv2.imdecode(np.frombuffer(mask_bytes, dtype=np.uint8), cv2.IMREAD_UNCHANGED)

    assert source.shape[:2] == (100, 160)
    assert mask.shape == (100, 160, 4)
    assert mask[50, 80, 3] == 0
    assert mask[5, 5, 3] == 255
