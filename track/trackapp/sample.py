"""Fictional routes for a preview; never written to the user's archive."""
import math
from datetime import datetime, timedelta
from .protocol import HK


def sample_points():
    routes = [
        [(114.158,22.282),(114.160,22.283),(114.164,22.281),(114.168,22.281),(114.172,22.277),(114.174,22.278),(114.171,22.281),(114.168,22.281),(114.164,22.281)],
        [(114.161,22.283),(114.157,22.282),(114.153,22.280),(114.152,22.277),(114.156,22.276),(114.159,22.277),(114.161,22.281),(114.164,22.281)],
        [(114.168,22.281),(114.172,22.281),(114.176,22.279),(114.180,22.279),(114.183,22.278),(114.185,22.278),(114.183,22.276),(114.179,22.277),(114.174,22.278)],
    ]
    today = datetime.now(HK).replace(hour=17, minute=0, second=0, microsecond=0)
    points = []
    for index, route in enumerate(routes):
        start = today - timedelta(days=2-index)
        for leg, (a,b) in enumerate(zip(route, route[1:])):
            for step in range(12):
                fraction = step / 12
                points.append({"id": len(points)+1, "ms": int((start + timedelta(seconds=(leg*12+step)*20)).timestamp()*1000),
                    "lon": a[0]+(b[0]-a[0])*fraction, "lat": a[1]+(b[1]-a[1])*fraction,
                    "accuracy": 8, "altitude": 12, "device": "Sample iPhone", "device_key": "sample",
                    "motion": ["walking"]})
    return points
