import { expect, test } from "@playwright/test";

/**
 * Offline harness QA — runs with NEXT_PUBLIC_USE_MOCK_AI=true (no Groq / Upstash).
 * Validates vibe UX + real PDF compile via /api/compile (local pdflatex or latexonline).
 */
test.describe("Vibe editor harness (mock AI)", () => {
  test("streams engine steps, renders PDF preview, and bumps token meter", async ({
    page,
  }) => {
    await page.goto("/dev/harness");
    await expect(page.getByTestId("vibe-harness")).toBeVisible();

    const meter = page.getByText(/Tokens Used Today/i);
    await expect(meter).toBeVisible();
    const beforeText = await meter.textContent();
    const beforeUsed = Number(
      (beforeText ?? "0").replace(/,/g, "").match(/(\d+)/)?.[1] ?? "0",
    );

    await page
      .getByTestId("vibe-prompt")
      .fill("Add AWS and Docker to my technical skills");
    await page.getByTestId("vibe-submit").click();
    const keep = page.getByTestId("ai-proposal-keep");
    if (await keep.isVisible().catch(() => false)) {
      await keep.click();
    }

    await expect(page.getByTestId("vermilion-loader")).toBeVisible();
    await expect(page.getByTestId("status-log")).toContainText(
      "[1/4] Reading your request…",
    );
    await expect(page.getByTestId("status-log")).toContainText(
      "[2/4] Checking today’s AI quota…",
      { timeout: 10_000 },
    );
    await expect(page.getByTestId("status-log")).toContainText(
      "[3/4] Updating the one-page preview…",
      { timeout: 10_000 },
    );
    await expect(page.getByTestId("status-log")).toContainText(
      /\[4\/4\] PDF rendered successfully/,
      { timeout: 90_000 },
    );

    const preview = page.getByTestId("pdf-preview-canvas");
    await expect(preview).toHaveAttribute("data-pdf-ready", "true", {
      timeout: 10_000,
    });
    await expect(preview).toHaveAttribute("data-page-count", "1");
    await expect(preview.locator("img[alt^='Resume PDF page']")).toBeVisible();
    await expect(page.getByTestId("harness-latex-skills")).toContainText(/AWS/i);
    await expect(page.getByTestId("harness-latex-skills")).toContainText(/Docker/i);
    await expect(page.getByTestId("one-page-lock")).toContainText(
      /1-PAGE LOCK ACTIVE|1 page locked|1 page/i,
    );
    await expect(meter).toContainText(/Tokens Used Today/i);
    await expect
      .poll(async () => {
        const text = await meter.textContent();
        return Number((text ?? "0").replace(/,/g, "").match(/(\d+)/)?.[1] ?? "0");
      })
      .toBeGreaterThan(beforeUsed);
  });

  test("Cmd/Ctrl+Enter triggers vibe edit from the prompt", async ({ page }) => {
    await page.goto("/dev/harness");
    const prompt = page.getByTestId("vibe-prompt");
    await prompt.fill("Add AWS and Docker to my technical skills");
    await prompt.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
    await expect(page.getByTestId("status-log")).toContainText("[1/4]", {
      timeout: 10_000,
    });
    await expect(page.getByTestId("pdf-preview-canvas")).toHaveAttribute(
      "data-pdf-ready",
      "true",
      { timeout: 90_000 },
    );
    await expect(page.getByTestId("harness-latex-skills")).toContainText(/AWS/i);
  });
});

test.describe("Authenticated vibe editor (optional)", () => {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;

  test.skip(!email || !password, "Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run");

  test("signs in, vibe-edits skills, and keeps 1-page lock", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/dashboard/, { timeout: 30_000 });

    await page.getByRole("button", { name: /Create New Resume/i }).first().click();
    await page.waitForURL(/\/editor\//, { timeout: 30_000 });

    const meter = page.getByText(/Tokens Used Today/i).first();
    const beforeText = await meter.textContent();
    const beforeUsed = Number(
      (beforeText ?? "0").replace(/,/g, "").match(/(\d+)/)?.[1] ?? "0",
    );

    await page
      .getByTestId("vibe-prompt")
      .fill("Add AWS and Docker to my technical skills");
    await page.getByTestId("vibe-submit").click();
    await page.getByTestId("ai-proposal-keep").click({ timeout: 120_000 });

    await expect(page.getByTestId("status-log")).toContainText(/PDF rendered successfully|Changes kept|Preview ready/, {
      timeout: 120_000,
    });
    await expect(page.getByTestId("pdf-preview-canvas")).toHaveAttribute(
      "data-pdf-ready",
      "true",
    );
    await expect(page.getByTestId("pdf-preview-canvas")).toHaveAttribute(
      "data-page-count",
      "1",
    );
    await expect(page.getByTestId("one-page-lock")).toContainText(
      /1-PAGE LOCK ACTIVE|1 page locked|1 page/i,
    );
    await expect
      .poll(async () => {
        const text = await meter.textContent();
        return Number((text ?? "0").replace(/,/g, "").match(/(\d+)/)?.[1] ?? "0");
      })
      .toBeGreaterThan(beforeUsed);
  });
});
