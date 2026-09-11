"""Pixel-accurate furniture outlines for the Decision screen.

GPT decides *which* furniture was added by comparing the original and
generated room.  YOLOE then does the spatial job it is designed for: detect
those named object classes and return one instance-segmentation mask per
piece.  Keeping those responsibilities separate avoids asking a language
model to guess image coordinates.
"""

from __future__ import annotations

import os
import threading
from collections import defaultdict
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterator

import cv2
import numpy as np


BACKEND_DIR = Path(__file__).resolve().parents[2]
MODEL_DIR = BACKEND_DIR / "models"
MODEL_PATH = MODEL_DIR / "yoloe-26n-seg.pt"
PROMPT_PROFILE_PATH = MODEL_DIR / "roomly-furniture-prompts.npz"

# Multiple visual names improve open-vocabulary recall.  All aliases map back
# to one stable Roomly category so GPT's semantic object can be paired with the
# best mask, regardless of the exact wording that produced it.
PROMPT_SPECS: tuple[tuple[str, str], ...] = (
    ("sofa", "sofa"),
    ("couch", "sofa"),
    ("sectional sofa", "sofa"),
    ("armchair", "chair"),
    ("lounge chair", "chair"),
    ("dining chair", "chair"),
    ("coffee table", "coffee-table"),
    ("round coffee table", "coffee-table"),
    ("side table", "side-table"),
    ("dining table", "dining-table"),
    ("desk", "desk"),
    ("wooden sideboard cabinet", "cabinet"),
    ("credenza", "cabinet"),
    ("wooden cabinet furniture", "cabinet"),
    ("dresser", "cabinet"),
    ("bookshelf", "shelf"),
    ("wall shelf", "shelf"),
    ("area rug", "rug"),
    ("carpet", "rug"),
    ("floor lamp", "lamp"),
    ("table lamp", "lamp"),
    ("pendant lamp", "lamp"),
    ("potted plant", "plant"),
    ("indoor plant", "plant"),
    ("curtains", "curtain"),
    ("window drapes", "curtain"),
    ("bed", "bed"),
    ("nightstand", "nightstand"),
    ("ottoman", "ottoman"),
    ("pouf", "ottoman"),
    ("mirror", "mirror"),
    ("wall art", "wall-art"),
    ("picture frame", "wall-art"),
    ("television", "television"),
    ("bench", "bench"),
)
PROMPTS = [prompt for prompt, _canonical in PROMPT_SPECS]
PROMPT_TO_CANONICAL = dict(PROMPT_SPECS)

_MODEL_LOCK = threading.Lock()


@contextmanager
def _working_directory(path: Path) -> Iterator[None]:
    """Let Ultralytics find its text encoder beside our model cache."""

    previous = Path.cwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(previous)


@lru_cache(maxsize=1)
def _get_model() -> tuple[Any, str]:
    """Load the small open-vocabulary segmenter once per backend process."""

    import torch
    from ultralytics import YOLOE
    from ultralytics.utils.downloads import attempt_download_asset

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    with _working_directory(MODEL_DIR):
        checkpoint = attempt_download_asset(MODEL_PATH)
        model = YOLOE(checkpoint)
        if PROMPT_PROFILE_PATH.exists():
            model.load_prompt_embeddings(PROMPT_PROFILE_PATH)
        else:
            model.set_classes(PROMPTS)
            model.save_prompt_embeddings(PROMPT_PROFILE_PATH)

    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    return model, device


def _canonical_object_key(item: dict[str, Any]) -> str | None:
    """Map loose GPT category wording onto Roomly's stable mask classes."""

    value = " ".join(str(item.get(key, "")) for key in ("category", "id")).lower()
    keyword_map = (
        (("sectional", "sofa", "couch"), "sofa"),
        (("armchair", "lounge chair", "dining chair", "chair"), "chair"),
        (("coffee table", "center table"), "coffee-table"),
        (("side table", "end table"), "side-table"),
        (("dining table",), "dining-table"),
        (("nightstand", "bedside"), "nightstand"),
        (("sideboard", "credenza", "cabinet", "dresser", "storage"), "cabinet"),
        (("bookshelf", "shelf"), "shelf"),
        (("area rug", "rug", "carpet"), "rug"),
        (("lamp", "lighting"), "lamp"),
        (("potted plant", "plant", "tree"), "plant"),
        (("curtain", "drape"), "curtain"),
        (("ottoman", "pouf", "pouffe"), "ottoman"),
        (("wall art", "picture", "frame", "artwork"), "wall-art"),
        (("television", "tv"), "television"),
        (("table",), "coffee-table"),
        (("desk",), "desk"),
        (("bed",), "bed"),
        (("mirror",), "mirror"),
        (("bench",), "bench"),
    )
    for keywords, canonical in keyword_map:
        if any(keyword in value for keyword in keywords):
            return canonical
    return None


def _outline_from_normalized_polygon(points: np.ndarray) -> list[list[float]] | None:
    """Simplify a dense mask edge while retaining its visible silhouette."""

    polygon = np.asarray(points, dtype=np.float32)
    if polygon.ndim != 2 or polygon.shape[0] < 3 or polygon.shape[1] != 2:
        return None

    contour = (polygon * 1000).reshape(-1, 1, 2)
    perimeter = cv2.arcLength(contour, True)
    epsilon = max(0.8, perimeter * 0.0025)
    approximation = cv2.approxPolyDP(contour, epsilon, True)
    while len(approximation) > 56:
        epsilon *= 1.3
        approximation = cv2.approxPolyDP(contour, epsilon, True)

    outline = [
        [
            round(float(np.clip(point[0][0] / 10, 0, 100)), 2),
            round(float(np.clip(point[0][1] / 10, 0, 100)), 2),
        ]
        for point in approximation
    ]
    return outline if len(outline) >= 3 else None


def _outline_from_mask_bitmap(mask: np.ndarray) -> list[list[float]] | None:
    """Trace one coherent outer contour without joining disconnected islands."""

    bitmap = np.where(np.asarray(mask) > 0.5, 255, 0).astype(np.uint8)
    if bitmap.ndim != 2:
        return None
    contours, _ = cv2.findContours(bitmap, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    contour = max(contours, key=cv2.contourArea)
    if cv2.contourArea(contour) < 16:
        return None
    height, width = bitmap.shape
    normalized = contour[:, 0, :].astype(np.float32)
    normalized[:, 0] /= width
    normalized[:, 1] /= height
    return _outline_from_normalized_polygon(normalized)


def _match_detections(
    semantic_objects: list[dict[str, Any]],
    detections: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Attach the highest-confidence unused mask of the right class."""

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for detection in detections:
        grouped[detection["canonical"]].append(detection)
    for matches in grouped.values():
        matches.sort(key=lambda detection: detection["confidence"], reverse=True)

    matched: list[dict[str, Any]] = []
    used_detection_ids: set[int] = set()
    for item in semantic_objects:
        canonical = _canonical_object_key(item)
        if canonical is None:
            continue
        available = [
            detection
            for detection in grouped.get(canonical, [])
            if detection["index"] not in used_detection_ids
            and _is_spatially_plausible(item, detection)
        ]
        if not available:
            continue

        if canonical == "curtain":
            panel_like = []
            for detection in available:
                x1, y1, x2, y2 = _outline_bounds(detection["outline"])
                height = max(0.01, y2 - y1)
                if (x2 - x1) / height <= 0.65:
                    panel_like.append(detection)
            if panel_like:
                available = panel_like

        available.sort(key=lambda detection: _detection_match_score(item, detection), reverse=True)
        selected = [available[0]]
        if canonical == "curtain":
            # A curtain set is normally segmented as separate left/right
            # panels. Keep spatially distinct panels under one Decision item,
            # while suppressing overlapping alias detections of the same panel.
            best_confidence = available[0]["confidence"]
            for candidate in available[1:]:
                if candidate["confidence"] < max(0.08, best_confidence * 0.35):
                    continue
                if all(_outline_iou(candidate["outline"], current["outline"]) < 0.45 for current in selected):
                    selected.append(candidate)
                if len(selected) == 4:
                    break

        # Open-vocabulary aliases such as "armchair", "lounge chair" and
        # "dining chair" can produce several masks over the same pixels. Mark
        # every strongly-overlapping alias as consumed so the next semantic
        # object cannot accidentally select the same physical item again.
        used_detection_ids.update(
            detection["index"]
            for detection in grouped.get(canonical, [])
            if any(_outline_iou(detection["outline"], chosen["outline"]) >= 0.62 for chosen in selected)
        )
        outlines = [detection["outline"] for detection in selected]
        outline = outlines[0]
        xs = [point[0] for shape in outlines for point in shape]
        ys = [point[1] for shape in outlines for point in shape]
        updated = dict(item)
        updated.update(
            outline=outline,
            outlines=outlines,
            box_x_min=round(min(xs), 2),
            box_x_max=round(max(xs), 2),
            box_y_min=round(min(ys), 2),
            box_y_max=round(max(ys), 2),
            x=round(sum(xs) / len(xs), 2),
            y=round(sum(ys) / len(ys), 2),
            detection_confidence=round(selected[0]["confidence"], 3),
        )
        matched.append(updated)
    return matched


def _detection_match_score(item: dict[str, Any], detection: dict[str, Any]) -> float:
    """Rank same-class masks using VLM location plus YOLO confidence."""

    confidence = float(detection.get("confidence", 0))
    bounds = _outline_bounds(detection["outline"])
    x1, y1, x2, y2 = bounds
    detection_center = ((x1 + x2) / 2, (y1 + y2) / 2)

    anchor = item.get("anchor")
    coarse_box = item.get("coarse_box")
    if not (isinstance(anchor, list) and len(anchor) == 2):
        anchor = None
    if not (isinstance(coarse_box, list) and len(coarse_box) == 4):
        coarse_box = None
    if anchor is None and coarse_box is not None:
        anchor = [(float(coarse_box[0]) + float(coarse_box[2])) / 2, (float(coarse_box[1]) + float(coarse_box[3])) / 2]
    if anchor is None and coarse_box is None:
        return confidence

    proximity = 0.0
    contains_anchor = 0.0
    if anchor is not None:
        anchor_x = float(np.clip(float(anchor[0]), 0, 100))
        anchor_y = float(np.clip(float(anchor[1]), 0, 100))
        distance = float(np.hypot(detection_center[0] - anchor_x, detection_center[1] - anchor_y))
        proximity = max(0.0, 1.0 - distance / np.hypot(100, 100))
        contains_anchor = float(x1 <= anchor_x <= x2 and y1 <= anchor_y <= y2)

    box_overlap = 0.0
    if coarse_box is not None:
        expected = tuple(float(np.clip(value, 0, 100)) for value in coarse_box)
        box_overlap = _box_iou(bounds, expected)

    return 0.32 * confidence + 0.38 * proximity + 0.24 * box_overlap + 0.06 * contains_anchor


def _match_detections_with_fallback(
    semantic_objects: list[dict[str, Any]],
    detections: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Recover from a globally bad VLM coordinate pass without weak guesses."""

    matched = _match_detections(semantic_objects, detections)
    if matched or not semantic_objects:
        return matched

    # Spatial coordinates from a vision model can occasionally drift as a
    # group even though its categories are correct. Only in the all-rejected
    # case, retry without location hints and accept strong YOLO masks. Weak
    # 0.04 open-vocabulary candidates remain excluded.
    location_free_objects = [
        {key: value for key, value in item.items() if key not in {"anchor", "coarse_box"}}
        for item in semantic_objects
    ]
    confident_detections = [
        detection for detection in detections if float(detection.get("confidence", 0)) >= 0.22
    ]
    return _match_detections(location_free_objects, confident_detections)


def _is_spatially_plausible(item: dict[str, Any], detection: dict[str, Any]) -> bool:
    """Prefer no hotspot to a clearly wrong same-class hotspot."""

    anchor = item.get("anchor")
    coarse_box = item.get("coarse_box")
    has_anchor = isinstance(anchor, list) and len(anchor) == 2
    has_box = isinstance(coarse_box, list) and len(coarse_box) == 4
    if not has_anchor and not has_box:
        return True

    bounds = _outline_bounds(detection["outline"])
    if has_box:
        expected = tuple(float(np.clip(value, 0, 100)) for value in coarse_box)
        if _box_iou(bounds, expected) >= 0.025:
            return True

    if has_anchor:
        anchor_x = float(np.clip(float(anchor[0]), 0, 100))
        anchor_y = float(np.clip(float(anchor[1]), 0, 100))
        x1, y1, x2, y2 = bounds
        center_x, center_y = (x1 + x2) / 2, (y1 + y2) / 2
        if np.hypot(center_x - anchor_x, center_y - anchor_y) <= 34:
            return True
        margin = 10
        if x1 - margin <= anchor_x <= x2 + margin and y1 - margin <= anchor_y <= y2 + margin:
            return True

    return False


def _outline_iou(first: list[list[float]], second: list[list[float]]) -> float:
    """Fast bounding-box IoU used only to remove duplicate prompt aliases."""

    ax1, ay1, ax2, ay2 = _outline_bounds(first)
    bx1, by1, bx2, by2 = _outline_bounds(second)
    return _box_iou((ax1, ay1, ax2, ay2), (bx1, by1, bx2, by2))


def _box_iou(
    first: tuple[float, float, float, float],
    second: tuple[float, float, float, float],
) -> float:
    ax1, ay1, ax2, ay2 = first
    bx1, by1, bx2, by2 = second
    intersection = max(0.0, min(ax2, bx2) - max(ax1, bx1)) * max(0.0, min(ay2, by2) - max(ay1, by1))
    union = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1) + max(0.0, bx2 - bx1) * max(0.0, by2 - by1) - intersection
    return intersection / union if union > 0 else 0.0


def _outline_bounds(outline: list[list[float]]) -> tuple[float, float, float, float]:
    xs = [point[0] for point in outline]
    ys = [point[1] for point in outline]
    return min(xs), min(ys), max(xs), max(ys)


def segment_detected_objects(
    after_bytes: bytes,
    semantic_objects: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return only semantic objects that have a real instance mask."""

    image = cv2.imdecode(np.frombuffer(after_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Unsupported generated room image")

    with _MODEL_LOCK:
        model, device = _get_model()
        result = model.predict(
            image,
            imgsz=768,
            conf=0.04,
            iou=0.55,
            max_det=40,
            device=device,
            retina_masks=True,
            verbose=False,
        )[0]

    if result.boxes is None or result.masks is None:
        return []

    classes = result.boxes.cls.cpu().numpy().astype(int)
    confidences = result.boxes.conf.cpu().numpy()
    masks = result.masks.data.cpu().numpy()
    detections: list[dict[str, Any]] = []
    for index, (class_index, confidence, mask) in enumerate(zip(classes, confidences, masks)):
        prompt = result.names[int(class_index)]
        outline = _outline_from_mask_bitmap(mask)
        if outline is None:
            continue
        detections.append(
            {
                "index": index,
                "prompt": prompt,
                "canonical": PROMPT_TO_CANONICAL[prompt],
                "confidence": float(confidence),
                "outline": outline,
            }
        )

    return _match_detections_with_fallback(semantic_objects, detections)
