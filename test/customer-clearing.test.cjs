const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
function setup(state = {}, environment = {}) {
    let controller;
    const messages = [];
    const box = Object.fromEntries(['success', 'warning', 'error'].map(kind => [kind,
        (message, options) => messages.push({kind, message, options})]));
    vm.runInNewContext(fs.readFileSync('webapp/controller/View1.controller.js', 'utf8'), {
        ...environment,
        sap: {ui: {define(deps, factory) {
            controller = factory({extend: (name, methods) => methods}, null, null, null, null, null, null, null, box);
        }}}
    });
    controller.getView = () => ({getModel: () => ({getProperty: key => state[key],
        setProperty: (key, value) => {state[key] = value;}})});
    controller._getSelectedCustomerId = () => '50001532';
    return {controller, messages, state};
}
const payload = {BillingDocument: '0090000401', Customer: '50001532', InvoiceAmount: 35935,
    Advances: [{Document: '2200000145', Amount: 20000}]};
test('scheduled advances expose popup and persistent clearing action with posted values', () => {
    for (const type of ['advance', 'npAdvance', 'regular']) {
        const {controller, state, messages} = setup({'/schemeType': type, '/billingTotal': 35935,
            '/schemeDetails': {SelectedSchemes: [{AccountingDocument: '2200000145', AdvAmount: -20000}]}});
        controller._showSchemeBillingResult({ProcessStatus: 'JOB_SCHEDULED', PreliminaryBillingDocument: '0090000401'});
        assert.equal(Boolean(state['/clearingAvailable']), type !== 'regular');
        if (type !== 'regular') {
            assert.deepEqual(JSON.parse(JSON.stringify(state['/clearingPayload'])), payload);
            assert.ok(messages[0].options.actions.includes('Clear Customer Account'));
            let clicked = false;
            controller.onClearCustomerAccount = () => {clicked = true;};
            messages[0].options.onClose('Close');
            assert.equal(clicked, false);
            messages[0].options.onClose('Clear Customer Account');
            assert.equal(clicked, true);
        }
    }
});
test('clearing displays S, W and error responses with billing document; success prevents duplicate posts', async () => {
    for (const [status, kind] of [['S', 'success'], ['W', 'warning'], ['E', 'error']]) {
        const {controller, messages, state} = setup({'/clearingAvailable': true, '/clearingPayload': payload});
        let calls = 0;
        controller._postCustomerClearing = async body => {
            calls++;
            assert.equal(body, payload);
            return {Status: status, Message: 'Clearing response', BillingDocument: '0090000999'};
        };
        await controller.onClearCustomerAccount();
        assert.equal(messages[0].kind, kind);
        assert.match(messages[0].message, /Clearing response.*\n\nBilling Document: 0090000999/);
        assert.equal(state['/clearing'], false);
        if (status === 'S') {
            await controller.onClearCustomerAccount();
            assert.equal(calls, 1);
            assert.equal(state['/clearingComplete'], true);
        }
    }
});
test('missing PBD blocks clearing and network failures leave action available', async () => {
    const {controller, messages, state} = setup({'/clearingAvailable': true,
        '/clearingPayload': {...payload, BillingDocument: ''}});
    let calls = 0;
    controller._postCustomerClearing = async () => {calls++; throw Error('Unavailable');};
    await controller.onClearCustomerAccount();
    assert.equal(calls, 0);
    state['/clearingPayload'] = payload;
    await controller.onClearCustomerAccount();
    assert.match(messages.at(-1).message, /Unavailable/);
    assert.equal(state['/clearing'], false);
    assert.equal(state['/clearingAvailable'], true);
});
test('clearing posts the exact payload to custom HTTP endpoint with CSRF token', async () => {
    const calls = [];
    const {controller} = setup({}, {fetch: async (url, options) => {
        calls.push({url, options});
        return {ok: true, headers: {get: () => 'token'}, json: async () => ({Status: 'S'})};
    }});
    await controller._postCustomerClearing(payload);
    assert.equal(calls[1].url, '/sap/bc/http/sap/zhttp_schemeclearing');
    assert.equal(calls[1].options.method, 'POST');
    assert.equal(calls[1].options.headers['X-CSRF-Token'], 'token');
    assert.deepEqual(JSON.parse(calls[1].options.body), payload);
});


test('PROCESSING with JOB_SCHEDULED current step exposes both clearing actions', () => {
    for (const type of ['advance', 'npAdvance']) {
        const {controller, state, messages} = setup({'/schemeType': type, '/billingTotal': 35935,
            '/schemeDetails': {SelectedSchemes: [{AccountingDocument: '2200000145', AdvAmount: 20000}]}});
        controller._showSchemeBillingResult({ProcessStatus: 'PROCESSING', CurrentStep: 'JOB_SCHEDULED',
            PreliminaryBillingDocument: 'PBD0000068', CreatePBDStatus: 'SUCCESS',
            Discount1Status: 'SKIPPED', Discount2Status: 'SKIPPED'});
        assert.equal(state['/clearingAvailable'], true);
        assert.equal(state['/clearingPayload'].BillingDocument, 'PBD0000068');
        assert.ok(messages[0].options.actions.includes('Clear Customer Account'));
    }
});
