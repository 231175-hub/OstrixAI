"""Environment-only configuration; production secrets never live in source control."""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Settings:
    mysql_host: str
    mysql_port: int
    mysql_user: str
    mysql_password: str
    mysql_database: str
    cors_origins: tuple[str, ...]
    firebase_project_id: str
    mysql_ssl_ca: str | None

    @classmethod
    def from_env(cls) -> Settings:
        required = ("MYSQL_HOST", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE", "FIREBASE_PROJECT_ID", "CORS_ORIGINS")
        missing = [key for key in required if not os.getenv(key)]
        if missing:
            raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")
        origins = tuple(o.strip() for o in os.environ["CORS_ORIGINS"].split(",") if o.strip())
        if not origins or "*" in origins:
            raise RuntimeError("CORS_ORIGINS must explicitly list trusted frontend origins")
        return cls(
            mysql_host=os.environ["MYSQL_HOST"],
            mysql_port=int(os.getenv("MYSQL_PORT", "3306")),
            mysql_user=os.environ["MYSQL_USER"],
            mysql_password=os.environ["MYSQL_PASSWORD"],
            mysql_database=os.environ["MYSQL_DATABASE"],
            cors_origins=origins,
            firebase_project_id=os.environ["FIREBASE_PROJECT_ID"],
            mysql_ssl_ca=os.getenv("MYSQL_SSL_CA") or None,
        )
