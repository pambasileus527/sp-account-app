from __future__ import annotations


class ApiError(Exception):
    """画面にそのまま出せる日本語のメッセージを持つエラー。"""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message
