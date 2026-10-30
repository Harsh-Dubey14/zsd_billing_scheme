const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function loadController(environment = {}) {
    let controller;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../webapp/controller/View1.controller.js"), "utf8"), {
        ...environment,
        sap: { ui: { define(deps, factory) {
            controller = factory({ extend: (name, methods) => methods });
        } } }
    });
    return controller;
}

test("WSP prioritizes Discount 2 while NP consumes by posting date with the same calculations", () => {
    const controller = loadController();
    const schemes = [
        { SchemeName: "New high", PostingDate: "2026-03-01", Discount1: "10%", Discount2: "8%", AdvAmount: 1000 },
        { SchemeName: "Old low", PostingDate: "2026-01-01", Discount1: "5%", Discount2: "6%", AdvAmount: 1000 },
        { SchemeName: "Old high", PostingDate: "2026-02-01", Discount1: "7%", Discount2: "8%", AdvAmount: 1000 }
    ];
    const wsp = controller._combineAdvanceSchemes(schemes, "advance");
    const np = controller._combineAdvanceSchemes(schemes, "npAdvance");
    assert.equal(wsp.SelectedSchemes.map(row => row.SchemeName).join(","), "Old high,New high,Old low");
    assert.equal(np.SelectedSchemes.map(row => row.SchemeName).join(","), "Old low,Old high,New high");
    assert.equal(wsp.Discount1, "10%");
    assert.equal(np.Discount1, wsp.Discount1);
    assert.equal(np.AdvAmount, wsp.AdvAmount);
    const byDate = [schemes[1], schemes[2], schemes[0]];
    assert.deepEqual(controller._calculateAdvanceDiscount2(np.SelectedSchemes, 1500, 5),
        controller._calculateAdvanceDiscount2(byDate, 1500, 5));
    assert.equal(schemes[0].SchemeName, "New high");
});

test("scheme value help switches checkbox and radio selection on desktop and mobile", () => {
    for (const mobile of [false, true]) {
        const controller = loadController();
        let mode, multiselect;
        controller._oSchemeValueHelpTable = mobile ?
            { setMode: value => { mode = value; } } :
            { setSelectionMode: value => { mode = value; } };
        controller._configureValueHelpTable = () => {};
        const dialog = { setSupportMultiselect: value => { multiselect = value; } };
        for (const type of ["regular", "advance", "npAdvance", "regular"]) {
            controller._configureSchemeValueHelpTable(dialog, type);
            const multiple = type !== "regular";
            assert.equal(multiselect, multiple);
            assert.equal(mode, mobile ? (multiple ? "MultiSelect" : "SingleSelectLeft") :
                (multiple ? "MultiToggle" : "Single"));
        }
    }
});

test("changing deliveries clears every scheme type and its calculated billing", () => {
    for (const schemeType of ["regular", "advance", "npAdvance"]) {
        const controller = loadController();
        const state = { schemeType, schemeDetails: { SchemeName: "Old customer scheme" },
            hasSchemeDetails: true, schemeSelectedText: "Old", schemeSummaryText: "Old", items: [] };
        controller.getView = () => ({ getModel: () => ({
            getProperty: key => state[key.slice(1)],
            setProperty: (key, value) => { state[key.slice(1)] = value; }
        }) });
        controller._resetDeliveryScheme();
        assert.equal(state.schemeType, "regular");
        assert.equal(state.schemeDetails, null);
        assert.equal(state.hasSchemeDetails, false);
        assert.equal(state.schemeSelectedText, "");
        assert.equal(state.schemeSummaryText, "");
        assert.equal(state.billingTotal, 0);
        assert.equal(state.billingItems.length, 0);
        assert.equal(controller._iSchemeContext, 1);
    }
});

test("a scheme dialog from a previous delivery cannot apply its selection", () => {
    const controller = loadController();
    controller._iSchemeContext = 2;
    let closed = false;
    const dialog = { _iSchemeContext: 1, close() { closed = true; } };
    controller._applySelectedSchemes = () => assert.fail("stale scheme applied");
    controller.onSchemeValueHelpConfirm({ getSource: () => dialog });
    assert.equal(closed, true);
});

test("delivery selections restore from padded tokens in loaded OData V4 rows", () => {
    const controller = loadController();
    const selected = new Set([1]);
    let contexts = [
        { getProperty: () => "123", getIndex: () => 20 },
        { getProperty: () => "456", getIndex: () => 21 }
    ];
    const table = {
        bindRows() {},
        clearSelection: () => selected.clear(),
        getBinding: () => ({ getCurrentContexts: () => contexts }),
        addSelectionInterval: index => selected.add(index)
    };
    const dialog = { getKey: () => "DeliveryDocument" };
    controller._restoreValueHelpSelection(dialog, table, ["0000000123"]);
    assert.deepEqual([...selected], [20]);
    // A filtered/reloaded row must use its current binding index.
    contexts = [{ getProperty: () => "0000000123", getIndex: () => 0 }];
    controller._restoreValueHelpSelection(dialog, table, ["123"]);
    assert.deepEqual([...selected], [0]);
    controller._restoreValueHelpSelection(dialog, table, []);
    assert.equal(selected.size, 0);
});

test("scheme selections restore with filtered JSON rows and composite keys", () => {
    const controller = loadController();
    const key = controller._getSchemeValueHelpKey({ AccountingDocument: "100", SchemeName: "Advance", SchemeType: "ADVANCE" });
    const selected = [];
    const table = {
        bindRows() {}, clearSelection: () => { selected.length = 0; },
        getBinding: () => ({ getCurrentContexts: () => [
            { getProperty: () => "another-key" }, { getProperty: () => key }
        ] }),
        addSelectionInterval: index => selected.push(index)
    };
    controller._restoreValueHelpSelection({ getKey: () => "ValueHelpKey" }, table, [key]);
    assert.deepEqual(selected, [1]);
});

test("mobile value help restores checked rows and clears stale selections", () => {
    const controller = loadController();
    const items = ["123", "456"].map(key => ({
        selected: true, getBindingContext: () => ({ getProperty: () => key })
    }));
    const table = {
        getItems: () => items,
        setSelectedItem: (item, selected) => { item.selected = selected; }
    };
    controller._restoreValueHelpSelection({ getKey: () => "DeliveryDocument" }, table, ["0000000123"]);
    assert.deepEqual(items.map(item => item.selected), [true, false]);
    controller._restoreValueHelpSelection({ getKey: () => "DeliveryDocument" }, table, []);
    assert.deepEqual(items.map(item => item.selected), [false, false]);
});


test("WSP auto-selection stops at positive carry forward and leaves later schemes unchecked", () => {
    const controller = loadController();
    const items = [{ rate: 150, quantityinbaseunit: 1, gstRate: 0 }];
    controller.getView = () => ({ getModel: () => ({ getProperty: () => items }) });
    const schemes = [
        { SchemeName: "Third", PostingDate: "2026-03-01", Discount1: "0%", Discount2: "0%", AdvAmount: 100 },
        { SchemeName: "First", PostingDate: "2026-01-01", Discount1: "0%", Discount2: "0%", AdvAmount: 100 },
        { SchemeName: "Second", PostingDate: "2026-02-01", Discount1: "0%", Discount2: "0%", AdvAmount: 100 }
    ];
    const names = () => controller._getWspAutoSelectedSchemes(schemes).map(row => row.SchemeName).join(",");
    assert.equal(names(), "First,Second");
    items[0].rate = 50;
    assert.equal(names(), "First");
    // Exactly zero carry forward must include the next scheme.
    items[0].rate = 100;
    assert.equal(names(), "First,Second");
    items[0].rate = 400;
    assert.equal(names(), "First,Second,Third");
    assert.equal(schemes[0].SchemeName, "Third");
});

test("WSP auto-selection uses Discount 2 priority, selected Discount 1 and GST", () => {
    const controller = loadController();
    controller.getView = () => ({ getModel: () => ({ getProperty: () =>
        [{ rate: 200, quantityinbaseunit: 1, gstRate: 5 }] }) });
    const schemes = [
        { SchemeName: "Low", Discount1: "99%", Discount2: "0%", AdvAmount: 1000 },
        { SchemeName: "High", Discount1: "0%", Discount2: "10.8%", AdvAmount: 100 },
        { SchemeName: "Middle", Discount1: "10%", Discount2: "8.7%", AdvAmount: 100 }
    ];
    assert.equal(controller._getWspAutoSelectedSchemes(schemes).map(row => row.SchemeName).join(","), "High,Middle");
});


test("WSP lookup requests both types and keeps WSP records on subsequent pages", async () => {
    const urls = [];
    const row = { AccountingDocument: "123", AccountingDocumentItem: "1", Customer: "C1", Amount: 100 };
    const controller = loadController({
        URL,
        document: { baseURI: "https://example.test/app/" },
        fetch: async url => {
            urls.push(url);
            return { ok: true, json: async () => urls.length === 1 ? {
                value: [{ ...row, scheme_type: "ADVANCE" }],
                "@odata.nextLink": "Scheme?$skiptoken=next"
            } : { value: [
                { ...row, scheme_type: "WSP ADVANCE" },
                { ...row, scheme_type: "WSP ADVANCE" }
            ] } };
        }
    });
    controller.getOwnerComponent = () => ({ getManifestEntry: () => "/service/" });
    const schemes = await controller._readSchemes("C1", "advance");
    const filter = new URL(urls[0], "https://example.test").searchParams.get("$filter");
    assert.equal(filter, "Customer eq 'C1' and (scheme_type eq 'ADVANCE' or scheme_type eq 'WSP ADVANCE')");
    assert.equal(urls[1], "https://example.test/service/Scheme?$skiptoken=next");
    assert.equal(schemes.map(row => row.SchemeType).join(","), "ADVANCE,WSP ADVANCE");
});
