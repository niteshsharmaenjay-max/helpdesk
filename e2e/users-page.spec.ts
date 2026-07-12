import { expect, test, type Page } from "@playwright/test";

const ADMIN = { email: "admin@e2e.test", password: "e2e-admin-password" };
const AGENT = { email: "agent@e2e.test", password: "e2e-agent-password" };

async function login(page: Page, { email, password }: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/dashboard");
}

test.describe("Users page access control", () => {
  test("admin sees the Users nav link and can open the Users page", async ({ page }) => {
    await login(page, ADMIN);

    const usersLink = page.getByRole("link", { name: "Users" });
    await expect(usersLink).toBeVisible();

    await usersLink.click();
    await expect(page).toHaveURL("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  });

  test("agent has no Users nav link and is redirected away from /users", async ({ page }) => {
    await login(page, AGENT);

    await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);

    await page.goto("/users");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Users" })).toHaveCount(0);
  });

  test("unauthenticated visitor is redirected from /users to /login", async ({ page }) => {
    await page.goto("/users");
    await expect(page).toHaveURL("/login");
  });
});
