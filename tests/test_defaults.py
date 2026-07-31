"""Default template is Jake's Resume for new users."""
import pytest


@pytest.mark.asyncio
async def test_jake_is_default_template(app_client):
    resp = await app_client.get("/templates")
    assert resp.status_code == 200
    assert b"Jake" in resp.content
    assert b"Default" in resp.content


@pytest.mark.asyncio
async def test_new_resume_defaults_to_jake(app_client):
    # No template_id → should use Jake
    resp = await app_client.post(
        "/resume/new",
        data={"title": "Fresh Start"},
        follow_redirects=False,
    )
    assert resp.status_code == 303
    loc = resp.headers["location"]
    assert loc.startswith("/resume/")
    resume_id = int(loc.rsplit("/", 1)[-1])

    editor = await app_client.get(f"/resume/{resume_id}")
    assert editor.status_code == 200
    # Jake's template content markers
    assert b"Jake Ryan" in editor.content or b"resumeSubheading" in editor.content
    assert b"resumeSubHeadingListStart" in editor.content


@pytest.mark.asyncio
async def test_dashboard_selects_jake_for_upload(app_client):
    resp = await app_client.get("/")
    assert resp.status_code == 200
    body = resp.text
    assert "Jake" in body
    assert "selected" in body
