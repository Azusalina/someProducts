"""Validate complete batches before acknowledging anything to the phone."""
import hashlib
import json
import math
from datetime import datetime, timezone, timedelta

HK = timezone(timedelta(hours=8))
MAX_BODY = 8 * 1024 * 1024


class InvalidBatch(ValueError):
    pass


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def number(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise InvalidBatch(f"Invalid {name}")
    return value


def parse_batch(body):
    try:
        payload = json.loads(body, parse_constant=lambda value: (_ for _ in ()).throw(InvalidBatch("Non-finite JSON")))
    except (ValueError, UnicodeError) as exc:
        raise InvalidBatch("Invalid JSON") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("locations"), list):
        raise InvalidBatch("Expected an object with a locations array; use Overland All Data mode")
    if len(payload["locations"]) > 10000:
        raise InvalidBatch("Batch exceeds 10000 events")
    events = []
    for feature in payload["locations"]:
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            raise InvalidBatch("Each location must be a GeoJSON Feature")
        props = feature.get("properties")
        if not isinstance(props, dict):
            raise InvalidBatch("Expected feature properties")
        identity = json.loads(canonical(feature))
        # This value changes when a queued point is retried in a different-sized batch.
        identity["properties"].pop("locations_in_payload", None)
        digest = hashlib.sha256(canonical(identity).encode()).hexdigest()
        event = {"hash": digest, "raw": canonical(feature), "point": None}
        geometry = feature.get("geometry")
        if geometry is not None:
            if not isinstance(geometry, dict) or geometry.get("type") != "Point":
                raise InvalidBatch("Expected Point geometry or null metadata geometry")
            coords = geometry.get("coordinates")
            if not isinstance(coords, list) or len(coords) < 2:
                raise InvalidBatch("Expected longitude and latitude")
            lon, lat = number(coords[0], "longitude"), number(coords[1], "latitude")
            if not -180 <= lon <= 180 or not -90 <= lat <= 90:
                raise InvalidBatch("Coordinates out of range")
            try:
                stamp = datetime.fromisoformat(props["timestamp"].replace("Z", "+00:00"))
                if stamp.tzinfo is None:
                    raise ValueError("Missing timezone")
                ms = int(stamp.timestamp() * 1000)
            except (KeyError, AttributeError, TypeError, ValueError, OverflowError) as exc:
                raise InvalidBatch("Expected an ISO 8601 timestamp including timezone") from exc
            device = props.get("device_id") or "iPhone"
            unique = props.get("unique_id") or device
            if not isinstance(device, str) or not isinstance(unique, str) or len(device) > 200 or len(unique) > 200:
                raise InvalidBatch("Invalid device identity")
            accuracy = props.get("horizontal_accuracy")
            altitude = props.get("altitude")
            if accuracy is not None:
                number(accuracy, "horizontal_accuracy")
            if altitude is not None:
                number(altitude, "altitude")
            motion = props.get("motion", [])
            if not isinstance(motion, list) or not all(isinstance(item, str) for item in motion):
                raise InvalidBatch("Invalid motion array")
            event["point"] = {
                "ms": ms, "day": stamp.astimezone(HK).date().isoformat(),
                "lon": lon, "lat": lat, "accuracy": accuracy, "altitude": altitude,
                "device": device, "device_key": unique, "motion": canonical(motion),
            }
        events.append(event)
    return payload, events
