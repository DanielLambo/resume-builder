"""Database seed / migration behavior."""
import pytest

from app.database import get_db, init_db
from app.seed_templates import JAKE_NAME


@pytest.mark.asyncio
async def test_jake_latex_not_overwritten_on_reinit(_isolate_storage):
    await init_db()
    async with get_db() as db:
        cur = await db.execute(
            "SELECT id, latex_content FROM templates WHERE name = ?", (JAKE_NAME,)
        )
        row = await cur.fetchone()
        assert row is not None
        tpl_id = row["id"]
        await db.execute(
            "UPDATE templates SET latex_content = ? WHERE id = ?",
            ("%CUSTOMIZED JAKE%", tpl_id),
        )
        await db.commit()

    await init_db()  # should NOT clobber latex_content
    async with get_db() as db:
        cur = await db.execute(
            "SELECT latex_content FROM templates WHERE name = ?", (JAKE_NAME,)
        )
        row = await cur.fetchone()
    assert row["latex_content"] == "%CUSTOMIZED JAKE%"


@pytest.mark.asyncio
async def test_init_inserts_templates_when_empty(_isolate_storage):
    await init_db()
    async with get_db() as db:
        cur = await db.execute("SELECT COUNT(*) AS n FROM templates")
        n = (await cur.fetchone())["n"]
    assert n >= 1
