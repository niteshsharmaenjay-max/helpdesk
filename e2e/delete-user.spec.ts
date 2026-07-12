import { expect, test, type Page } from "@playwright/test";

const ADMIN = { email: "admin@e2e.test", password: "e2e-admin-password" };

async function loginAs(page: Page, { email, password }: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/dashboard");
}

async function createTestUser(page: Page, overrides: { name?: string; email?: string; password?: string } = {}) {
  const email = overrides.email ?? `delete-target-${Date.now()}-${Math.random().toString(36).slice(2)}@e2e.test`;
  const password = overrides.password ?? "password123";
  const name = overrides.name ?? "Delete Target";

  const response = await page.request.post("/api/users", { data: { name, email, password } });
  expect(response.ok()).toBeTruthy();

  return { name, email, password };
}

test.describe("Delete user", () => {
  test("shows a confirmation dialog and does not delete on cancel", async ({ page }) => {
    await loginAs(page, ADMIN);
    const target = await createTestUser(page);
    await page.goto("/users");

    await page.getByRole("row", { name: target.email }).getByRole("button", { name: /^Delete/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Delete user" })).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(target.email)).toBeVisible();
  });

  test("soft-deletes a user and removes them from the list", async ({ page }) => {
    await loginAs(page, ADMIN);
    const target = await createTestUser(page);
    await page.goto("/users");
    await expect(page.getByText(target.email)).toBeVisible();

    await page.getByRole("row", { name: target.email }).getByRole("button", { name: /^Delete/ }).click();
    await page.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(target.email)).toHaveCount(0);
  });

  test("revokes the deleted user's active session immediately", async ({ page, browser }) => {
    await loginAs(page, ADMIN);
    const target = await createTestUser(page);

    const targetContext = await browser.newContext();
    const targetPage = await targetContext.newPage();
    await loginAs(targetPage, target);
    await expect(targetPage.getByRole("heading", { name: "Helpdesk" })).toHaveCount(0);

    await page.goto("/users");
    await page.getByRole("row", { name: target.email }).getByRole("button", { name: /^Delete/ }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // The deleted user's existing session must be rejected server-side, not
    // just hidden client-side.
    await targetPage.goto("/");
    await expect(targetPage).toHaveURL("/login");

    await targetContext.close();
  });

  test("cannot delete an admin: the button is disabled and the API rejects it", async ({ page }) => {
    await loginAs(page, ADMIN);
    await page.goto("/users");

    await expect(page.getByRole("row", { name: ADMIN.email }).getByRole("button", { name: /can.t be deleted/ })).toBeDisabled();

    const sessionResponse = await page.request.get("/api/auth/get-session");
    const session = await sessionResponse.json();
    const response = await page.request.delete(`/api/users/${session.user.id}`);
    expect(response.status()).toBe(400);
    await expect(page.getByText(ADMIN.email)).toBeVisible();
  });
});
