import cv2
import numpy as np

from app.services.image_difference import refine_added_object_outlines


def _png(image: np.ndarray) -> bytes:
    ok, encoded = cv2.imencode(".png", image)
    assert ok
    return encoded.tobytes()


def test_before_after_difference_refines_outline_around_added_object():
    before = np.full((240, 320, 3), 205, dtype=np.uint8)
    after = before.copy()
    cv2.rectangle(after, (96, 72), (224, 192), (55, 105, 165), thickness=-1)

    objects = [{
        "id": "cabinet",
        "name": "ตู้เก็บของ",
        "category": "Cabinet",
        "price": 4000,
        "outline": [[25, 25], [75, 25], [75, 85], [25, 85]],
    }]

    result = refine_added_object_outlines(_png(before), _png(after), objects)
    outline = result[0]["outline"]

    assert len(outline) >= 4
    assert 27 <= result[0]["box_x_min"] <= 33
    assert 67 <= result[0]["box_x_max"] <= 73
    assert 27 <= result[0]["box_y_min"] <= 33
    assert 77 <= result[0]["box_y_max"] <= 83


def test_anchor_keeps_nearby_changed_objects_as_separate_selections():
    before = np.full((240, 320, 3), 205, dtype=np.uint8)
    after = before.copy()
    cv2.rectangle(after, (40, 80), (125, 190), (55, 105, 165), thickness=-1)
    cv2.rectangle(after, (185, 80), (280, 190), (80, 145, 70), thickness=-1)

    objects = [{
        "id": "left-chair",
        "name": "เก้าอี้ฝั่งซ้าย",
        "category": "Chair",
        "price": 2500,
        "anchor": [25, 55],
        "outline": [[5, 25], [95, 25], [95, 90], [5, 90]],
    }]

    result = refine_added_object_outlines(_png(before), _png(after), objects)

    assert result[0]["box_x_max"] < 50
