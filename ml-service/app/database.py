
import os
import psycopg2
from psycopg2.extras import RealDictCursor


DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("API_BASE_URL")


def get_connection():
    if not DATABASE_URL:
        raise RuntimeError(
            "Database connection is not configured. "
            "Set DATABASE_URL in the ML service environment."
        )

    return psycopg2.connect(
        DATABASE_URL,
        cursor_factory=RealDictCursor,
        connect_timeout=10,
        sslmode="require",
    )


def fetch_all(sql: str, params=None):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(sql, params or [])
            return cursor.fetchall()
    finally:
        connection.close()
