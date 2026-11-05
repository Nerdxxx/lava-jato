import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type DbHandle } from "@/db/client";
import {
  cashMovements,
  expenseCategories,
  expenses,
  payments,
  resources,
  serviceChecklistTemplates,
  servicePrices,
  services,
  users,
  workOrderChecklistItems,
  workOrders,
} from "@/db/schema";
import { hasPermission } from "@/lib/permissions";
import { addCashMovement, closeCashRegister, getCashBalance, openCashRegister } from "@/modules/finance/cash";
import { cancelExpense, createExpense, markExpensePaid } from "@/modules/finance/expenses";
import { safeText, toCsv, toXlsx } from "@/modules/finance/export";
import { deriveFinancialStatus, getPaymentSummary, recordPayments, refundPayment } from "@/modules/finance/payments";
import { getFinancialSummary } from "@/modules/finance/reports";
import { applyDiscount, changeWorkOrderStatus, createWalkInWorkOrder, toggleChecklistItem } from "@/modules/operations/work-orders";

const handles: DbHandle[] = [];
afterEach(async () => {
  while (handles.length) await handles.pop()!.close();
});

async function setup() {
  const handle = await createDb("pglite://memory");
  handles.push(handle);
  await handle.migrate("./drizzle");
  const { db } = handle;
  await db.insert(resources).values({ name: "Vaga 1" });
  const [svc] = await db.insert(services).values({ slug: "externa", name: "Lavagem externa", durationMinutes: 40 }).returning();
  await db.insert(servicePrices).values({ serviceId: svc!.id, category: "CARRO_PEQUENO", priceCents: 4000 });
  await db.insert(serviceChecklistTemplates).values([{ serviceId: svc!.id, position: 0, label: "Lavar" }]);
  const [staff] = await db.insert(users).values({ name: "Caixa", email: "c@example.com", passwordHash: "x", role: "ADMINISTRADOR" }).returning();
  const [cat] = await db.insert(expenseCategories).values({ name: "Produtos" }).returning();
  let n = 0;
  const newOrder = async () => {
    n++;
    const r = await createWalkInWorkOrder(
      db,
      { name: "Cliente " + n, phone: `799990${String(1000 + n)}`, category: "CARRO_PEQUENO", serviceId: svc!.id, vehicleModel: "Onix" },
      staff!.id,
    );
    if (!r.ok) throw new Error("setup " + r.message);
    return r.value;
  };
  return { db, staff: staff!, cat: cat!, newOrder };
}

describe("status financeiro e permissões", () => {
  it("deriva o status corretamente", () => {
    const d = (dueCents: number, paidCents: number, hasRefund = false, cancelled = false) =>
      deriveFinancialStatus({ dueCents, paidCents, hasRefund, cancelled });
    expect(d(4000, 0)).toBe("PENDENTE");
    expect(d(4000, 1000)).toBe("PARCIAL");
    expect(d(4000, 4000)).toBe("PAGO");
    expect(d(0, 0)).toBe("PAGO");
    expect(d(4000, 0, true)).toBe("ESTORNADO");
    expect(d(4000, 4000, false, true)).toBe("CANCELADO");
  });
  it("atendente recebe e opera caixa; só administrador estorna e vê relatórios", () => {
    expect(hasPermission("ATENDENTE", "financeiro:receber")).toBe(true);
    expect(hasPermission("ATENDENTE", "caixa:operar")).toBe(true);
    expect(hasPermission("ATENDENTE", "financeiro:estornar")).toBe(false);
    expect(hasPermission("ATENDENTE", "financeiro:ver")).toBe(false);
    expect(hasPermission("FUNCIONARIO", "financeiro:receber")).toBe(false);
    expect(hasPermission("ADMINISTRADOR", "financeiro:estornar")).toBe(true);
  });
});

describe("pagamentos", () => {
  it("pagamento dividido quita a OS", async () => {
    const s = await setup();
    const wo = await s.newOrder();
    expect((await openCashRegister(s.db, 10000, s.staff.id)).ok).toBe(true);
    const r = await recordPayments(s.db, wo.id, [{ method: "DINHEIRO", amountCents: 1500 }, { method: "PIX", amountCents: 2500 }], s.staff.id);
    expect(r.ok).toBe(true);
    expect(await getPaymentSummary(s.db, wo.id)).toEqual({ dueCents: 4000, paidCents: 4000, remainingCents: 0 });
    const [row] = await s.db.select().from(workOrders).where(eq(workOrders.id, wo.id));
    expect(row!.financialStatus).toBe("PAGO");
  });
  it("pagamento parcial → PARCIAL", async () => {
    const s = await setup();
    const wo = await s.newOrder();
    await recordPayments(s.db, wo.id, [{ method: "PIX", amountCents: 1000 }], s.staff.id);
    const [row] = await s.db.select().from(workOrders).where(eq(workOrders.id, wo.id));
    expect(row!.financialStatus).toBe("PARCIAL");
  });
  it("rejeita valor maior que o saldo, zero, negativo e 'Outro' sem descrição", async () => {
    const s = await setup();
    const wo = await s.newOrder();
    expect((await recordPayments(s.db, wo.id, [{ method: "PIX", amountCents: 4001 }], s.staff.id)).ok).toBe(false);
    expect((await recordPayments(s.db, wo.id, [{ method: "PIX", amountCents: 0 }], s.staff.id)).ok).toBe(false);
    expect((await recordPayments(s.db, wo.id, [{ method: "PIX", amountCents: -5 }], s.staff.id)).ok).toBe(false);
    expect((await recordPayments(s.db, wo.id, [{ method: "OUTRO", amountCents: 100 }], s.staff.id)).ok).toBe(false);
    expect(await s.db.select().from(payments)).toHaveLength(0);
  });
  it("tudo-ou-nada: dinheiro sem caixa aberto não grava nem a parte em Pix", async () => {
    const s = await setup();
    const wo = await s.newOrder();
    const r = await recordPayments(s.db, wo.id, [{ method: "PIX", amountCents: 2000 }, { method: "DINHEIRO", amountCents: 2000 }], s.staff.id);
    expect(r.ok).toBe(false);
    expect(await s.db.select().from(payments)).toHaveLength(0);
  });
  it("idempotência: reenviar o mesmo formulário não duplica", async () => {
    const s = await setup();
    const wo = await s.newOrder();
    const a = await recordPayments(s.db, wo.id, [{ method: "PIX", amountCents: 4000 }], s.staff.id, "key-123");
    const b = await recordPayments(s.db, wo.id, [{ method: "PIX", amountCents: 4000 }], s.staff.id, "key-123");
    expect(a.ok && b.ok).toBe(true);
    expect(await s.db.select().from(payments)).toHaveLength(1);
  });
  it("recebimentos simultâneos não ultrapassam o saldo", async () => {
    const s = await setup();
    const wo = await s.newOrder();
    const rs = await Promise.all([
      recordPayments(s.db, wo.id, [{ method: "PIX", amountCents: 3000 }], s.staff.id, "k1"),
      recordPayments(s.db, wo.id, [{ method: "PIX", amountCents: 3000 }], s.staff.id, "k2"),
    ]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect((await getPaymentSummary(s.db, wo.id))!.paidCents).toBe(3000);
  });
  it("entrega exige pagamento integral", async () => {
    const s = await setup();
    const wo = await s.newOrder();
    const go = (to: Parameters<typeof changeWorkOrderStatus>[2]) => changeWorkOrderStatus(s.db, wo.id, to, s.staff.id);
    await go("EM_LAVAGEM");
    await go("EM_FINALIZACAO");
    for (const i of await s.db.select().from(workOrderChecklistItems)) await toggleChecklistItem(s.db, i.id, true, s.staff.id);
    await go("AGUARDANDO_INSPECAO");
    await go("PRONTO_PARA_ENTREGA");
    const blocked = await go("ENTREGUE");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.message).toMatch(/pagamento/i);
    await recordPayments(s.db, wo.id, [{ method: "PIX", amountCents: 3000 }], s.staff.id);
    expect((await go("ENTREGUE")).ok).toBe(false); // ainda parcial
    await recordPayments(s.db, wo.id, [{ method: "PIX", amountCents: 1000 }], s.staff.id);
    expect((await go("ENTREGUE")).ok).toBe(true);
  });
  it("desconto total deixa a OS paga; desconto não pode ficar abaixo do já pago", async () => {
    const s = await setup();
    const a = await s.newOrder();
    expect((await applyDiscount(s.db, a.id, 4000)).ok).toBe(true);
    const [ra] = await s.db.select().from(workOrders).where(eq(workOrders.id, a.id));
    expect(ra!.financialStatus).toBe("PAGO");
    const b = await s.newOrder();
    await recordPayments(s.db, b.id, [{ method: "PIX", amountCents: 3000 }], s.staff.id);
    expect((await applyDiscount(s.db, b.id, 2000)).ok).toBe(false);
    expect((await applyDiscount(s.db, b.id, 1000)).ok).toBe(true);
    const [rb] = await s.db.select().from(workOrders).where(eq(workOrders.id, b.id));
    expect(rb!.financialStatus).toBe("PAGO");
  });
  it("cancelar OS com pagamento exige estorno; depois cancela", async () => {
    const s = await setup();
    const wo = await s.newOrder();
    const r = await recordPayments(s.db, wo.id, [{ method: "PIX", amountCents: 4000 }], s.staff.id);
    if (!r.ok) throw new Error("x");
    const pid = r.value.paymentIds[0]!;
    expect((await changeWorkOrderStatus(s.db, wo.id, "CANCELADO", s.staff.id)).ok).toBe(false);
    expect((await refundPayment(s.db, pid, "x", s.staff.id)).ok).toBe(false);
    const rf = await refundPayment(s.db, pid, "Cliente desistiu", s.staff.id);
    expect(rf.ok && rf.value.status).toBe("ESTORNADO");
    expect((await refundPayment(s.db, pid, "de novo", s.staff.id)).ok).toBe(false);
    expect((await changeWorkOrderStatus(s.db, wo.id, "CANCELADO", s.staff.id)).ok).toBe(true);
    const [row] = await s.db.select().from(workOrders).where(eq(workOrders.id, wo.id));
    expect(row!.financialStatus).toBe("CANCELADO");
  });
});

describe("caixa", () => {
  it("apenas um caixa aberto por vez, inclusive em corrida", async () => {
    const s = await setup();
    const rs = await Promise.all([openCashRegister(s.db, 5000, s.staff.id), openCashRegister(s.db, 5000, s.staff.id)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect((await openCashRegister(s.db, 0, s.staff.id)).ok).toBe(false);
  });
  it("saldo esperado considera abertura, dinheiro, suprimento, sangria e estorno; Pix não entra", async () => {
    const s = await setup();
    const reg = await openCashRegister(s.db, 10000, s.staff.id);
    if (!reg.ok) throw new Error("x");
    const p = await recordPayments(s.db, (await s.newOrder()).id, [{ method: "DINHEIRO", amountCents: 4000 }], s.staff.id);
    if (!p.ok) throw new Error("x");
    await recordPayments(s.db, (await s.newOrder()).id, [{ method: "PIX", amountCents: 4000 }], s.staff.id);
    expect((await addCashMovement(s.db, "SUPRIMENTO", 2000, "Troco", s.staff.id)).ok).toBe(true);
    expect((await addCashMovement(s.db, "SANGRIA", 3000, "Retirada", s.staff.id)).ok).toBe(true);
    expect((await addCashMovement(s.db, "SANGRIA", 99999, "Demais", s.staff.id)).ok).toBe(false);
    expect((await getCashBalance(s.db, reg.value.id))!.expectedCents).toBe(10000 + 4000 + 2000 - 3000);
    await refundPayment(s.db, p.value.paymentIds[0]!, "Erro de cobrança", s.staff.id);
    expect((await getCashBalance(s.db, reg.value.id))!.expectedCents).toBe(10000 + 2000 - 3000);
    expect(await s.db.select().from(cashMovements)).toHaveLength(4);
  });
  it("fechamento grava a diferença, exige observação e libera novo caixa", async () => {
    const s = await setup();
    const reg = await openCashRegister(s.db, 10000, s.staff.id);
    if (!reg.ok) throw new Error("x");
    expect((await closeCashRegister(s.db, 9000, s.staff.id)).ok).toBe(false);
    const c = await closeCashRegister(s.db, 9000, s.staff.id, "Faltou troco");
    expect(c.ok && c.value.differenceCents).toBe(-1000);
    expect((await closeCashRegister(s.db, 0, s.staff.id)).ok).toBe(false);
    expect((await openCashRegister(s.db, 9000, s.staff.id)).ok).toBe(true);
  });
  it("sem caixa aberto não recebe dinheiro", async () => {
    const s = await setup();
    const wo = await s.newOrder();
    expect((await recordPayments(s.db, wo.id, [{ method: "DINHEIRO", amountCents: 1000 }], s.staff.id)).ok).toBe(false);
  });
});

describe("despesas e relatórios", () => {
  it("valida, paga e cancela com motivo", async () => {
    const s = await setup();
    const base = { categoryId: s.cat.id, amountCents: 100, expenseDate: "2030-01-07" };
    expect((await createExpense(s.db, { ...base, description: "x" }, s.staff.id)).ok).toBe(false);
    expect((await createExpense(s.db, { ...base, description: "Shampoo", amountCents: -1 }, s.staff.id)).ok).toBe(false);
    expect((await createExpense(s.db, { ...base, description: "Shampoo", expenseDate: "2030-13-40" }, s.staff.id)).ok).toBe(false);
    const e = await createExpense(s.db, { ...base, description: "Shampoo", amountCents: 5000 }, s.staff.id);
    if (!e.ok) throw new Error("x");
    expect((await cancelExpense(s.db, e.value.id, "")).ok).toBe(false);
    expect((await markExpensePaid(s.db, e.value.id)).ok).toBe(true);
    expect((await cancelExpense(s.db, e.value.id, "Engano")).ok).toBe(false);
    expect(await s.db.select().from(expenses)).toHaveLength(1);
  });
  it("resumo: recebido por meio, estornos, despesas, resultado e a receber", async () => {
    const s = await setup();
    await openCashRegister(s.db, 0, s.staff.id);
    const a = await s.newOrder();
    const b = await s.newOrder();
    await s.newOrder();
    await recordPayments(s.db, a.id, [{ method: "DINHEIRO", amountCents: 1000 }, { method: "PIX", amountCents: 3000 }], s.staff.id);
    const pb = await recordPayments(s.db, b.id, [{ method: "PIX", amountCents: 4000 }], s.staff.id);
    if (!pb.ok) throw new Error("x");
    await refundPayment(s.db, pb.value.paymentIds[0]!, "Devolução", s.staff.id);
    await createExpense(s.db, { description: "Produtos", categoryId: s.cat.id, amountCents: 1500, expenseDate: "2030-01-07", paid: true }, s.staff.id);
    const jan = await getFinancialSummary(s.db, "2030-01-01", "2030-01-31");
    expect(jan!.receivedCents).toBe(0);
    expect(jan!.expensesPaidCents).toBe(1500);
    const all = await getFinancialSummary(s.db, "2020-01-01", "2099-12-31");
    expect(all!.receivedCents).toBe(4000);
    expect(all!.refundedCents).toBe(4000);
    expect(all!.byMethod.find((m) => m.method === "PIX")!.totalCents).toBe(3000);
    expect(all!.receivableCents).toBe(8000);
    expect(all!.resultCents).toBe(4000 - 1500);
    expect(await getFinancialSummary(s.db, "2030-02-01", "2030-01-01")).toBeNull();
  });
});

describe("exportação", () => {
  it("CSV neutraliza fórmulas e formata valores", () => {
    expect(safeText('=HYPERLINK("x")')).toBe('\'=HYPERLINK("x")');
    expect(safeText("+1")).toBe("'+1");
    expect(safeText("Normal")).toBe("Normal");
    const csv = toCsv({
      name: "t",
      headers: ["Descrição", "Valor"],
      rows: [["=cmd|calc", 12345], ['Com "aspas"; e ponto', 50]],
      moneyCols: [1],
    });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("'=cmd|calc;123,45");
    expect(csv).toContain('"Com ""aspas""; e ponto";0,50');
  });
  it("gera XLSX válido com texto seguro e valor numérico", async () => {
    const buf = await toXlsx({ name: "Pagamentos", headers: ["A", "Valor"], rows: [["=1+1", 1000]], moneyCols: [1] });
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Pagamentos")!;
    expect(ws.getCell("A2").value).toBe("'=1+1");
    expect(ws.getCell("B2").value).toBe(10);
  });
});
