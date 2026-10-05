const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function loadController() {
    let controller;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../webapp/controller/View1.controller.js"), "utf8"), {
        sap: { ui: { define(deps, factory) {
            controller = factory({ extend: (name, methods) => methods });
        } } }
    });
    return controller;
}

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
