const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function setup(items, schemes) {
    let controller;
    const messages = [];
    const box = Object.fromEntries(["success", "error", "warning"].map(kind => [kind, (message) => messages.push({kind, message})]));
    const context = { sap: { ui: { define(deps, factory) {
        controller = factory({ extend: (name, methods) => methods }, null, null, null, null, null, null, null, box);
    } } } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../webapp/controller/View1.controller.js"), "utf8"), context);
    const state = { items, schemeDetails: controller._combineAdvanceSchemes(schemes) };
    controller.getView = () => ({ getModel: () => ({
        getProperty: key => state[key.slice(1)],
        setProperty: (key, value) => { state[key.slice(1)] = value; }
    }) });
    return { controller, state, messages, context };
}

const items = [
    { gstRate: 5, rate: 200, qty: 10, quantityinbaseunit: 10 },
    { gstRate: 5, rate: 300, qty: 5, quantityinbaseunit: 5 }
];

test("POST discount percentages serialize without floating-point tails", () => {
    const { controller } = setup([
        { deliveryNumber: "DEL123", rate: 100, quantityinbaseunit: 1, gstRate: 5 }
    ], [
        { SchemeName: "SEVEN", PostingDate: "2026-01-01", Discount1: "7%", Discount2: "7%", AdvAmount: 500 },
        { SchemeName: "FRACTION", PostingDate: "2026-02-01", Discount1: "6.25%", Discount2: "7.35%", AdvAmount: 500 }
    ]);
    controller._rebuildBillingItems();
    const payload = JSON.parse(JSON.stringify(controller._buildSchemeBillingPayload()));
    assert.equal(payload.Discount1Percent, 7);
    assert.equal(payload._Items[0].Discount1Percent, 7);
    assert.equal(payload._Schemes[0].Discount1Percent, 7);
    assert.equal(payload._Schemes[0].Discount2Percent, 7);
    assert.equal(payload._Schemes[1].Discount1Percent, 6.25);
    assert.equal(payload._Schemes[1].Discount2Percent, 7.35);
});

test("two deliveries follow posting-date FIFO and produce the corrected 167.50 discount", () => {
    const { controller, state } = setup([
        { deliveryNumber: "DEL123", rate: 500, quantityinbaseunit: 1, gstRate: 18 },
        { deliveryNumber: "DEL456", rate: 1000, quantityinbaseunit: 2, gstRate: 18 }
    ], [
        { SchemeName: "FEB0+7", PostingDate: "2026-02-05", Discount1: "10%", Discount2: "7%", AdvAmount: 500 },
        { SchemeName: "JAN10+8", PostingDate: "2026-01-05", Discount1: "10%", Discount2: "8%", AdvAmount: 1000 }
    ]);
    controller._rebuildBillingItems();
    assert.equal(state.schemeDetails.SelectedSchemes[0].SchemeName, "JAN10+8");
    assert.equal(state.schemeDetails.Discount2Amount, 167.5);
    assert.equal(state.billingItems[0].discount2Amount, 33.5);
    assert.equal(state.billingItems[1].discount2Amount, 134);
    const payload = controller._buildSchemeBillingPayload();
    assert.equal(payload._Deliveries.length, 2);
    assert.equal(payload._Schemes[0].CalculatedDiscount2Amount, 80);
    assert.equal(payload._Schemes[1].CalculatedDiscount2Amount, 87.5);
    assert.equal(payload.BillingTotal, 2082.5);
    assert.equal(payload.GSTAmount, 374.85);
    assert.equal(payload.GrandTotal, 2457.35);
});

test("partial consumption stops FIFO and later schemes receive no discount", () => {
    const { controller, state } = setup([{ rate: 300, quantityinbaseunit: 1 }], [
        { PostingDate: "2026-01-05", Discount1: "0%", Discount2: "7%", AdvAmount: 500 },
        { PostingDate: "2026-02-05", Discount1: "0%", Discount2: "8%", AdvAmount: 1000 }
    ]);
    controller._rebuildBillingItems();
    assert.equal(state.schemeDetails.Discount2Amount, 21);
    const payload = controller._buildSchemeBillingPayload();
    assert.equal(payload._Schemes[0].CalculatedDiscount2Amount, 21);
    assert.equal(payload._Schemes[1].CalculatedDiscount2Amount, 0);
    assert.equal(payload.BillingTotal, 279);
});

test("zero billing value and zero advance amounts do not create discounts", () => {
    const { controller } = setup([], [{ SchemeName: "S" }]);
    assert.equal(controller._calculateAdvanceDiscount2([{ AdvAmount: 100, Discount2: "7%" }], 0).Discount2Amount, 0);
    assert.equal(controller._calculateAdvanceDiscount2([{ AdvAmount: 0, Discount2: "7%" }], 300).Discount2Amount, 0);
});

test("the supplied delivery quantities and rates give 4050 after A and 293.50 Discount 2", () => {
    const { controller, state } = setup([
        { deliveryNumber: "DEL123", rate: 500, quantityinbaseunit: 1, gstRate: 18 },
        { deliveryNumber: "DEL456", rate: 2000, quantityinbaseunit: 2, gstRate: 18 }
    ], [
        { SchemeName: "FEB0+7", PostingDate: "2026-02-05", Discount1: "10%", Discount2: "7%", AdvAmount: 500 },
        { SchemeName: "JAN10+8", PostingDate: "2026-01-05", Discount1: "10%", Discount2: "8%", AdvAmount: 1000 }
    ]);
    controller._rebuildBillingItems();
    assert.equal(state.billingItems.reduce((sum, line) => sum + line.valueAfterDisA, 0), 4050);
    assert.equal(state.schemeDetails.Discount2Amount, 293.5);
    assert.equal(controller._buildSchemeBillingPayload().BillingTotal, 3756.5);
    // Recalculating after delivery changes must update both the pool and payload.
    state.items[1].rate = 1000;
    controller._rebuildBillingItems();
    assert.equal(state.schemeDetails.Discount2Amount, 167.5);
    assert.equal(controller._buildSchemeBillingPayload()._Schemes[1].CalculatedDiscount2Amount, 87.5);
});

test("three schemes consume FIFO and exact exhaustion skips later schemes", () => {
    const { controller } = setup([], [{}]);
    const schemes = [
        { AdvAmount: 1000, Discount2: "8%" },
        { AdvAmount: 500, Discount2: "7%" },
        { AdvAmount: 100, Discount2: "6%" }
    ];
    const full = controller._calculateAdvanceDiscount2(schemes, 2250);
    assert.equal(full.Discount2Amount, 160);
    assert.equal(full.SchemeCalculations[2].CalculatedDiscount2Amount, 45);
    const exhausted = controller._calculateAdvanceDiscount2(schemes, 1000);
    assert.equal(exhausted.Discount2Amount, 80);
    assert.equal(exhausted.SchemeCalculations[1].CalculatedDiscount2Amount, 0);
    assert.equal(exhausted.SchemeCalculations[2].CalculatedDiscount2Amount, 0);
});

test("highest Discount 1 applies to every line; final FIFO scheme uses the remaining value after A", () => {
    const { controller, state } = setup(items, [
        { SchemeName: "S1", Discount1: "5%", Discount2: "6%", AdvAmount: 1000 },
        { SchemeName: "S2", Discount1: "10%", Discount2: "8%", AdvAmount: 1000 }
    ]);
    controller._rebuildBillingItems();
    const [first, second] = state.billingItems;
    assert.equal(first.rateAfterDisA, 180);
    assert.equal(second.rateAfterDisA, 270);
    assert.equal(first.discount2Amount, 132.57);
    assert.equal(second.discount2Amount, 99.43);
    assert.equal(first.valueAfterDisB, 1667.43);
    assert.equal(second.valueAfterDisB, 1250.57);
    assert.equal(first.gstValue, 83.37);
    assert.equal(second.gstValue, 62.53);
    assert.equal(state.billingTotal, 3063.9);
    assert.equal(state.schemeValid, true, "billing may exceed combined advances");
    const payload = controller._buildSchemeBillingPayload();
    assert.equal(payload.GrandTotal, 3063.9);
    assert.equal(payload._Items[0].ValueAfterDiscount2, 1667.43);
    assert.equal(payload._Schemes.reduce((sum, scheme) => sum + scheme.AdvanceAmount, 0), 2000);
});

test("earlier FIFO schemes use advance amounts and the final scheme uses the remaining billing base", () => {
    const { controller, state } = setup(items, [
        { SchemeName: "S1", Discount1: "10%", Discount2: "6%", AdvAmount: 1000 },
        { SchemeName: "S2", Discount1: "10%", Discount2: "8%", AdvAmount: 2000 }
    ]);
    controller._rebuildBillingItems();
    assert.equal(state.schemeDetails.Discount2Amount, 232);
    assert.equal(state.billingItems[0].discount2Amount, 132.57);
    assert.equal(state.billingItems[1].discount2Amount, 99.43);
    assert.equal(state.billingItems[0].valueAfterDisB, 1667.43);
    assert.equal(state.billingItems[1].valueAfterDisB, 1250.57);
    assert.equal(state.billingItems[0].gstValue, 83.37);
    assert.equal(state.billingItems[1].gstValue, 62.53);
    assert.equal(state.billingTotal, 3063.9);
    assert.equal(state.schemeValid, true);
});

test("negative advance amounts produce the same DIS2 as their absolute values", () => {
    for (const advances of [[-1000, 2000], [1000, -2000], [-1000, -2000]]) {
        const { controller, state } = setup(items, [
            { SchemeName: "S1", Discount1: "10%", Discount2: "6%", AdvAmount: advances[0] },
            { SchemeName: "S2", Discount1: "5%", Discount2: "8%", AdvAmount: advances[1] }
        ]);
        controller._rebuildBillingItems();
        assert.equal(state.schemeDetails.Discount2Amount, 232);
        assert.equal(state.billingItems[0].valueAfterDisB, 1667.43);
        assert.equal(state.billingItems[1].valueAfterDisB, 1250.57);
        assert.equal(state.billingTotal, 3063.9);
        assert.equal(controller._buildSchemeBillingPayload()._Items[0].ValueAfterDiscount2, 1667.43);
    }
});

test("fractional allocations preserve every cent and zero quantity receives no discount", () => {
    const { controller, state } = setup([
        { rate: 10, quantityinbaseunit: 1 },
        { rate: 10, quantityinbaseunit: 1 },
        { rate: 10, quantityinbaseunit: 1 },
        { rate: 10, quantityinbaseunit: 0 }
    ], [{ SchemeName: "S", Discount1: "0%", Discount2: "0.0333333333%", AdvAmount: 100 }]);
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


test("BillingScheme payload uses FIFO discount amounts consistently with display calculations", () => {
    const { controller, state } = setup([{
        deliveryNumber: "0080000427", deliveryDocumentItem: "10",
        product: "WF799", productDescription: "TEST PRODUCT", color: "BLACK", size: "XL",
        brand: "TEST", hsnCode: "6201", qty: 1, unit: "BAG", bag: 48, pack: 48,
        quantityinbaseunit: 48, actualUom: "PC", rate: 666.666, gstRate: 5,
        billingDocumentType: "F2", billingDocumentDate: "2026-09-28",
        salesOrganization: "3000", destinationCountry: "IN", sdDocumentCategory: "J"
    }], [{ SchemeId: "S001", SchemeName: "TEST ADVANCE SCHEME", Discount1: "10%", Discount2: "6%", AdvAmount: -1000 }]);
    controller._rebuildBillingItems();
    const payload = controller._buildSchemeBillingPayload();
    assert.equal(payload.SchemeType, "ADVANCE");
    assert.equal(payload.Discount2Amount, 1728);
    assert.equal(payload.BillingTotal, 27072);
    assert.equal(payload.GSTAmount, 1353.6);
    assert.equal(payload.GrandTotal, 28425.6);
    assert.equal("SchemeId" in payload._Schemes[0], false);
    assert.equal(payload._Schemes[0].AdvanceAmount, 1000);
    assert.equal(payload._Deliveries[0].SalesOrganization, "3000");
    const item = payload._Items[0];
    assert.equal(item.DeliveryDocumentItem, "");
    assert.equal(item.ProductDescription, "");
    assert.equal(item.Bag, 1);
    assert.equal(item.Quantity, 48);
    assert.equal(item.QuantityUnit, "PC");
    assert.equal(item.Discount1Amount, 66.67);
    assert.equal(item.ValueAfterDiscount1, 28800);
    assert.equal(item.RateAfterDiscount2, 564);
    assert.equal(item.FinalRate, 592.2);
    assert.equal(item.FinalAmount, 28425.6);
    assert.equal("InvoiceTotal" in payload, false);
    assert.equal("TaxableAmount" in item, false);
});


test("response shows process and step messages and never assumes missing status is success", () => {
    const { controller, messages } = setup([], [{}]);
    controller._showSchemeBillingResult({ProcessStatus: "SUCCESS", CurrentStep: "COMPLETED", PreliminaryBillingDocument: "PBD0000008", CreatePBDStatus: "SUCCESS", CreatePBDMessage: "Created successfully"});
    assert.equal(messages.at(-1).kind, "success");
    assert.match(messages.at(-1).message, /PBD0000008/);
    assert.match(messages.at(-1).message, /Created successfully/);
    controller._showSchemeBillingResult({ProcessStatus: "ERROR", Discount2Status: "ERROR", Discount2Message: "Discount rejected"});
    assert.equal(messages.at(-1).kind, "error");
    assert.match(messages.at(-1).message, /Discount rejected/);
    controller._showSchemeBillingResult(null);
    assert.equal(messages.at(-1).kind, "warning");
});

test("posting uses the new entity endpoint with CSRF and the raw deep-insert body", async () => {
    const { controller, context } = setup([], [{}]);
    controller.getOwnerComponent = () => ({getManifestEntry: () => "/service/"});
    controller._fetchCsrfToken = async () => "token";
    context.fetch = async (url, options) => {
        assert.equal(url, "/service/BillingScheme");
        assert.equal(options.method, "POST");
        assert.equal(options.headers["X-CSRF-Token"], "token");
        assert.deepEqual(JSON.parse(options.body), {SchemeType: "ADVANCE"});
        return {ok: true, status: 201, json: async () => ({ProcessStatus: "SUCCESS"})};
    };
    assert.equal((await controller._postSchemeBilling({SchemeType: "ADVANCE"})).ProcessStatus, "SUCCESS");
});


test("GET GstRate drives per-item GST, including zero rates, and posting totals", () => {
    const { controller, state } = setup([], [{SchemeName: "S", Discount1: "0%", Discount2: "0%", AdvAmount: 0}]);
    state.items = controller._buildItemsFromDeliveryRows([5, "12.000000000", 0].map((rate, i) => ({
        DeliveryDocument: "80000426", DeliveryDocumentItem: String(i + 1),
        Rate: 100, Quantity: 1, BaseUnit: "PC", quantityinbaseunit: 1, actualuom: "PC", GstRate: rate
    })));
    controller._rebuildBillingItems();
    const payload = controller._buildSchemeBillingPayload();
    [5, 12, 0].forEach((rate, i) => {
        assert.equal(state.billingItems[i].gstPercent, rate + "%");
        assert.equal(state.billingItems[i].gstValue, rate);
        assert.equal(payload._Items[i].GSTPercent, rate);
        assert.equal(payload._Items[i].GSTAmount, rate);
    });
    assert.equal(payload.GSTAmount, 17);
    assert.equal(payload.GrandTotal, 317);
});


test("delivery validation reports every blocked document once and accepts valid deliveries", () => {
    const { controller } = setup([], [{}]);
    const rows = controller._buildItemsFromDeliveryRows([
        {DeliveryDocument: "426", PGIDate: "", InvoiceStatus: ""},
        {DeliveryDocument: "426", PGIDate: null},
        {DeliveryDocument: "427", PGIDate: "2026-09-28", InvoiceStatus: "CREATED"},
        {DeliveryDocument: "428", PGIDate: "  ", InvoiceStatus: "CREATED"}
    ]);
    assert.equal(controller._getDeliveryValidationError(rows), "PGI pending: 0000000426, 0000000428\n\nInvoice already created: 0000000427, 0000000428");
    assert.equal(controller._getDeliveryValidationError(controller._buildItemsFromDeliveryRows([
        {DeliveryDocument: "429", PGIDate: "2026-09-28", InvoiceStatus: ""}
    ])), "");
});
