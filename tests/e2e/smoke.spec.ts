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

async function selectNextAvailableSlot(page: Page): Promise<string> {
  const date = page.locator("#slot-date");
  const firstDay = await date.inputValue();
  const base = new Date(`${firstDay}T00:00:00.000Z`);
  for (let offset = 1; offset <= 29; offset++) {
    const next = new Date(base);
    next.setUTCDate(next.getUTCDate() + offset);
    const day = next.toISOString().slice(0, 10);
    await date.fill(day);
    await expect.poll(async () =>
      (await page.getByRole("radio").count()) +
      (await page.getByText("Sem horários livres nesta data. Tente outro dia.", { exact: true }).count()),
    ).toBeGreaterThan(0);
    if (await page.getByRole("radio").count() > 0) {
      await page.getByRole("radio").first().click();
      return day;
    }
  }
  throw new Error("Nenhum horário disponível nos próximos 29 dias.");
}

async function finishPublicBooking(page: Page, { addon }: { addon: boolean }) {
  await page.goto("/agendar?categoria=CARRO_PEQUENO");
  await expect(page.getByRole("heading", { name: "Escolha o serviço" })).toBeVisible();
  await page.getByRole("button", { name: /Lavagem completa/ }).click();
  await expect(page.getByRole("heading", { name: "Quer dar um cuidado extra ao seu carro?" })).toBeVisible();
  if (addon) await page.getByLabel(/Aplicação de cera/).check();
  await page.getByRole("button", { name: addon ? "Continuar" : "Continuar sem adicionais" }).click();
  await expect(page.getByRole("heading", { name: "Escolha a data e o horário" })).toBeVisible();
  const bookedDay = await selectNextAvailableSlot(page);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel("Nome").fill(`Cliente E2E ${Date.now()}`);
  await page.getByLabel("WhatsApp (com DDD)").fill(`(79) 9${Date.now().toString().slice(-8)}`);
  await page.getByLabel("Modelo do veículo").fill("Chevrolet Onix E2E");
  await page.getByRole("button", { name: "Revisar agendamento" }).click();
  const total = addon ? "R$ 80,00" : "R$ 60,00";
  await expect(page.getByText(total, { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "Solicitar agendamento" }).click();
  await expect(page).toHaveURL(/\/agendar\/confirmado$/);
  const code = (await page.locator("p.font-mono").innerText()).trim();
  return { bookedDay, code, total };
}

test.describe("páginas públicas", () => {
  for (const path of ["/", "/precos", "/agendar", "/contato", "/cadastro", "/esqueci-senha", "/agendamento", "/privacidade", "/termos"]) {
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

test.describe("site no celular (375px)", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("menu abre, prende o foco e fecha com Esc; sem rolagem lateral", async ({ page }) => {
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    const toggle = page.getByRole("button", { name: "Abrir menu" });
    await toggle.click();
    const menu = page.getByRole("dialog", { name: "Menu" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("link", { name: "Serviços" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeFocused();
  });

  test("agendamento: categoria pré-selecionada, adicionais somam no resumo", async ({ page }) => {
    await page.goto("/agendar?categoria=CARRO_PEQUENO");
    await expect(page.getByRole("heading", { name: "Escolha o serviço" })).toBeVisible();
    await page.getByRole("button", { name: /Lavagem externa/ }).click();
    await expect(page.getByRole("heading", { name: "Quer dar um cuidado extra ao seu carro?" })).toBeVisible();
    await page.getByText("Resumo do agendamento · Lavagem externa").click();
    const summary = page.getByRole("complementary", { name: "Resumo do agendamento" });
    await expect(summary).toContainText("R$ 40,00");
    await page.getByLabel(/Aplicação de cera/).check();
    await expect(summary).toContainText("R$ 60,00");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Escolha a data e o horário" })).toBeVisible();
  });
});

test("homepage e agendamento não criam rolagem horizontal nos tamanhos de celular", async ({ page }) => {
  const viewports: [number, number][] = [[320, 568], [360, 640], [375, 667], [390, 844], [400, 642], [430, 932], [768, 1024], [1280, 800]];
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `homepage ${width}px`).toBeLessThanOrEqual(width);
    await page.goto("/agendar");
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `agendamento ${width}px`).toBeLessThanOrEqual(width);
  }
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
  await page.locator("input[name=terms]").check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/cliente$/);
  await expect(page.getByRole("heading", { name: /Olá, Cliente/ })).toBeVisible();
  await page.goto("/cliente/conta");
  await expect(page.getByRole("heading", { name: "Minha conta" })).toBeVisible();
  // cliente não entra no painel da equipe
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/cliente$/);
});

test("fluxo E2E principal: lavagem completa, cera e OS preservam total de R$ 80", async ({ page }) => {
  test.skip(!adminEmail || !adminPassword, "SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD não definidos");
  const { bookedDay, code, total } = await finishPublicBooking(page, { addon: true });
  const confirmation = page.locator("main");
  await expect(confirmation).toContainText("Aplicação de cera");
  await expect(confirmation).toContainText(total);

  await loginAdmin(page);
  await page.goto(`/admin/agenda?data=${bookedDay}`);
  const appointment = page.locator("li").filter({ hasText: code });
  await expect(appointment).toContainText("Aplicação de cera");
  await expect(appointment).toContainText("R$ 80,00");
  await appointment.getByRole("button", { name: "Confirmar" }).click();
  await appointment.getByRole("button", { name: "Fazer check-in" }).click();
  await expect(page).toHaveURL(/\/admin\/os\/[0-9a-f-]+/i);
  await expect(page.getByRole("heading", { name: /Chevrolet Onix E2E/ })).toBeVisible();
  await expect(page.getByText("Aplicação de cera")).toBeVisible();
  await expect(page.getByText("R$ 80,00", { exact: true })).toBeVisible();
});

test("fluxo de agendamento sem adicionais mantém o preço da lavagem completa", async ({ page }) => {
  const { total } = await finishPublicBooking(page, { addon: false });
  await expect(page.locator("main")).not.toContainText("Aplicação de cera");
  await expect(page.locator("main")).toContainText(total);
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
