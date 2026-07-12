import { expect, test, type Page } from "@playwright/test";

const ADMIN = { email: "admin@e2e.test", password: "e2e-admin-password", name: "E2E Admin" };
const AGENT = { email: "agent@e2e.test", password: "e2e-agent-password", name: "E2E Agent" };

async function loginAs(page: Page, { email, password }: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/dashboard");
}

test.describe("Login form validation", () => {
  test("shows validation errors when submitting an empty form", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Email is required")).toBeVisible();
    await expect(page.getByText("Password must be at least 8 characters")).toBeVisible();
    await expect(page).toHaveURL("/login");
  });

  test("shows a validation error for a malformed email", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("somepassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Enter a valid email")).toBeVisible();
    await expect(page).toHaveURL("/login");
  });

  test("shows a validation error for a too-short password", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Password must be at least 8 characters")).toBeVisible();
    await expect(page).toHaveURL("/login");
  });

  test("toggles password visibility", async ({ page }) => {
    await page.goto("/login");
    const passwordInput = page.getByLabel("Password", { exact: true });
    await passwordInput.fill("secret123");
    await expect(passwordInput).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Show password" }).click();
    await expect(passwordInput).toHaveAttribute("type", "text");

    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(passwordInput).toHaveAttribute("type", "password");
  });
});

test.describe("Login flow", () => {
  test("signs in an admin with valid credentials", async ({ page }) => {
    await loginAs(page, ADMIN);
    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("signs in an agent with valid credentials", async ({ page }) => {
    await loginAs(page, AGENT);
    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("rejects a wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password", { exact: true }).fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL("/login");
  });

  test("rejects a non-existent email", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@e2e.test");
    await page.getByLabel("Password", { exact: true }).fill("whatever123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL("/login");
  });

  test("does not leak whether the account exists via the error message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password", { exact: true }).fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    const wrongPasswordError = await page.getByRole("alert").textContent();

    await page.reload();
    await page.getByLabel("Email").fill("nobody@e2e.test");
    await page.getByLabel("Password", { exact: true }).fill("whatever123");
    await page.getByRole("button", { name: "Sign in" }).click();
    const noAccountError = await page.getByRole("alert").textContent();

    expect(wrongPasswordError).toEqual(noAccountError);
  });
});

test.describe("Session persistence & redirects", () => {
  test("redirects an unauthenticated visitor from / to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/login");
  });

  test("redirects an unauthenticated visitor from /users to /login", async ({ page }) => {
    await page.goto("/users");
    await expect(page).toHaveURL("/login");
  });

  test("redirects an already-authenticated user away from /login", async ({ page }) => {
    await loginAs(page, ADMIN);
    await page.goto("/login");
    await expect(page).toHaveURL("/dashboard");
  });

  test("keeps the session alive across a page reload", async ({ page }) => {
    await loginAs(page, ADMIN);
    await page.reload();
    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });
});

test.describe("Sign out", () => {
  test("signs out and redirects to /login", async ({ page }) => {
    await loginAs(page, ADMIN);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/login");
  });

  test("actually invalidates the session, not just the client-side view", async ({ page }) => {
    await loginAs(page, ADMIN);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/login");

    // Re-requesting a protected route after sign-out must redirect again,
    // proving the server-side session was cleared rather than just the UI state.
    await page.goto("/");
    await expect(page).toHaveURL("/login");
  });
});

test.describe("Sign-up is disabled", () => {
  test("there is no sign-up UI on the login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("link", { name: /sign up/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /sign up/i })).toHaveCount(0);
  });

  test("the sign-up API rejects requests even when called directly, and no account is created", async ({
    request,
  }) => {
    const email = `escaped-signup-${Date.now()}@e2e.test`;
    const signUpResponse = await request.post("/api/auth/sign-up/email", {
      data: { email, password: "password123", name: "Should Not Exist" },
    });
    expect(signUpResponse.ok()).toBeFalsy();

    const signInResponse = await request.post("/api/auth/sign-in/email", {
      data: { email, password: "password123" },
    });
    expect(signInResponse.ok()).toBeFalsy();
  });
});

test.describe("Role cannot be self-escalated", () => {
  test("an agent cannot grant themselves admin via a direct update-user API call", async ({ page }) => {
    await loginAs(page, AGENT);

    await page.request.post("/api/auth/update-user", {
      data: { name: AGENT.name, role: "ADMIN" },
    });

    const sessionResponse = await page.request.get("/api/auth/get-session");
    const session = await sessionResponse.json();
    expect(session.user.role).toBe("AGENT");

    // The UI must not have picked up an escalated role either.
    await page.reload();
    await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
  });
});
