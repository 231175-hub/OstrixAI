"""Validated domain model, independent of Flask, MySQL and Firebase."""
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

InferenceSource = Literal["ON_DEVICE", "IN_CLOUD", "OFFLINE_ESSENTIAL"]


@dataclass(frozen=True, slots=True)
class SyncEvent:
    event_id: str
    user_uid: str
    note: str
    answer: str
    inference_source: InferenceSource
    is_complex: bool
    occurred_at: datetime
