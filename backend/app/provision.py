from __future__ import annotations

from typing import Protocol


class Provisioner(Protocol):
    """「メールボックスを作る」処理の入口。本物のメールサーバー（Mailcow）につなぐときは、ここだけ差し替える。"""

    def is_available(self, address: str) -> bool: ...

    def create(self, *, address: str, password: str, name: str) -> None: ...


class LocalProvisioner:
    """手元用: 何もしない。アカウントはDBにあるだけ。"""

    def is_available(self, address: str) -> bool:
        return True

    def create(self, *, address: str, password: str, name: str) -> None:
        return None
