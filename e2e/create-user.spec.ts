import { expect, test, type Page } from "@playwright/test";

const ADMIN = { email: "admin@e2e.test", password: "e2e-admin-password" };

async function loginAs(page: Page, { email, password }: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/dashboard");
}

test.describe("Create user", () => {
  test("creates a new user and shows it in the list", async ({ page }) => {
    await loginAs(page, ADMIN);
    await page.goto("/users");

    await page.getByRole("button", { name: "Create user" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const email = `create-user-${Date.now()}@e2e.test`;
    await page.getByLabel("Name").fill("New Hire");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText("New Hire")).toBeVisible();
  });

  test("shows validation errors on an empty submit", async ({ page }) => {
    await loginAs(page, ADMIN);
    await page.goto("/users");

    await page.getByRole("button", { name: "Create user" }).click();
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText("Name must be at least 3 characters")).toBeVisible();
    await expect(page.getByText("Email is required")).toBeVisible();
    await expect(page.getByText("Password must be at least 8 characters")).toBeVisible();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("shows an inline error and keeps the dialog open for a duplicate email", async ({ page }) => {
    await loginAs(page, ADMIN);
    await page.goto("/users");

    await page.getByRole("button", { name: "Create user" }).click();
    await page.getByLabel("Name").fill("Duplicate Admin");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText("A user with this email already exists")).toBeVisible();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});
