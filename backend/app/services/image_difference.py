"""Turn before/after room changes into object-shaped selection outlines.

The vision model supplies the semantic label and a coarse region. Pixel
difference and GrabCut refine that region against the generated image so the
frontend can draw a contour around the changed object rather than a loose box.
"""

from typing import Any

import cv2
import numpy as np


def _decode_image(data: bytes) -> np.ndarray:
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Unsupported room image")
    return image


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _coarse_box(item: dict[str, Any], width: int, height: int) -> tuple[int, int, int, int]:
    outline = item.get("outline")
    valid_points = [
        point
        for point in outline or []
        if isinstance(point, list) and len(point) == 2
    ]

    if valid_points:
        xs = [float(point[0]) for point in valid_points]
        ys = [float(point[1]) for point in valid_points]
        x_min, x_max = min(xs), max(xs)
        y_min, y_max = min(ys), max(ys)
    else:
        x_min = float(item.get("box_x_min", 35))
        x_max = float(item.get("box_x_max", 65))
        y_min = float(item.get("box_y_min", 35))
        y_max = float(item.get("box_y_max", 65))

    # Leave enough background around the coarse AI region for GrabCut to learn
    # foreground/background colours without letting neighbouring furniture in.
    margin_x = max(2.0, (x_max - x_min) * 0.12)
    margin_y = max(2.0, (y_max - y_min) * 0.12)
    x1 = int(_clamp(x_min - margin_x, 0, 99.8) * width / 100)
    y1 = int(_clamp(y_min - margin_y, 0, 99.8) * height / 100)
    x2 = int(_clamp(x_max + margin_x, 0.2, 100) * width / 100)
    y2 = int(_clamp(y_max + margin_y, 0.2, 100) * height / 100)
    return x1, y1, max(x1 + 2, x2), max(y1 + 2, y2)


def _change_mask(before: np.ndarray, after: np.ndarray) -> np.ndarray:
    before = cv2.resize(before, (after.shape[1], after.shape[0]), interpolation=cv2.INTER_AREA)
    before_blur = cv2.GaussianBlur(before, (7, 7), 0)
    after_blur = cv2.GaussianBlur(after, (7, 7), 0)

    before_lab = cv2.cvtColor(before_blur, cv2.COLOR_BGR2LAB).astype(np.int16)
    after_lab = cv2.cvtColor(after_blur, cv2.COLOR_BGR2LAB).astype(np.int16)
    delta = np.mean(np.abs(after_lab - before_lab), axis=2).astype(np.uint8)

    # A floor ignores small lighting/compression shifts; the percentile adapts
    # when the generated frame differs more broadly from the source.
    threshold = int(_clamp(float(np.percentile(delta, 72)), 18, 58))
    changed = np.where(delta >= threshold, 255, 0).astype(np.uint8)

    scale = max(3, int(round(min(after.shape[:2]) / 220)))
    if scale % 2 == 0:
        scale += 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (scale, scale))
    changed = cv2.morphologyEx(changed, cv2.MORPH_OPEN, kernel)
    changed = cv2.morphologyEx(changed, cv2.MORPH_CLOSE, kernel, iterations=2)
    return changed


def _grabcut_mask(after: np.ndarray, box: tuple[int, int, int, int]) -> np.ndarray:
    height, width = after.shape[:2]
    x1, y1, x2, y2 = box
    rect = (
        max(0, x1),
        max(0, y1),
        min(width - x1, x2 - x1),
        min(height - y1, y2 - y1),
    )
    if rect[2] < 3 or rect[3] < 3:
        return np.zeros((height, width), dtype=np.uint8)

    mask = np.zeros((height, width), dtype=np.uint8)
    background = np.zeros((1, 65), dtype=np.float64)
    foreground = np.zeros((1, 65), dtype=np.float64)
    try:
        cv2.grabCut(after, mask, rect, background, foreground, 4, cv2.GC_INIT_WITH_RECT)
    except cv2.error:
        return np.zeros((height, width), dtype=np.uint8)
    return np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)


def _outline_from_mask(
    mask: np.ndarray,
    box: tuple[int, int, int, int],
    anchor: tuple[int, int] | None = None,
) -> list[list[float]] | None:
    height, width = mask.shape
    x1, y1, x2, y2 = box
    restricted = np.zeros_like(mask)
    restricted[y1:y2, x1:x2] = mask[y1:y2, x1:x2]

    close_size = max(3, int(round(min(x2 - x1, y2 - y1) * 0.045)))
    if close_size % 2 == 0:
        close_size += 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close_size, close_size))
    restricted = cv2.morphologyEx(restricted, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(restricted, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = [contour for contour in contours if cv2.contourArea(contour) >= 0.003 * (x2 - x1) * (y2 - y1)]
    if not contours:
        return None

    # Pick one coherent changed region. Joining several large contours can
    # accidentally connect a sofa to a window or a table to a cabinet when
    # both changed during generation. Prefer the component closest to the
    # coarse object's centre, with area only as a secondary signal.
    box_center = np.array(anchor or ((x1 + x2) / 2, (y1 + y2) / 2))
    box_diagonal = max(1.0, float(np.hypot(x2 - x1, y2 - y1)))

    def contour_score(contour: np.ndarray) -> float:
        moments = cv2.moments(contour)
        if moments["m00"]:
            center = np.array([moments["m10"] / moments["m00"], moments["m01"] / moments["m00"]])
        else:
            center = np.mean(contour[:, 0, :], axis=0)
        distance = float(np.linalg.norm(center - box_center)) / box_diagonal
        point = (float(box_center[0]), float(box_center[1]))
        centered_bonus = 4.0 if cv2.pointPolygonTest(contour, point, False) >= 0 else 1.0
        return centered_bonus * cv2.contourArea(contour) / (1.0 + 5.0 * distance)

    contour = max(contours, key=contour_score)
    perimeter = cv2.arcLength(contour, True)
    approximation = cv2.approxPolyDP(contour, max(1.5, perimeter * 0.008), True)
    if len(approximation) < 5:
        approximation = cv2.approxPolyDP(contour, max(0.8, perimeter * 0.003), True)

    points = [
        [round(float(point[0][0]) * 100 / width, 1), round(float(point[0][1]) * 100 / height, 1)]
        for point in approximation[:24]
    ]
    return points if len(points) >= 3 else None


def refine_added_object_outlines(
    before_bytes: bytes,
    after_bytes: bytes,
    objects: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Refine each AI object's coarse outline using before/after pixels."""

    before = _decode_image(before_bytes)
    after = _decode_image(after_bytes)
    changed = _change_mask(before, after)

    refined: list[dict[str, Any]] = []
    height, width = after.shape[:2]
    for item in objects:
        updated = dict(item)
        box = _coarse_box(item, width, height)
        anchor_value = item.get("anchor")
        anchor = None
        if isinstance(anchor_value, list) and len(anchor_value) == 2:
            anchor = (
                int(_clamp(float(anchor_value[0]), 0, 100) * width / 100),
                int(_clamp(float(anchor_value[1]), 0, 100) * height / 100),
            )
        segmented = _grabcut_mask(after, box)

        # The before/after difference confirms that the localized foreground is
        # genuinely new or changed. Use the full GrabCut foreground for the
        # contour so unchanged highlights/shadows inside one sofa or cabinet do
        # not split it into several disconnected selection fragments.
        diff_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        changed_nearby = cv2.dilate(changed, diff_kernel, iterations=1)
        changed_foreground = cv2.bitwise_and(segmented, changed_nearby)
        foreground_area = max(1, cv2.countNonZero(segmented))
        changed_ratio = cv2.countNonZero(changed_foreground) / foreground_area
        candidate = segmented if changed_ratio >= 0.08 else changed_nearby
        outline = _outline_from_mask(candidate, box, anchor)
        if outline:
            xs = [point[0] for point in outline]
            ys = [point[1] for point in outline]
            updated["outline"] = outline
            updated["box_x_min"] = round(min(xs), 1)
            updated["box_x_max"] = round(max(xs), 1)
            updated["box_y_min"] = round(min(ys), 1)
            updated["box_y_max"] = round(max(ys), 1)
            updated["x"] = round(sum(xs) / len(xs))
            updated["y"] = round(sum(ys) / len(ys))
        refined.append(updated)

    return refined
