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
  const email = overrides.email ?? `edit-target-${Date.now()}-${Math.random().toString(36).slice(2)}@e2e.test`;
  const password = overrides.password ?? "password123";
  const name = overrides.name ?? "Edit Target";

  const response = await page.request.post("/api/users", { data: { name, email, password } });
  expect(response.ok()).toBeTruthy();

  return { name, email, password };
}

test.describe("Edit user", () => {
  test("edits a user's name, email, and role", async ({ page }) => {
    await loginAs(page, ADMIN);
    const target = await createTestUser(page);
    await page.goto("/users");

    await page.getByRole("row", { name: target.email }).getByRole("button", { name: /^Edit/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Edit user" })).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveValue(target.email);

    const newEmail = `edited-${Date.now()}@e2e.test`;
    await page.getByLabel("Name").fill("Edited Target");
    await page.getByLabel("Email").fill(newEmail);
    await page.getByLabel("Role").selectOption("ADMIN");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Edited Target")).toBeVisible();
    await expect(page.getByText(newEmail)).toBeVisible();
  });

  test("leaving the password blank does not change the existing password", async ({ page }) => {
    await loginAs(page, ADMIN);
    const target = await createTestUser(page);
    await page.goto("/users");

    await page.getByRole("row", { name: target.email }).getByRole("button", { name: /^Edit/ }).click();
    await expect(page.getByLabel("Password")).toHaveValue("");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("/login");
    await loginAs(page, { email: target.email, password: target.password });
    await expect(page).toHaveURL("/dashboard");
  });

  test("changes the password when a new one is provided", async ({ page }) => {
    await loginAs(page, ADMIN);
    const target = await createTestUser(page);
    await page.goto("/users");

    await page.getByRole("row", { name: target.email }).getByRole("button", { name: /^Edit/ }).click();
    await page.getByLabel("Password").fill("brand-new-password");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("/login");
    await loginAs(page, { email: target.email, password: "brand-new-password" });
    await expect(page).toHaveURL("/dashboard");
  });

  test("shows an inline error and keeps the dialog open for a duplicate email", async ({ page }) => {
    await loginAs(page, ADMIN);
    const target = await createTestUser(page);
    await page.goto("/users");

    await page.getByRole("row", { name: target.email }).getByRole("button", { name: /^Edit/ }).click();
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("A user with this email already exists")).toBeVisible();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});
