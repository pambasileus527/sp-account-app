from __future__ import annotations

import os
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sei TEXT NOT NULL,
  mei TEXT NOT NULL,
  birth TEXT NOT NULL,
  address TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,
  contact_email TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS codes (
  ticket TEXT PRIMARY KEY,
  user_id INTEGER,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sends INTEGER NOT NULL DEFAULT 1,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS mails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_name TEXT NOT NULL,
  from_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  unread INTEGER NOT NULL DEFAULT 1,
  starred INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS mails_user_time ON mails(user_id, received_at DESC);
"""


def connect(file: str) -> sqlite3.Connection:
    """リクエストごとに開く。autocommit なので、書いた内容はすぐ確定する。"""
    conn = sqlite3.connect(file, isolation_level=None, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(file: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(file)), exist_ok=True)
    conn = connect(file)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
    finally:
        conn.close()
