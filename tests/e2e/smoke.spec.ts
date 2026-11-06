import { test, expect } from "@playwright/test";

try {
  process.loadEnvFile(".env");
} catch {
  // sem .env: usa as variáveis do ambiente
}

const adminEmail = process.env.SEED_ADMIN_EMAIL;
const adminPassword = process.env.SEED_ADMIN_PASSWORD;

test.describe("páginas públicas", () => {
  for (const path of ["/", "/precos", "/agendar"]) {
    test(`${path} carrega`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator("body")).not.toBeEmpty();
    });
  }
});

test("painel exige login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/entrar/);
});

test("login com senha errada mostra erro", async ({ page }) => {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(`naoexiste-${Date.now()}@teste.local`);
  await page.getByLabel("Senha").fill("senha-errada-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
});

test("administrador entra e navega pelo painel", async ({ page }) => {
  test.skip(!adminEmail || !adminPassword, "SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD não definidos");
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(adminEmail!);
  await page.getByLabel("Senha").fill(adminPassword!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  for (const path of ["/admin/agenda", "/admin/os", "/admin/fila", "/admin/clientes", "/admin/caixa", "/admin/financeiro"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page).toHaveURL(new RegExp(path));
  }
});
