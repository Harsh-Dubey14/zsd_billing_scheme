const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function setup() {
    let controller;
    const errors = [];
    class Filter {
        constructor(field, operator, value) {
            Object.assign(this, typeof field === "object" ? field : { field, operator, value });
        }
    }
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../webapp/controller/View1.controller.js"), "utf8"), {
        sap: { ui: { define(deps, factory) {
            controller = factory({ extend: (name, methods) => methods }, null,
                { show() {}, hide() {} }, null, Filter, { EQ: "EQ", Contains: "Contains" },
                null, { show() {} }, { error: message => errors.push(message) });
        } } }
    });
    const state = { selectedCustomer: "60000031", selectedCustomerName: "Marks Work Mens Company", items: [] };
    const model = {
        getProperty: key => state[key.slice(1)],
        setProperty: (key, value) => { state[key.slice(1)] = value; }
    };
    controller.getView = () => ({ getModel: () => model });
    return { controller, state, model, errors };
}

test("customer number and name filters are independent and combine", () => {
    const { controller } = setup();
    const values = { customerFilterCustomer: "6000", customerFilterCustomerName: "Marks" };
    let filters;
    controller.byId = id => id === "customerValueHelpDialog" ? { update() {} } : { getValue: () => values[id] };
    controller._oCustomerValueHelpTable = { getBinding: () => ({ filter: value => { filters = value; } }) };
    controller.onCustomerValueHelpSearch();
    assert.equal(filters.map(row => `${row.field}:${row.operator}:${row.value}`).join("|"),
        "Customer:Contains:6000|CustomerName:Contains:Marks");
    values.customerFilterCustomer = "";
    controller.onCustomerValueHelpSearch();
    assert.equal(filters.length, 1);
    assert.equal(filters[0].field, "CustomerName");
});

test("clearing delivery search retains the selected customer restriction", () => {
    const { controller, state } = setup();
    const values = { deliveryFilterPlant: "1000" };
    let filters;
    controller.byId = id => id === "deliveryValueHelpDialog" ? { update() {} } : {
        getValue: () => values[id] || "", setValue: value => { values[id] = value; }
    };
    controller._oDeliveryValueHelpTable = { getBinding: () => ({ filter: value => { filters = value; } }) };
    controller.onDeliveryValueHelpSearch();
    assert.equal(filters.length, 2);
    controller.onDeliveryValueHelpClear();
    assert.equal(filters.length, 1);
    assert.equal(filters[0].and, false);
    assert.equal(filters[0].filters[0].field, "Customer");
    assert.equal(filters[0].filters[0].operator, "EQ");
    assert.equal(filters[0].filters[0].value, state.selectedCustomer);
    state.selectedCustomers = [{ Customer: "60000031" }, { Customer: "60000032" }];
    controller.onDeliveryValueHelpSearch();
    assert.equal(filters[0].filters.map(row => row.value).join(","), "60000031,60000032");
    state.selectedCustomers = [];
    state.selectedCustomer = "";
    controller.onDeliveryValueHelpSearch();
    assert.equal(filters.length, 0);
});

test("customer confirmation accepts one customer and rejects multiple selections", async () => {
    const { controller, state, model, errors } = setup();
    const rows = [{ Customer: "60000032", CustomerName: "Other" }];
    let destroyed = false, closed = false, cleared = 0;
    model.bindList = (endpoint, context, sorters, filters) => {
        assert.equal(endpoint, "/Get_Customer");
        assert.equal(filters[0].and, false);
        assert.equal(filters[0].filters.length, 1);
        return {
            requestContexts: async (start, count) => {
                assert.equal(count, 1);
                return rows.map(row => ({ getObject: () => row }));
            },
            destroy: () => { destroyed = true; }
        };
    };
    controller._clearAll = () => { cleared++; };
    await controller.onCustomerValueHelpConfirm({
        getSource: () => ({ setBusy() {}, close: () => { closed = true; } }),
        getParameter: () => rows.map(row => ({ getKey: () => row.Customer }))
    });
    assert.equal(errors.length, 0);
    assert.equal(closed && destroyed, true);
    assert.equal(state.selectedCustomers.length, 1);
    assert.equal(cleared, 1);
    await controller.onCustomerValueHelpConfirm({
        getSource: () => ({}),
        getParameter: () => ["60000031", "60000032"].map(key => ({ getKey: () => key }))
    });
    assert.match(errors[0], /one customer/);
    assert.equal(state.selectedCustomers.length, 1);
    assert.equal(state.selectedCustomers[0].Customer, "60000032");
    assert.equal(cleared, 1);
});

test("changing customer clears previous delivery and scheme state; reselecting does not", () => {
    const { controller, state } = setup();
    let cleared = 0;
    controller._clearAll = () => { cleared++; state.items = []; state.schemeDetails = null; };
    state.items = [{}];
    controller._setSelectedCustomer({ Customer: "60000031", CustomerName: "Updated name" });
    assert.equal(cleared, 0);
    controller._setSelectedCustomer({ Customer: "60000032", CustomerName: "Other customer" });
    assert.equal(cleared, 1);
    assert.equal(state.selectedCustomer, "60000032");
    assert.equal(state.selectedCustomerName, "Other customer");
    assert.equal(state.items.length, 0);
    controller.onClearCustomer();
    assert.equal(state.selectedCustomer, "");
    assert.equal(state.selectedCustomerName, "");
});

test("typed deliveries for another customer cannot populate billing", async () => {
    const { controller, state, errors } = setup();
    controller.byId = () => ({ getTokens: () => [{ getKey: () => "0084000010" }] });
    controller._readDeliveryItems = async () => [{ customerId: "OTHER", billingDocumentDate: "2026-11-03" }];
    await controller.onFetchItems();
    assert.equal(state.items.length, 0);
    assert.equal(state.billingItems.length, 0);
    assert.match(errors[0], /60000031/);
});

test("a delivery fetch finishing after customer changes cannot restore old items", async () => {
    const { controller, state } = setup();
    let finish;
    controller.byId = () => ({ getTokens: () => [{ getKey: () => "0084000010" }] });
    controller._readDeliveryItems = () => new Promise(resolve => { finish = resolve; });
    const pending = controller.onFetchItems();
    controller._resetDeliveryScheme();
    state.selectedCustomer = "NEW";
    finish([{ customerId: "60000031", billingDocumentDate: "2026-11-03" }]);
    await pending;
    assert.equal(state.items.length, 0);
});
