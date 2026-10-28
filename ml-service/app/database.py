import os
import psycopg2
from psycopg2.extras import RealDictCursor


DATABASE_URL = os.getenv("DATABASE_URL")


def get_connection():
    return psycopg2.connect(
        DATABASE_URL,
        cursor_factory=RealDictCursor
    )


def fetch_all(sql: str, params=None):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(sql, params or [])
            return cursor.fetchall()
    finally:
        connection.close()