const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function setup(items, schemes) {
    let controller;
    const context = { sap: { ui: { define(deps, factory) {
        controller = factory({ extend: (name, methods) => methods });
    } } } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../webapp/controller/View1.controller.js"), "utf8"), context);
    const state = { items, schemeDetails: controller._combineAdvanceSchemes(schemes) };
    controller.getView = () => ({ getModel: () => ({
        getProperty: key => state[key.slice(1)],
        setProperty: (key, value) => { state[key.slice(1)] = value; }
    }) });
    return { controller, state };
}

const items = [
    { rate: 200, qty: 10, quantityinbaseunit: 10 },
    { rate: 300, qty: 5, quantityinbaseunit: 5 }
];

test("highest Discount 1 applies to every line; a 140 pool allocates 80 and 60 before GST", () => {
    const { controller, state } = setup(items, [
        { SchemeName: "S1", Discount1: "5%", Discount2: "6%", AdvAmount: 1000 },
        { SchemeName: "S2", Discount1: "10%", Discount2: "8%", AdvAmount: 1000 }
    ]);
    controller._rebuildBillingItems();
    const [first, second] = state.billingItems;
    assert.equal(first.rateAfterDisA, 180);
    assert.equal(second.rateAfterDisA, 270);
    assert.equal(first.discount2Amount, 80);
    assert.equal(second.discount2Amount, 60);
    assert.equal(first.valueAfterDisB, 1720);
    assert.equal(second.valueAfterDisB, 1290);
    assert.equal(first.gstValue, 86);
    assert.equal(second.gstValue, 64.5);
    assert.equal(state.billingTotal, 3160.5);
    assert.equal(state.schemeValid, true, "billing may exceed combined advances");
    const payload = controller._buildSchemeBillingPayload();
    assert.equal(payload.InvoiceTotal, 3160.5);
    assert.equal(payload._Items[0].TaxableAmount, 1720);
    assert.equal(payload.AdvanceAmount, 2000);
});

test("each selected scheme uses its actual advance amount", () => {
    const { controller, state } = setup(items, [
        { SchemeName: "S1", Discount1: "10%", Discount2: "6%", AdvAmount: 1000 },
        { SchemeName: "S2", Discount1: "10%", Discount2: "8%", AdvAmount: 2000 }
    ]);
    controller._rebuildBillingItems();
    assert.equal(state.schemeDetails.Discount2Amount, 220);
    assert.equal(state.billingItems[0].discount2Amount, 125.71);
    assert.equal(state.billingItems[1].discount2Amount, 94.29);
    assert.equal(state.billingItems[0].valueAfterDisB, 1674.29);
    assert.equal(state.billingItems[1].valueAfterDisB, 1255.71);
    assert.equal(state.billingItems[0].gstValue, 83.71);
    assert.equal(state.billingItems[1].gstValue, 62.79);
    assert.equal(state.billingTotal, 3076.5);
    assert.equal(state.schemeValid, true);
});

test("negative advance amounts produce the same DIS2 as their absolute values", () => {
    for (const advances of [[-1000, 2000], [1000, -2000], [-1000, -2000]]) {
        const { controller, state } = setup(items, [
            { SchemeName: "S1", Discount1: "10%", Discount2: "6%", AdvAmount: advances[0] },
            { SchemeName: "S2", Discount1: "5%", Discount2: "8%", AdvAmount: advances[1] }
        ]);
        controller._rebuildBillingItems();
        assert.equal(state.schemeDetails.Discount2Amount, 220);
        assert.equal(state.billingItems[0].valueAfterDisB, 1674.29);
        assert.equal(state.billingItems[1].valueAfterDisB, 1255.71);
        assert.equal(state.billingTotal, 3076.5);
        assert.equal(controller._buildSchemeBillingPayload()._Items[0].TaxableAmount, 1674.29);
    }
});

test("fractional allocations preserve every cent and zero quantity receives no discount", () => {
    const { controller, state } = setup([
        { rate: 10, quantityinbaseunit: 1 },
        { rate: 10, quantityinbaseunit: 1 },
        { rate: 10, quantityinbaseunit: 1 },
        { rate: 10, quantityinbaseunit: 0 }
    ], [{ SchemeName: "S", Discount1: "0%", Discount2: "1%", AdvAmount: 1 }]);
    controller._rebuildBillingItems();
    assert.equal(controller._round2(state.billingItems.reduce((sum, item) => sum + item.discount2Amount, 0)), 0.01);
    assert.equal(state.billingItems[0].discount2Amount, 0);
    assert.equal(state.billingItems[1].discount2Amount, 0);
    assert.equal(state.billingItems[2].discount2Amount, 0.01, "rounding remainder belongs on the last contributing line");
    assert.equal(state.billingItems[3].discount2Amount, 0);
    assert.equal(state.billingItems[3].total, 0);
});

test("regular scheme calculations remain percentage based", () => {
    const { controller, state } = setup(items, [{ SchemeName: "S", AdvAmount: 0 }]);
    state.schemeDetails = { SchemeName: "Regular", SchemeType: "REGULAR", Discount1: "10%", Discount2: "0%" };
    controller._rebuildBillingItems();
    assert.equal(state.billingItems[0].valueAfterDisB, 1800);
    assert.equal(state.billingItems[1].valueAfterDisB, 1350);
    assert.equal(state.billingTotal, 3307.5);
});
