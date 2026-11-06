import { test, expect, type Page } from "@playwright/test";

try {
  process.loadEnvFile(".env");
} catch {
  // sem .env: usa as variáveis do ambiente
}

const adminEmail = process.env.SEED_ADMIN_EMAIL;
const adminPassword = process.env.SEED_ADMIN_PASSWORD;

async function loginAdmin(page: Page) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(adminEmail!);
  await page.getByLabel("Senha").fill(adminPassword!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe("páginas públicas", () => {
  for (const path of ["/", "/precos", "/agendar", "/contato", "/cadastro", "/esqueci-senha", "/agendamento"]) {
    test(`${path} carrega`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
    });
  }

  test("manifesto do PWA, robots e sitemap", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBe(true);
    expect((await manifest.json()).short_name).toBe("LJC");
    expect((await request.get("/robots.txt")).ok()).toBe(true);
    expect((await request.get("/sitemap.xml")).ok()).toBe(true);
    expect((await request.get("/sw.js")).ok()).toBe(true);
  });

  test("link de redefinição inválido mostra aviso", async ({ page }) => {
    await page.goto("/redefinir-senha?t=token-invalido-1234567890");
    await expect(page.getByText("inválido, já foi usado ou expirou")).toBeVisible();
  });
});

test("painel e portal exigem login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/entrar/);
  await page.goto("/cliente");
  await expect(page).toHaveURL(/\/entrar/);
});

test("login com senha errada mostra erro", async ({ page }) => {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(`naoexiste-${Date.now()}@teste.local`);
  await page.getByLabel("Senha").fill("senha-errada-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
});

test("cliente cria conta e vê o próprio painel", async ({ page }) => {
  const n = Date.now().toString().slice(-8);
  await page.goto("/cadastro");
  await page.getByLabel("Nome").fill("Cliente E2E");
  await page.getByLabel("WhatsApp (com DDD)").fill(`799${n}`);
  await page.getByLabel("E-mail").fill(`e2e-${n}@teste.local`);
  await page.getByLabel("Senha (mín. 10 caracteres, letras e números)").fill("SenhaE2E12345");
  await page.getByLabel("Confirme a senha").fill("SenhaE2E12345");
  await page.getByText("Concordo com o uso dos meus dados").click();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/cliente$/);
  await expect(page.getByRole("heading", { name: /Olá, Cliente/ })).toBeVisible();
  await page.goto("/cliente/conta");
  await expect(page.getByRole("heading", { name: "Minha conta" })).toBeVisible();
  // cliente não entra no painel da equipe
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/cliente$/);
});

test.describe("administrador", () => {
  test.skip(!adminEmail || !adminPassword, "SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD não definidos");

  test("navega por todas as telas do painel", async ({ page }) => {
    await loginAdmin(page);
    for (const path of [
      "/admin/agenda",
      "/admin/agenda/novo",
      "/admin/fila",
      "/admin/os",
      "/admin/os/nova",
      "/admin/clientes",
      "/admin/caixa",
      "/admin/financeiro",
      "/admin/despesas",
      "/admin/estoque",
      "/admin/fidelidade",
      "/admin/funcionarios",
      "/admin/configuracoes",
      "/admin/conta",
    ]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page).toHaveURL(new RegExp(path));
      await expect(page.locator("h1").first(), path).toBeVisible();
    }
  });

  test("cadastra produto no estoque e registra entrada", async ({ page }) => {
    await loginAdmin(page);
    const name = `Produto E2E ${Date.now()}`;
    await page.goto("/admin/estoque");
    await page.locator("#it-name").fill(name);
    await page.locator("#it-initial").fill("1000");
    await page.locator("#it-min").fill("200");
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByText("Produto cadastrado.")).toBeVisible();
    await expect(page.getByRole("cell", { name })).toBeVisible();
    await page.locator("#mv-item").selectOption({ label: `${name} (1.000 un)` });
    await page.locator("#mv-qty").fill("500");
    await page.getByRole("button", { name: "Registrar" }).click();
    await expect(page.getByText(/Saldo atual: 1\.500/)).toBeVisible();
  });
});
