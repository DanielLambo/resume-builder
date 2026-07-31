"""Default template catalog — Jake first, no personal templates."""
import pytest

from app.catalog import default_template_id, list_templates
from app.seed_templates import JAKE_NAME, build_seed_templates


@pytest.mark.asyncio
async def test_jake_is_default_template(app_client):
    resp = await app_client.get("/templates")
    assert resp.status_code == 200
    assert b"Jake" in resp.content
    assert b"Default" in resp.content
    assert b"Daniel" not in resp.content
    assert b"Harvard Classic" in resp.content
    assert b"Modern SWE" in resp.content
    assert b"New Grad" in resp.content


@pytest.mark.asyncio
async def test_dashboard_selects_jake_for_upload(app_client):
    resp = await app_client.get("/")
    assert resp.status_code == 200
    body = resp.text
    assert "Jake" in body
    assert "selected" in body
    assert "Daniel" not in body
    assert "this browser" in body.lower() or "browser" in body.lower()


def test_seed_catalog_has_no_daniel():
    names = [t["name"] for t in build_seed_templates()]
    assert names[0] == JAKE_NAME
    assert all("Daniel" not in n for n in names)
    assert "Harvard Classic" in names
    assert "Blank" in names


def test_catalog_default_is_jake():
    templates = list_templates()
    assert templates
    assert default_template_id() == next(t["id"] for t in templates if t["is_default"])
    assert next(t for t in templates if t["is_default"])["name"] == JAKE_NAME
