import numpy as np

from app.services.object_segmentation import (
    _canonical_object_key,
    _match_detections,
    _match_detections_with_fallback,
    _outline_from_mask_bitmap,
    _outline_from_normalized_polygon,
)


def test_dense_mask_becomes_a_normalized_object_outline():
    dense_rectangle = np.array([
        [0.2, 0.3], [0.4, 0.3], [0.6, 0.3], [0.6, 0.5],
        [0.6, 0.7], [0.4, 0.7], [0.2, 0.7], [0.2, 0.5],
    ])

    outline = _outline_from_normalized_polygon(dense_rectangle)

    assert outline is not None
    xs = [point[0] for point in outline]
    ys = [point[1] for point in outline]
    assert min(xs) == 20
    assert max(xs) == 60
    assert min(ys) == 30
    assert max(ys) == 70


def test_disconnected_mask_does_not_draw_a_line_between_objects():
    mask = np.zeros((100, 100), dtype=np.uint8)
    mask[10:30, 10:30] = 1
    mask[50:90, 55:95] = 1

    outline = _outline_from_mask_bitmap(mask)

    assert outline is not None
    xs = [point[0] for point in outline]
    ys = [point[1] for point in outline]
    assert min(xs) >= 55
    assert min(ys) >= 50


def test_semantic_object_is_bound_to_the_matching_mask_not_a_nearby_object():
    objects = [{"id": "cabinet", "name": "ตู้ไม้", "category": "Cabinet", "price": 4000}]
    detections = [
        {"index": 0, "canonical": "sofa", "confidence": 0.95, "outline": [[0, 40], [30, 40], [30, 90], [0, 90]]},
        {"index": 1, "canonical": "cabinet", "confidence": 0.72, "outline": [[55, 48], [84, 48], [84, 75], [55, 75]]},
    ]

    matched = _match_detections(objects, detections)

    assert len(matched) == 1
    assert matched[0]["box_x_min"] == 55
    assert matched[0]["box_x_max"] == 84
    assert matched[0]["detection_confidence"] == 0.72


def test_semantic_anchor_selects_the_right_instance_not_the_highest_confidence_neighbor():
    objects = [{
        "id": "chair-right",
        "name": "เก้าอี้ด้านขวา",
        "category": "Chair",
        "price": 2000,
        "anchor": [82, 60],
        "coarse_box": [70, 35, 95, 90],
    }]
    detections = [
        {"index": 0, "canonical": "chair", "confidence": 0.93, "outline": [[5, 35], [30, 35], [30, 90], [5, 90]]},
        {"index": 1, "canonical": "chair", "confidence": 0.74, "outline": [[70, 35], [95, 35], [95, 90], [70, 90]]},
    ]

    matched = _match_detections(objects, detections)

    assert len(matched) == 1
    assert matched[0]["box_x_min"] == 70
    assert matched[0]["detection_confidence"] == 0.74


def test_overlapping_alias_masks_cannot_be_reused_for_a_second_object():
    objects = [
        {"id": "chair-left", "category": "Chair", "anchor": [18, 60]},
        {"id": "chair-right", "category": "Chair", "anchor": [82, 60]},
    ]
    detections = [
        {"index": 0, "canonical": "chair", "confidence": 0.91, "outline": [[5, 35], [30, 35], [30, 90], [5, 90]]},
        {"index": 1, "canonical": "chair", "confidence": 0.88, "outline": [[6, 36], [31, 36], [31, 89], [6, 89]]},
        {"index": 2, "canonical": "chair", "confidence": 0.72, "outline": [[70, 35], [95, 35], [95, 90], [70, 90]]},
    ]

    matched = _match_detections(objects, detections)

    assert len(matched) == 2
    assert [item["box_x_min"] for item in matched] == [5, 70]


def test_far_away_same_class_mask_is_rejected_instead_of_highlighting_wrong_object():
    objects = [{
        "id": "lamp-right",
        "category": "Lamp",
        "anchor": [88, 45],
        "coarse_box": [80, 20, 96, 75],
    }]
    detections = [
        {"index": 0, "canonical": "lamp", "confidence": 0.82, "outline": [[5, 20], [20, 20], [20, 75], [5, 75]]},
    ]

    assert _match_detections(objects, detections) == []


def test_all_rejected_locations_recover_only_high_confidence_unique_masks():
    objects = [{"id": "sofa", "category": "Sofa", "anchor": [90, 20], "coarse_box": [80, 5, 98, 40]}]
    detections = [
        {"index": 0, "canonical": "sofa", "confidence": 0.78, "outline": [[5, 50], [45, 50], [45, 95], [5, 95]]},
        {"index": 1, "canonical": "sofa", "confidence": 0.06, "outline": [[55, 45], [80, 45], [80, 90], [55, 90]]},
    ]

    matched = _match_detections_with_fallback(objects, detections)

    assert len(matched) == 1
    assert matched[0]["detection_confidence"] == 0.78


def test_gpt_category_aliases_map_to_stable_segmentation_classes():
    assert _canonical_object_key({"category": "Storage Cabinet"}) == "cabinet"
    assert _canonical_object_key({"category": "Area Rug"}) == "rug"
    assert _canonical_object_key({"category": "Coffee Table"}) == "coffee-table"


def test_separate_curtain_panels_stay_one_decision_with_two_outlines():
    objects = [{"id": "curtains", "name": "ผ้าม่าน", "category": "Curtains", "price": 2500}]
    detections = [
        {"index": 0, "canonical": "curtain", "confidence": 0.8, "outline": [[10, 10], [20, 10], [20, 80], [10, 80]]},
        {"index": 1, "canonical": "curtain", "confidence": 0.75, "outline": [[10, 8], [65, 8], [65, 82], [10, 82]]},
        {"index": 2, "canonical": "curtain", "confidence": 0.7, "outline": [[70, 10], [80, 10], [80, 80], [70, 80]]},
    ]

    matched = _match_detections(objects, detections)

    assert len(matched) == 1
    assert len(matched[0]["outlines"]) == 2
    assert matched[0]["box_x_min"] == 10
    assert matched[0]["box_x_max"] == 80
