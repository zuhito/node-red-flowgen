'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const specs = require('./specs');

const PLUGIN_HTML = fs.readFileSync(path.join(__dirname, '..', 'flowgen-plugin.html'), 'utf8');
let SPEC_V3, SPEC_V2;
const CONTENT = '#red-ui-clipboard-dialog-import-tabs-content';

const DIALOG = `
<div id="red-ui-clipboard-dialog">
    <form class="dialog-form form-horizontal">
        <div class="red-ui-clipboard-dialog-box">
            <div class="red-ui-clipboard-dialog-tabs">
                <ul id="red-ui-clipboard-dialog-import-tabs">
                    <li id="red-ui-tab-red-ui-clipboard-dialog-import-tab-clipboard" class="red-ui-tab active">
                        <a href="#" class="red-ui-tab-label">Clipboard</a></li>
                    <li id="red-ui-tab-red-ui-clipboard-dialog-import-tab-local" class="red-ui-tab">
                        <a href="#" class="red-ui-tab-label">Local</a></li>
                    <li id="red-ui-tab-red-ui-clipboard-dialog-import-tab-examples" class="red-ui-tab">
                        <a href="#" class="red-ui-tab-label">Examples</a></li>
                </ul>
            </div>
            <div id="red-ui-clipboard-dialog-import-tabs-content" class="red-ui-clipboard-dialog-tabs-content">
                <div id="red-ui-clipboard-dialog-import-tab-clipboard">
                    <textarea id="red-ui-clipboard-dialog-import-text"></textarea>
                </div>
                <div id="red-ui-clipboard-dialog-import-tab-local" style="display:none">local browser</div>
                <div id="red-ui-clipboard-dialog-import-tab-examples" style="display:none">examples browser</div>
            </div>
        </div>
        <div class="form-row">
            <span id="red-ui-clipboard-dialog-import-opt" class="button-group">
                <a id="red-ui-clipboard-dialog-import-opt-current" class="red-ui-button toggle selected" href="#"></a>
                <a id="red-ui-clipboard-dialog-import-opt-new" class="red-ui-button toggle" href="#"></a>
            </span>
        </div>
    </form>
    <div class="ui-dialog-buttonpane">
        <button id="red-ui-clipboard-dialog-ok" class="primary">Import</button>
    </div>
</div>`;

let dom, win, $, RED, imported, dialogClosed, okDefaultRuns, submits, pluginServed;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function boot() {
    dom = new JSDOM('<!doctype html><html><body>' + DIALOG + '</body></html>',
        { runScripts: 'outside-only', url: 'http://localhost:1880/' });
    win = dom.window;

    win.eval(fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'jquery', 'dist', 'jquery.js'), 'utf8'));
    $ = win.jQuery;

    imported = [];
    dialogClosed = 0;
    okDefaultRuns = 0;
    submits = 0;

    win.document.querySelector('form.dialog-form')
        .addEventListener('submit', () => { submits++; });

    $.fn.dialog = function (action) {
        if (action === 'close') { dialogClosed++; }
        return this;
    };
    $.fn.button = function (action) {
        return this.prop('disabled', action === 'disable');
    };

    $('#red-ui-clipboard-dialog-ok').on('click', function () { okDefaultRuns++; });

    $('#red-ui-clipboard-dialog-import-tabs').on('click', 'li', function () {
        if (!this.id) { return; }
        const id = this.id.replace(/^red-ui-tab-/, '');
        if (!$('#' + id).length) { return; }
        $(CONTENT).children().hide();
        $('#' + id).show();
        $('#red-ui-clipboard-dialog-import-tabs li').removeClass('active');
        $(this).addClass('active');
    });

    RED = {
        settings: { apiRootUrl: '' },
        plugins: { registerPlugin: (id, def) => def.onadd && def.onadd() },
        view: { importNodes: (nodes, opts) => imported.push({ nodes, opts }), focus: () => {} }
    };

    win.RED = RED;
    win.$ = win.jQuery = $;

    $.getScript = function () {
        const jsyaml = require('js-yaml');
        win.eval('var module = undefined;');
        win.jsyaml = jsyaml;
        win.self = win;
        win.eval(fs.readFileSync(path.join(__dirname, '..', 'flowgen.js'), 'utf8'));
        return Promise.resolve();
    };

    pluginServed = true;
    win.fetch = (url, options) => {
        if (options && options.method === 'HEAD') {
            return Promise.resolve({ ok: pluginServed, status: pluginServed ? 200 : 404 });
        }
        return Promise.reject(new Error('no stub for ' + url));
    };

    const script = PLUGIN_HTML.replace(/[\s\S]*?<script[^>]*>/, '').replace(/<\/script>[\s\S]*/, '');
    win.eval(script);

    $('#red-ui-clipboard-dialog').trigger('dialogopen');
    await wait(60);
}

const clickOk = () => win.document.getElementById('red-ui-clipboard-dialog-ok')
    .dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
const specTab = () => $('#red-ui-clipboard-dialog-import-tabs li').last();
const visible = () => $(CONTENT).children().filter((i, el) => $(el).css('display') !== 'none')
    .map((i, el) => el.id).get().join(',');

async function openSpecTab(spec) {
    specTab().trigger('click');
    await wait(20);
    $('#flowgen-spec-text').val(spec).trigger('keyup');
    await wait(400);
}

const shown = () => ['paste', 'select']
    .filter(name => $('#flowgen-' + name + '-view').hasClass('flowgen-on')).join(',');

const ONE_OP = JSON.stringify({
    openapi: '3.0.3', info: { title: 'One', version: '1' },
    servers: [{ url: 'https://one.test' }],
    paths: { '/only': { get: { responses: { 200: {} } } } }
});

beforeEach(async () => {
    if (!SPEC_V3) { SPEC_V3 = await specs.spec('v3'); SPEC_V2 = await specs.spec('v2'); }
    await boot();
});

test('the API Spec tab is appended after the built-in tabs', () => {
    const labels = $('#red-ui-clipboard-dialog-import-tabs li a').map((i, el) => $(el).text()).get();
    assert.strictEqual(labels.join(','), 'Clipboard,Local,Examples,API Spec');
});

test('the tab is only installed once, however often the dialog opens', async () => {
    for (let i = 0; i < 3; i++) { $('#red-ui-clipboard-dialog').trigger('dialogopen'); }
    await wait(80);
    assert.strictEqual($('#flowgen-tab-link').length, 1);
    assert.strictEqual($('#red-ui-clipboard-dialog-import-tab-apispec').length, 1);
});

test('selecting the tab shows only its own panel', async () => {
    specTab().trigger('click');
    await wait(20);
    assert.strictEqual(visible(), 'red-ui-clipboard-dialog-import-tab-apispec');
});

test('leaving for another tab leaves exactly one panel visible', async () => {
    for (const id of ['local', 'examples', 'clipboard']) {
        specTab().trigger('click');
        await wait(20);
        $('#red-ui-tab-red-ui-clipboard-dialog-import-tab-' + id).trigger('click');
        await wait(20);
        assert.strictEqual(visible(), 'red-ui-clipboard-dialog-import-tab-' + id,
            'after switching to ' + id);
    }
});

test('the built-in tabs still work while the plugin is loaded', async () => {
    $('#red-ui-tab-red-ui-clipboard-dialog-import-tab-local').trigger('click');
    await wait(10);
    assert.strictEqual(visible(), 'red-ui-clipboard-dialog-import-tab-local');
    $('#red-ui-tab-red-ui-clipboard-dialog-import-tab-clipboard').trigger('click');
    await wait(10);
    assert.strictEqual(visible(), 'red-ui-clipboard-dialog-import-tab-clipboard');
});

test('there is no separate import button in the panel', async () => {
    specTab().trigger('click');
    await wait(20);
    assert.strictEqual($('#flowgen-import-btn').length, 0);
    assert.strictEqual($('#red-ui-clipboard-dialog-import-tab-apispec button').length, 0);
});

test('pasting a spec lists its endpoints', async () => {
    await openSpecTab(SPEC_V3);
    $('#flowgen-select-btn').trigger('click');
    const rows = $('#flowgen-op-list .flowgen-op');
    assert.ok(rows.length > 0);

    const first = rows.first().text();
    assert.match(first, /PUT/);
    assert.match(first, /\/pet/);
});

test('a swagger 2 document is accepted too', async () => {
    await openSpecTab(SPEC_V2);
    assert.notStrictEqual($('#flowgen-select-btn').css('display'), 'none');
    $('#flowgen-select-btn').trigger('click');
    assert.ok($('#flowgen-op-list .flowgen-op').length > 1);
});

test('an invalid document reports an error and lists nothing', async () => {
    await openSpecTab('{"paths":{}}');
    assert.strictEqual($('#flowgen-op-list .flowgen-op').length, 0);
    assert.ok($('#flowgen-status').hasClass('flowgen-error'));
    assert.match($('#flowgen-status').text(), /unknown format/);
});

test('the Import button is disabled until an endpoint is picked', async () => {
    await openSpecTab(SPEC_V3);
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), true);
    $('#flowgen-select-btn').trigger('click');
    $('#flowgen-op-list .flowgen-op').first().trigger('click');
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), false);
});

test('only the paste view is shown to start with', async () => {
    specTab().trigger('click');
    await wait(20);
    assert.strictEqual(shown(), 'paste');
    assert.strictEqual($('#flowgen-select-btn').css('display'), 'none');
});

test('a document with several endpoints offers the select step', async () => {
    await openSpecTab(SPEC_V3);
    assert.strictEqual(shown(), 'paste', 'the list must not appear straight away');
    assert.notStrictEqual($('#flowgen-select-btn').css('display'), 'none');
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), true);

    $('#flowgen-select-btn').trigger('click');
    assert.strictEqual(shown(), 'select');
    assert.ok($('#flowgen-op-list .flowgen-op').length > 1);

    $('#flowgen-back-btn').trigger('click');
    assert.strictEqual(shown(), 'paste');
});

test('a document with one endpoint enables Import without a select step', async () => {
    await openSpecTab(ONE_OP);
    assert.strictEqual(shown(), 'paste');
    assert.strictEqual($('#flowgen-select-btn').css('display'), 'none');
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), false);


    clickOk();
    assert.strictEqual(imported.length, 1);
    assert.match(imported[0].nodes.find(n => n.type === 'function').func, /one\.test\/only/);
});

test('replacing the document clears the previous selection', async () => {
    await openSpecTab(ONE_OP);
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), false);
    $('#flowgen-spec-text').val('').trigger('keyup');
    await wait(400);
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), true);
    assert.strictEqual($('#flowgen-op-list .flowgen-op').length, 0);
});

test('a pasted url is fetched and replaces the text area', async () => {
    specTab().trigger('click');
    await wait(20);

    let requested = null;
    win.fetch = (url, options) => {
        if (options && options.method === 'HEAD') return Promise.resolve({ ok: true, status: 200 });
        requested = String(url);
        return Promise.resolve({ ok: true, status: 200,
            json: () => Promise.resolve({ text: SPEC_V2 }) });
    };

    $('#flowgen-spec-text').val('https://petstore.swagger.io/v2/swagger.json').trigger('keyup');
    await wait(400);

    assert.match(requested, /flowgen\/source\?url=/,
        'the fetch goes through the runtime, avoiding CORS');
    assert.strictEqual(decodeURIComponent(requested.split('url=')[1]),
        'https://petstore.swagger.io/v2/swagger.json');
    assert.strictEqual($('#flowgen-spec-text').val(), SPEC_V2);
    assert.notStrictEqual($('#flowgen-select-btn').css('display'), 'none');
});

test('a failed fetch reports an error', async () => {
    specTab().trigger('click');
    await wait(20);
    win.fetch = () => Promise.resolve({ ok: false, status: 502,
        json: () => Promise.resolve({ error: 'HTTP 404 from https://example.test/missing.json' }) });
    $('#flowgen-spec-text').val('https://example.test/missing.json').trigger('keyup');
    await wait(400);
    assert.ok($('#flowgen-status').hasClass('flowgen-error'));
    assert.match($('#flowgen-status').text(), /HTTP 404/);
});

test('the Import button imports the selected endpoint as a flow', async () => {
    await openSpecTab(SPEC_V3);
    $('#flowgen-select-btn').trigger('click');
    const row = $('#flowgen-op-list .flowgen-op')
        .filter((i, el) => $(el).text().indexOf('/pet/{petId}') !== -1).first();
    row.trigger('click');
    assert.strictEqual(row.hasClass('selected'), true);

    clickOk();

    assert.strictEqual(imported.length, 1);
    assert.strictEqual(okDefaultRuns, 0, 'the built-in import handler must not also run');
    assert.strictEqual(dialogClosed, 1);

    const nodes = imported[0].nodes;
    assert.strictEqual(nodes.map(n => n.type).join(','),
        'inject,function,http request,debug', 'no tab node, so no new flow is created');
    assert.ok(!nodes.some(n => 'z' in n), 'nodes must not be pinned to a workspace');
    const fn = nodes.find(n => n.type === 'function');
    assert.match(fn.func, /msg\.method = "GET";/);
    assert.match(fn.func, /pet\/\{petId\}/);
    assert.strictEqual(imported[0].opts.addFlow, false);
});

test('the new flow option is honoured', async () => {
    await openSpecTab(SPEC_V3);
    $('#red-ui-clipboard-dialog-import-opt-current').removeClass('selected');
    $('#red-ui-clipboard-dialog-import-opt-new').addClass('selected');
    $('#flowgen-select-btn').trigger('click');
    $('#flowgen-op-list .flowgen-op').first().trigger('click');
    clickOk();
    assert.strictEqual(imported[0].opts.addFlow, true);
});

test('the built-in import still runs when another tab is active', async () => {
    await openSpecTab(SPEC_V3);
    $('#flowgen-select-btn').trigger('click');
    $('#flowgen-op-list .flowgen-op').first().trigger('click');
    $('#red-ui-tab-red-ui-clipboard-dialog-import-tab-clipboard').trigger('click');
    await wait(20);

    clickOk();
    assert.strictEqual(imported.length, 0, 'the plugin must not hijack the other tabs');
    assert.strictEqual(okDefaultRuns, 1);
});

test('an uploaded file populates the text area and the list', async () => {
    specTab().trigger('click');
    await wait(20);

    class FakeReader {
        readAsText() { setTimeout(() => this.onload({ target: { result: SPEC_V3 } }), 0); }
    }
    win.FileReader = FakeReader;

    const input = win.document.getElementById('flowgen-file');
    Object.defineProperty(input, 'files', { value: [{ name: 'petstore.yaml' }], configurable: true });
    $(input).trigger('change');
    await wait(50);

    assert.strictEqual($('#flowgen-spec-text').val(), SPEC_V3);
    assert.ok($('#flowgen-op-list .flowgen-op').length > 0);
    assert.strictEqual(shown(), 'paste');
});

test('importing never submits the dialog form', async () => {
    await openSpecTab(SPEC_V3);
    $('#flowgen-select-btn').trigger('click');
    $('#flowgen-op-list .flowgen-op').first().trigger('click');
    clickOk();
    assert.strictEqual(imported.length, 1);
    assert.strictEqual(submits, 0, 'a submit would reload the editor');
});

test('pressing enter in the panel does not submit the form', async () => {
    await openSpecTab(SPEC_V3);
    const form = win.document.querySelector('form.dialog-form');
    let defaultPrevented = null;
    form.addEventListener('submit', ev => { defaultPrevented = ev.defaultPrevented; });
    form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    assert.strictEqual(defaultPrevented, true, 'the form submit must be cancelled');
});

test('the imported nodes carry the generated code and stay wired', async () => {
    await openSpecTab(SPEC_V3);
    $('#flowgen-select-btn').trigger('click');
    $('#flowgen-op-list .flowgen-op')
        .filter((i, el) => $(el).text().indexOf('/store/inventory') !== -1).first().trigger('click');
    clickOk();

    const nodes = imported[0].nodes;
    const ids = nodes.map(n => n.id);
    for (const node of nodes) {
        for (const wire of [].concat.apply([], node.wires || [])) {
            assert.ok(ids.indexOf(wire) !== -1, 'dangling wire ' + wire);
        }
    }
    assert.match(nodes.find(n => n.type === 'function').func, /store\/inventory/);
});

test('the placeholder shows a multi line example and the url on its own line', async () => {
    specTab().trigger('click');
    await wait(20);
    const placeholder = $('#flowgen-spec-text').attr('placeholder');
    assert.ok(placeholder.split('\n').length > 5, 'the example must span several lines');
    assert.match(placeholder, /^openapi: /);
    assert.match(placeholder, /paths:/);
    assert.match(placeholder, /\nor\nhttps:\/\/petstore\.swagger\.io\/v2\/swagger\.json$/);
});

test('the prompt asks for an API Specification', async () => {
    specTab().trigger('click');
    await wait(20);
    assert.match($('#flowgen-prompt').text(), /^Paste an API Specification or its URL, or/);
});

test('no operation count is reported once a document parses', async () => {
    await openSpecTab(SPEC_V2);
    assert.strictEqual($('#flowgen-status').text(), '');
    await openSpecTab(SPEC_V3);
    assert.strictEqual($('#flowgen-status').text(), '');
});

test('the action buttons sit at the top right of each view', async () => {
    await openSpecTab(SPEC_V3);

    const selectRow = $('#flowgen-select-btn').parent();
    assert.ok(selectRow.hasClass('flowgen-bar'));
    assert.strictEqual(selectRow.parent().attr('id'), 'flowgen-paste-view');
    assert.strictEqual(selectRow.prev().length, 0, 'the bar is first in the paste view');
    assert.strictEqual($('#flowgen-select-btn').prev().attr('class'), 'flowgen-spacer');
    assert.strictEqual($('#flowgen-file-btn').parent().attr('id'), 'flowgen-prompt',
        'Select endpoint shares the bar with the file button');

    $('#flowgen-select-btn').trigger('click');
    const backRow = $('#flowgen-back-btn').parent();
    assert.ok(backRow.hasClass('flowgen-bar'));
    assert.strictEqual(backRow.parent().attr('id'), 'flowgen-select-view');
    assert.strictEqual(backRow.prev().length, 0, 'the bar is first in the select view');
    assert.strictEqual($('#flowgen-back-btn').prev().attr('class'), 'flowgen-spacer');
});

test('the endpoint list scrolls instead of overflowing the dialog', async () => {
    await openSpecTab(SPEC_V3);
    $('#flowgen-select-btn').trigger('click');

    const styles = PLUGIN_HTML.replace(/[\s\S]*?<style>/, '').replace(/<\/style>[\s\S]*/, '');
    const rule = name => {
        const match = styles.match(new RegExp('#' + name + '\\s*\\{([^}]*)\\}'));
        return match ? match[1] : '';
    };
    assert.match(rule('flowgen-op-list'), /overflow-y:\s*auto/);
    assert.match(styles, /\.flowgen-grow\s*\{[^}]*min-height:\s*0/);
    assert.match(styles, /\.flowgen-grow\s*\{[^}]*overflow:\s*hidden/);
    assert.match(rule('red-ui-clipboard-dialog-import-tab-apispec'), /max-height:\s*100%/);
    assert.match(rule('red-ui-clipboard-dialog-import-tab-apispec'), /overflow:\s*hidden/);
});

test('the text area is the growing element of the paste view', async () => {
    specTab().trigger('click');
    await wait(20);
    const grow = $('#flowgen-spec-text').parent();
    assert.ok(grow.hasClass('flowgen-grow'));
    assert.strictEqual(grow.next().length, 0, 'nothing sits below the text area');
    assert.strictEqual(grow.prev().attr('id'), 'flowgen-prompt');

    const styles = PLUGIN_HTML.replace(/[\s\S]*?<style>/, '').replace(/<\/style>[\s\S]*/, '');
    assert.match(styles, /#flowgen-spec-text\s*\{[^}]*height:\s*100%/);
    assert.match(styles, /\.flowgen-grow\s*\{[^}]*flex:\s*1 1 auto/);
});

test('Select endpoint is solid red and Back keeps the default grey inline', async () => {
    await openSpecTab(SPEC_V3);
    const styles = PLUGIN_HTML.replace(/[\s\S]*?<style>/, '').replace(/<\/style>[\s\S]*/, '');
    const rule = styles.match(/a#flowgen-select-btn\.red-ui-button\s*\{([^}]*)\}/)[1];
    assert.match(rule, /background:\s*#ad1625\s*!important/);
    assert.match(rule, /color:\s*#fff\s*!important/);
    assert.ok(!/#flowgen-back-btn/.test(rule), 'Back is not part of the red rule');

    $('#flowgen-select-btn').trigger('click');
    const back = win.document.getElementById('flowgen-back-btn');
    assert.strictEqual(back.style.background, 'rgb(255, 255, 255)');
    assert.strictEqual(back.style.color, 'rgb(136, 136, 136)');
    assert.match(back.style.border, /1px solid/);
});

test('double-clicking an endpoint row imports it immediately', async () => {
    await openSpecTab(SPEC_V3);
    $('#flowgen-select-btn').trigger('click');
    const row = $('#flowgen-op-list .flowgen-op')
        .filter((i, el) => $(el).text().indexOf('/pet/{petId}') !== -1).first();

    row.trigger('click');
    assert.strictEqual(imported.length, 0, 'a single click only selects');

    row.trigger('dblclick');
    assert.strictEqual(imported.length, 1, 'the double click imports');
    assert.strictEqual(dialogClosed, 1);
    assert.strictEqual(imported[0].nodes.map(n => n.type).join(','),
        'inject,function,http request,debug');
    assert.match(imported[0].nodes.find(n => n.type === 'function').func, /pet\/\{petId\}/);
});

test('Select endpoint shows a forward chevron', async () => {
    await openSpecTab(SPEC_V3);
    assert.strictEqual($('#flowgen-select-btn i.fa-chevron-right').length, 1);
    assert.match($('#flowgen-select-btn').text(), /Select endpoint/);
    $('#flowgen-select-btn').trigger('click');
    assert.strictEqual($('#flowgen-back-btn i.fa-chevron-left').length, 1);
});

test('the endpoint rows carry Swagger UI method colours and typography', async () => {
    await openSpecTab(SPEC_V3);
    $('#flowgen-select-btn').trigger('click');

    const rows = $('#flowgen-op-list .flowgen-op');
    assert.ok(rows.filter('.flowgen-get').length > 0);
    assert.ok(rows.filter('.flowgen-post').length > 0);
    assert.ok(rows.filter('.flowgen-delete').length > 0);
    const first = rows.first();
    assert.strictEqual(first.find('.flowgen-method').length, 1);
    assert.strictEqual(first.find('.flowgen-path').length, 1);

    const styles = PLUGIN_HTML.replace(/[\s\S]*?<style>/, '').replace(/<\/style>[\s\S]*/, '');
    assert.match(styles, /\.flowgen-get\s+\.flowgen-method\s*\{\s*background:\s*#1d72c9/);
    assert.match(styles, /\.flowgen-post\s+\.flowgen-method\s*\{\s*background:\s*#32b378/);
    assert.match(styles, /\.flowgen-put\s+\.flowgen-method\s*\{\s*background:\s*#c97c1d/);
    assert.match(styles, /\.flowgen-delete\s+\.flowgen-method\s*\{\s*background:\s*#c91d1d/);
    assert.match(styles, /\.flowgen-method\s*\{[^}]*font-weight:\s*700/);
    assert.match(styles, /\.flowgen-path\s*\{[^}]*font-size:\s*16px/);
    assert.match(styles, /\.flowgen-path\s*\{[^}]*font-weight:\s*600/);
    assert.match(styles, /\.flowgen-path\s*\{[^}]*color:\s*var\(--red-ui-primary-text-color/);
});

test('every non deprecated operation is listed and deprecated ones are not', async () => {
    await openSpecTab(SPEC_V2);
    $('#flowgen-select-btn').trigger('click');
    const texts = $('#flowgen-op-list .flowgen-op').map((i, el) => $(el).text()).get();
    assert.strictEqual(texts.length, 19, 'petstore v2 has 20 operations, one deprecated');
    assert.ok(!texts.some(t => t.indexOf('/pet/findByTags') !== -1));

    const doc = require('../flowgen').parseDocument(SPEC_V2);
    const expected = require('../flowgen').listOperations(doc).operations
        .map(o => o.method.toUpperCase() + o.path);
    texts.forEach((text, i) => {
        assert.ok(text.startsWith(expected[i]), 'row ' + i + ' should be ' + expected[i]);
    });
});

test('arrow keys move the selection and stop at the ends', async () => {
    await openSpecTab(SPEC_V3);
    $('#flowgen-select-btn').trigger('click');
    const rows = $('#flowgen-op-list .flowgen-op');
    const key = code => $('#flowgen-op-list').trigger($.Event('keydown', { keyCode: code }));

    key(40);
    assert.ok(rows.eq(0).hasClass('selected'), 'down selects the first row');
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), false);

    key(40);
    assert.ok(rows.eq(1).hasClass('selected'));
    key(38);
    assert.ok(rows.eq(0).hasClass('selected'));
    key(38);
    assert.ok(rows.eq(0).hasClass('selected'), 'up at the top stays put');

    for (let i = 0; i < rows.length + 5; i++) key(40);
    assert.ok(rows.eq(rows.length - 1).hasClass('selected'), 'down at the bottom stays put');
});

test('a file load pretty prints JSON just like a url fetch', async () => {
    specTab().trigger('click');
    await wait(20);

    const compact = '{"openapi":"3.0.0","info":{"title":"T","version":"1"},'
        + '"servers":[{"url":"https://t.test"}],"paths":{"/a":{"get":{}}}}';
    class FakeReader {
        readAsText() { setTimeout(() => this.onload({ target: { result: compact } }), 0); }
    }
    win.FileReader = FakeReader;
    const input = win.document.getElementById('flowgen-file');
    Object.defineProperty(input, 'files', { value: [{ name: 's.json' }], configurable: true });
    $(input).trigger('change');
    await wait(300);

    assert.strictEqual($('#flowgen-spec-text').val(), JSON.stringify(JSON.parse(compact), null, 2));
});

test('the list container is focusable and sized to scroll', async () => {
    await openSpecTab(SPEC_V3);
    $('#flowgen-select-btn').trigger('click');
    assert.strictEqual($('#flowgen-op-list').attr('tabindex'), '0');

    const styles = PLUGIN_HTML.replace(/[\s\S]*?<style>/, '').replace(/<\/style>[\s\S]*/, '');
    const rule = styles.match(/#flowgen-op-list\s*\{([^}]*)\}/)[1];
    assert.match(rule, /height:\s*100%/);
    assert.match(rule, /overflow-y:\s*auto/);
});

test('the panel and its views are laid out to fill the height', async () => {
    specTab().trigger('click');
    await wait(20);
    assert.ok($('#' + 'red-ui-clipboard-dialog-import-tab-apispec').hasClass('flowgen-shown'));
    assert.strictEqual($('#flowgen-spec-text').parent().hasClass('flowgen-grow'), true);
    assert.strictEqual($('#flowgen-op-list').parent().hasClass('flowgen-grow'), true);
});

test('a fetched JSON document is re-indented', async () => {
    specTab().trigger('click');
    await wait(20);

    const compact = '{"openapi":"3.0.0","info":{"title":"T","version":"1"},'
        + '"servers":[{"url":"https://t.test"}],"paths":{"/a":{"get":{}}}}';
    win.fetch = () => Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve({ text: compact }) });

    $('#flowgen-spec-text').val('https://example.test/spec.json').trigger('keyup');
    await wait(400);

    const shownText = $('#flowgen-spec-text').val();
    assert.ok(shownText.split('\n').length > 5, 'the JSON must be pretty printed');
    assert.strictEqual(shownText, JSON.stringify(JSON.parse(compact), null, 2));
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), false);
});

test('a fetched YAML document is left untouched', async () => {
    specTab().trigger('click');
    await wait(20);
    win.fetch = () => Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve({ text: SPEC_V3 }) });
    $('#flowgen-spec-text').val('https://example.test/spec.yaml').trigger('keyup');
    await wait(400);
    assert.strictEqual($('#flowgen-spec-text').val(), SPEC_V3);
});

test('showing the tab keeps the flex layout instead of forcing block', async () => {
    specTab().trigger('click');
    await wait(20);
    const panel = win.document.getElementById('red-ui-clipboard-dialog-import-tab-apispec');
    assert.notStrictEqual(panel.style.display, 'block',
        'jQuery show() must not override the flex layout with display:block');
    assert.strictEqual(panel.style.display, 'flex');
    assert.ok($(panel).hasClass('flowgen-shown'));

    const styles = PLUGIN_HTML.replace(/[\s\S]*?<style>/, '').replace(/<\/style>[\s\S]*/, '');
    assert.match(styles, /\.flowgen-shown\s*\{[^}]*display:\s*flex\s*!important/,
        'the class rule must win even if an inline display leaks in');
});

test('the flex layout survives leaving and returning to the tab', async () => {
    specTab().trigger('click');
    await wait(20);
    $('#red-ui-tab-red-ui-clipboard-dialog-import-tab-local').trigger('click');
    await wait(20);
    specTab().trigger('click');
    await wait(20);
    const panel = win.document.getElementById('red-ui-clipboard-dialog-import-tab-apispec');
    assert.strictEqual(panel.style.display, 'flex');
});

test('the Back button is present and visible above the endpoint list', async () => {
    await openSpecTab(SPEC_V3);
    $('#flowgen-select-btn').trigger('click');
    await wait(20);

    const back = $('#flowgen-back-btn');
    assert.strictEqual(back.length, 1, 'the Back button must exist');
    assert.notStrictEqual(back.css('display'), 'none');
    assert.match(back.text(), /Back/);
    assert.strictEqual(back.find('i.fa-chevron-left').length, 1);

    const bar = back.parent();
    assert.ok(bar.hasClass('flowgen-bar'));
    assert.strictEqual(bar.parent().attr('id'), 'flowgen-select-view');
    assert.strictEqual(bar.index(), 0, 'the bar sits above the list');
    assert.strictEqual(bar.next().find('#flowgen-op-list').length, 1);

    back.trigger('click');
    assert.strictEqual(shown(), 'paste', 'Back returns to the paste view');
});

test('the panel and text area use the Clipboard tab paddings', async () => {
    specTab().trigger('click');
    await wait(20);
    const styles = PLUGIN_HTML.replace(/[\s\S]*?<style>/, '').replace(/<\/style>[\s\S]*/, '');
    const panelRule = styles.match(
        /#red-ui-clipboard-dialog-import-tab-apispec\s*\{([^}]*)\}/)[1];
    assert.match(panelRule, /padding:\s*10px/,
        'the Clipboard tab uses padding:10px on its panel');
    const textRule = styles.match(/#flowgen-spec-text\s*\{([^}]*)\}/)[1];
    assert.match(textRule, /padding:\s*6px 10px/,
        'the Clipboard textarea uses padding:6px 10px');
    assert.match(textRule, /height:\s*100%/);
    assert.match(textRule, /line-height:\s*1\.3em/);
    assert.match(textRule, /font-size:\s*13px/);
    assert.match(textRule, /box-sizing:\s*border-box/);
});

test('pasting and importing work with no network access at all', async () => {
    specTab().trigger('click');
    await wait(20);
    delete win.fetch;
    win.fetch = undefined;

    $('#flowgen-spec-text').val(SPEC_V3).trigger('keyup');
    await wait(400);
    $('#flowgen-select-btn').trigger('click');
    assert.ok($('#flowgen-op-list .flowgen-op').length > 1,
        'parsing a pasted document must not touch the network');

    $('#flowgen-op-list .flowgen-op').first().trigger('click');
    clickOk();
    assert.strictEqual(imported.length, 1, 'import must work offline');
});

test('pasting a url while offline reports an error instead of crashing', async () => {
    specTab().trigger('click');
    await wait(20);
    win.fetch = () => Promise.reject(new Error('network is unreachable'));

    $('#flowgen-spec-text').val('https://example.test/spec.json').trigger('keyup');
    await wait(400);
    assert.ok($('#flowgen-status').hasClass('flowgen-error'));
    assert.match($('#flowgen-status').text(), /network is unreachable/);

    $('#flowgen-spec-text').val(SPEC_V2).trigger('keyup');
    await wait(400);
    assert.notStrictEqual($('#flowgen-select-btn').css('display'), 'none',
        'the panel recovers once a document is pasted');
});

test('the plugin markup references no external resources', () => {
    assert.ok(!/\bsrc\s*=\s*["']https?:/.test(PLUGIN_HTML), 'no external scripts');
    assert.ok(!/\bhref\s*=\s*["']https?:/.test(PLUGIN_HTML), 'no external stylesheets');
    assert.ok(!/@import/.test(PLUGIN_HTML), 'no CSS imports');
    assert.ok(!/url\(\s*["']?https?:/.test(PLUGIN_HTML), 'no external CSS assets');
    assert.ok(!/\$\.getScript\(\s*["']https?:/.test(PLUGIN_HTML),
        'scripts are only loaded from the local admin server');
});

test('a pasted git url is fetched via the runtime and the text area is untouched', async () => {
    specTab().trigger('click');
    await wait(20);

    const files = [{ path: 'get-user.yml',
        text: 'info:\n  name: Get user\nhttp:\n  method: GET\n  url: https://api.example.test/users/1\n' }];
    let requested = null;
    win.fetch = url => {
        requested = String(url);
        return Promise.resolve({ ok: true, status: 200,
            json: () => Promise.resolve({ files }) });
    };

    const gitUrl = 'https://github.com/bruno-collections/bruno-starter-guide.git';
    $('#flowgen-spec-text').val(gitUrl).trigger('keyup');
    await wait(400);

    assert.match(requested, /flowgen\/source\?url=/);
    assert.match(decodeURIComponent(requested), /bruno-starter-guide\.git/);
    assert.strictEqual($('#flowgen-spec-text').val(), gitUrl,
        'the text area keeps the pasted url');
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), false,
        'a single request enables Import straight away');

    clickOk();
    assert.strictEqual(imported.length, 1);
    assert.match(imported[0].nodes.find(n => n.type === 'function').func,
        /api\.example\.test\/users\/1/);
});

test('a failing git fetch reports the server error', async () => {
    specTab().trigger('click');
    await wait(20);
    win.fetch = () => Promise.resolve({ ok: false, status: 502,
        json: () => Promise.resolve({ error: 'git clone failed: not found' }) });
    $('#flowgen-spec-text').val('https://example.test/nope.git').trigger('keyup');
    await wait(400);
    assert.ok($('#flowgen-status').hasClass('flowgen-error'));
    assert.match($('#flowgen-status').text(), /git clone failed/);
});

test('a zip upload goes to the runtime, clears the text area and lists endpoints', async () => {
    await openSpecTab(SPEC_V3);
    assert.notStrictEqual($('#flowgen-spec-text').val(), '');

    const files = [
        { path: 'a.yml', text: 'info:\n  name: A\nhttp:\n  method: GET\n  url: https://t.test/a\n' },
        { path: 'b.yml', text: 'info:\n  name: B\nhttp:\n  method: POST\n  url: https://t.test/b\n' }
    ];
    let posted = null;
    win.fetch = (url, opts) => {
        posted = { url: String(url), method: opts && opts.method, body: opts && opts.body };
        return Promise.resolve({ ok: true, status: 200,
            json: () => Promise.resolve({ files }) });
    };
    class FakeReader {
        readAsArrayBuffer() { setTimeout(() => this.onload({ target: { result: new win.ArrayBuffer(8) } }), 0); }
    }
    win.FileReader = FakeReader;

    const input = win.document.getElementById('flowgen-file');
    Object.defineProperty(input, 'files',
        { value: [{ name: 'collection.zip' }], configurable: true });
    $(input).trigger('change');
    await wait(100);

    assert.match(posted.url, /flowgen\/source$/);
    assert.strictEqual(posted.method, 'POST');
    assert.strictEqual($('#flowgen-spec-text').val(), '', 'the text area is cleared');
    assert.notStrictEqual($('#flowgen-select-btn').css('display'), 'none',
        'two requests offer the select step');

    $('#flowgen-select-btn').trigger('click');
    assert.strictEqual($('#flowgen-op-list .flowgen-op').length, 2);
    $('#flowgen-op-list .flowgen-op').last().trigger('dblclick');
    assert.strictEqual(imported.length, 1);
    assert.match(imported[0].nodes.find(n => n.type === 'function').func, /t\.test\/b/);
});

test('the collection survives the empty text area when revisiting the tab', async () => {
    specTab().trigger('click');
    await wait(20);
    win.fetch = () => Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve({ files: [{ path: 'a.yml',
            text: 'info:\n  name: A\nhttp:\n  method: GET\n  url: https://t.test/a\n' }] }) });
    class FakeReader {
        readAsArrayBuffer() { setTimeout(() => this.onload({ target: { result: new win.ArrayBuffer(8) } }), 0); }
    }
    win.FileReader = FakeReader;
    const input = win.document.getElementById('flowgen-file');
    Object.defineProperty(input, 'files',
        { value: [{ name: 'c.zip' }], configurable: true });
    $(input).trigger('change');
    await wait(100);
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), false);

    $('#red-ui-tab-red-ui-clipboard-dialog-import-tab-local').trigger('click');
    await wait(20);
    specTab().trigger('click');
    await wait(400);
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), false,
        'the uploaded collection is still selectable');
});

test('closing the dialog clears the panel completely', async () => {
    await openSpecTab(SPEC_V3);
    $('#flowgen-select-btn').trigger('click');
    $('#flowgen-op-list .flowgen-op').first().trigger('click');
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), false);

    $('#red-ui-clipboard-dialog').trigger('dialogclose');

    assert.strictEqual($('#flowgen-spec-text').val(), '');
    assert.strictEqual($('#flowgen-op-list .flowgen-op').length, 0);
    assert.strictEqual($('#flowgen-select-btn').css('display'), 'none');
    assert.strictEqual($('#flowgen-status').text(), '');
    assert.strictEqual(shown(), 'paste');
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), true);
});

test('reopening after a close cannot import the previous selection', async () => {
    await openSpecTab(SPEC_V3);
    $('#flowgen-select-btn').trigger('click');
    $('#flowgen-op-list .flowgen-op').first().trigger('click');
    $('#red-ui-clipboard-dialog').trigger('dialogclose');

    $('#red-ui-clipboard-dialog').trigger('dialogopen');
    await wait(60);
    specTab().trigger('click');
    await wait(30);

    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), true);
    assert.strictEqual($('#flowgen-select-btn').css('display'), 'none');
    clickOk();
    assert.strictEqual(imported.length, 0, 'nothing can be imported after a reset');
});

test('an uploaded collection is dropped when the dialog closes', async () => {
    specTab().trigger('click');
    await wait(20);
    win.fetch = () => Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve({ files: [{ path: 'a.yml',
            text: 'info:\n  name: A\nhttp:\n  method: GET\n  url: https://t.test/a\n' }] }) });
    class FakeReader {
        readAsArrayBuffer() { setTimeout(() => this.onload({ target: { result: new win.ArrayBuffer(8) } }), 0); }
    }
    win.FileReader = FakeReader;
    const input = win.document.getElementById('flowgen-file');
    Object.defineProperty(input, 'files', { value: [{ name: 'c.zip' }], configurable: true });
    $(input).trigger('change');
    await wait(120);
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), false);

    $('#red-ui-clipboard-dialog').trigger('dialogclose');
    specTab().trigger('click');
    await wait(400);
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), true,
        'the uploaded collection must not survive a close');
});

const rowsShown = () => $('#flowgen-op-list .flowgen-op')
    .filter((i, el) => !$(el).hasClass('flowgen-hidden')).length;

async function openList() {
    await openSpecTab(SPEC_V3);
    $('#flowgen-select-btn').trigger('click');
    await wait(50);
}

test('the select view offers a search box that filters the list', async () => {
    await openList();
    const total = $('#flowgen-op-list .flowgen-op').length;
    assert.ok(total > 3);
    assert.strictEqual($('#flowgen-search').length, 1);
    assert.strictEqual(rowsShown(), total, 'everything is shown before typing');

    $('#flowgen-search').val('inventory').trigger('input');
    assert.ok(rowsShown() < total);
    assert.strictEqual($('#flowgen-op-list .flowgen-op').filter((i, el) =>
        !$(el).hasClass('flowgen-hidden') && $(el).text().indexOf('/store/inventory') !== -1).length, 1);
});

test('the search matches the method, the path and the summary', async () => {
    await openList();
    for (const term of ['delete', '/store/order', 'Find pet by ID']) {
        $('#flowgen-search').val(term).trigger('input');
        assert.ok(rowsShown() > 0, 'no match for ' + term);
    }
    $('#flowgen-search').val('definitely-not-there').trigger('input');
    assert.strictEqual(rowsShown(), 0);
});

test('several search words all have to match', async () => {
    await openList();
    $('#flowgen-search').val('get pet').trigger('input');
    const shown = $('#flowgen-op-list .flowgen-op').filter((i, el) => !$(el).hasClass('flowgen-hidden'));
    assert.ok(shown.length > 0);
    shown.each((i, el) => {
        const text = $(el).text().toLowerCase();
        assert.ok(text.indexOf('get') !== -1 && text.indexOf('pet') !== -1, $(el).text());
    });
});

test('a search narrowing to one endpoint selects it automatically', async () => {
    await openList();
    $('#flowgen-search').val('/store/inventory').trigger('input');
    assert.strictEqual(rowsShown(), 1);
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), false);

    clickOk();
    assert.strictEqual(imported.length, 1);
    assert.match(imported[0].nodes.find(n => n.type === 'function').func, /store\/inventory/);
});

test('a selection hidden by a later search is dropped', async () => {
    await openList();
    $('#flowgen-op-list .flowgen-op').first().trigger('click');
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), false);

    $('#flowgen-search').val('definitely-not-there').trigger('input');
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), true,
        'Import must not stay enabled for an invisible row');
    assert.strictEqual($('#flowgen-op-list .flowgen-op.selected').length, 0);
});

test('the count is shown only while searching', async () => {
    await openList();
    assert.strictEqual($('#flowgen-count').text(), '');
    $('#flowgen-search').val('pet').trigger('input');
    assert.match($('#flowgen-count').text(), /^\d+ of \d+$/);
    $('#flowgen-search').val('').trigger('input');
    assert.strictEqual($('#flowgen-count').text(), '');
});

test('arrow keys in the search box move through the visible rows only', async () => {
    await openList();
    $('#flowgen-search').val('pet').trigger('input');
    const visible = $('#flowgen-op-list .flowgen-op').filter((i, el) => !$(el).hasClass('flowgen-hidden'));

    $('#flowgen-search').trigger($.Event('keydown', { keyCode: 40 }));
    assert.ok(visible.eq(0).hasClass('selected'));
    $('#flowgen-search').trigger($.Event('keydown', { keyCode: 40 }));
    assert.ok(visible.eq(1).hasClass('selected'));
    $('#flowgen-search').trigger($.Event('keydown', { keyCode: 38 }));
    assert.ok(visible.eq(0).hasClass('selected'));

    assert.strictEqual($('#flowgen-op-list .flowgen-op.selected.flowgen-hidden').length, 0);
});

test('enter in the search box imports the selected endpoint', async () => {
    await openList();
    $('#flowgen-search').val('/store/inventory').trigger('input');
    $('#flowgen-search').trigger($.Event('keydown', { keyCode: 13 }));
    assert.strictEqual(imported.length, 1);
    assert.strictEqual(dialogClosed, 1);
});

test('escape clears the search and then returns to the paste view', async () => {
    await openList();
    $('#flowgen-search').val('pet').trigger('input');
    $('#flowgen-search').trigger($.Event('keydown', { keyCode: 27 }));
    assert.strictEqual($('#flowgen-search').val(), '');
    assert.strictEqual(shown(), 'select');

    $('#flowgen-search').trigger($.Event('keydown', { keyCode: 27 }));
    assert.strictEqual(shown(), 'paste');
});

test('a new document clears the previous search', async () => {
    await openList();
    $('#flowgen-search').val('pet').trigger('input');
    await openSpecTab(SPEC_V2);
    assert.strictEqual($('#flowgen-search').val(), '');
    assert.strictEqual($('#flowgen-count').text(), '');
});

test('the method colours keep the Swagger hues but the Node-RED intensity', async () => {
    const styles = PLUGIN_HTML.replace(/[\s\S]*?<style>/, '').replace(/<\/style>[\s\S]*/, '');

    const toHsl = hex => {
        const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const l = (max + min) / 2;
        if (max === min) return { h: 0, s: 0, l: l * 100 };
        const d = max - min;
        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        let h;
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        return { h: h * 60, s: s * 100, l: l * 100 };
    };

    const swagger = { get: '#61affe', post: '#49cc90', put: '#fca130', delete: '#f93e3e' };
    for (const [method, original] of Object.entries(swagger)) {
        const found = styles.match(
            new RegExp('\\.flowgen-' + method +
                '\\s+\\.flowgen-method\\s*\\{\\s*background:\\s*(#[0-9a-f]{6})'));
        assert.ok(found, 'no badge colour for ' + method);

        const before = toHsl(original);
        const after = toHsl(found[1]);
        assert.ok(Math.abs(after.h - before.h) < 6,
            method + ' hue moved from ' + Math.round(before.h) + ' to ' + Math.round(after.h));
        assert.ok(after.s <= before.s + 0.5,
            method + ' should not gain saturation: ' +
            Math.round(before.s) + ' -> ' + Math.round(after.s));
        assert.ok(after.l < before.l,
            method + ' should be darker than the Swagger colour');
        assert.ok(after.s >= 40 && after.s <= 90,
            method + ' saturation ' + Math.round(after.s) + ' is outside the Node-RED range');
        assert.ok(after.l >= 35 && after.l <= 62,
            method + ' lightness ' + Math.round(after.l) + ' is outside the Node-RED range');
    }
});

test('the row tints are pale enough to read text over', async () => {
    const styles = PLUGIN_HTML.replace(/[\s\S]*?<style>/, '').replace(/<\/style>[\s\S]*/, '');
    const tints = styles.match(/\.flowgen-op\.flowgen-\w+\s*\{\s*background:\s*(#[0-9a-f]{6})/g) || [];
    assert.ok(tints.length >= 5);
    for (const rule of tints) {
        const hex = rule.match(/#[0-9a-f]{6}/)[0];
        const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
        assert.ok((r + g + b) / 3 > 220, hex + ' is too dark for a row tint');
    }
    assert.ok(!/rgba\(/.test(styles), 'tints are solid colours, not alpha blends');
});

test('the tab disappears once the plugin is no longer served', async () => {
    assert.strictEqual($('#flowgen-tab-link').length, 1);

    pluginServed = false;
    $('#red-ui-clipboard-dialog').trigger('dialogopen');
    await wait(80);

    assert.strictEqual($('#flowgen-tab-link').length, 0, 'the tab must be removed');
    assert.strictEqual($('#red-ui-tab-red-ui-clipboard-dialog-import-tab-apispec').length, 0);
    assert.strictEqual($('#red-ui-clipboard-dialog-import-tab-apispec').length, 0,
        'the panel must be removed too');

    const labels = $('#red-ui-clipboard-dialog-import-tabs li a')
        .map((i, el) => $(el).text()).get();
    assert.strictEqual(labels.join(','), 'Clipboard,Local,Examples');
});

test('removing the tab leaves the Clipboard tab usable', async () => {
    specTab().trigger('click');
    await wait(30);
    assert.strictEqual(shown(), 'paste');

    pluginServed = false;
    $('#red-ui-clipboard-dialog').trigger('dialogopen');
    await wait(80);

    const visible = $(CONTENT).children()
        .filter((i, el) => $(el).css('display') !== 'none').map((i, el) => el.id).get().join(',');
    assert.strictEqual(visible, 'red-ui-clipboard-dialog-import-tab-clipboard');
    assert.strictEqual($('#red-ui-clipboard-dialog-import-tabs li.active').length, 1);
});

test('the built-in Import works again after the plugin is removed', async () => {
    await openSpecTab(SPEC_V3);
    $('#flowgen-select-btn').trigger('click');
    $('#flowgen-op-list .flowgen-op').first().trigger('click');
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), false);

    pluginServed = false;
    $('#red-ui-clipboard-dialog').trigger('dialogopen');
    await wait(80);

    clickOk();
    assert.strictEqual(imported.length, 0, 'the plugin must not hijack Import any more');
    assert.strictEqual(okDefaultRuns, 1, 'the built-in handler runs again');
});

test('the tab comes back when the plugin is served again', async () => {
    pluginServed = false;
    $('#red-ui-clipboard-dialog').trigger('dialogopen');
    await wait(80);
    assert.strictEqual($('#flowgen-tab-link').length, 0);

    pluginServed = true;
    $('#red-ui-clipboard-dialog').trigger('dialogopen');
    await wait(80);
    assert.strictEqual($('#flowgen-tab-link').length, 1);

    specTab().trigger('click');
    await wait(30);
    assert.strictEqual(shown(), 'paste');
});

test('a removed plugin does not leave stale state behind', async () => {
    await openSpecTab(SPEC_V3);
    pluginServed = false;
    $('#red-ui-clipboard-dialog').trigger('dialogopen');
    await wait(80);

    pluginServed = true;
    $('#red-ui-clipboard-dialog').trigger('dialogopen');
    await wait(80);
    specTab().trigger('click');
    await wait(30);

    assert.strictEqual($('#flowgen-spec-text').val(), '');
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), true);
    assert.strictEqual($('#flowgen-op-list .flowgen-op').length, 0);
});

test('several endpoints can be selected and imported together', async () => {
    await openList();
    const rows = $('#flowgen-op-list .flowgen-op');

    rows.eq(0).trigger('click');
    rows.eq(2).trigger($.Event('click', { ctrlKey: true }));
    rows.eq(4).trigger($.Event('click', { metaKey: true }));

    assert.strictEqual($('#flowgen-op-list .flowgen-op.selected').length, 3);
    assert.strictEqual($('#flowgen-chosen').text(), '3 selected');
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), false);

    clickOk();
    assert.strictEqual(imported.length, 1, 'one import carries every endpoint');
    const nodes = imported[0].nodes;
    assert.strictEqual(nodes.filter(n => n.type === 'function').length, 3);
    assert.strictEqual(nodes.length, 12);
    assert.strictEqual(new Set(nodes.map(n => n.id)).size, 12);
    assert.ok(!nodes.some(n => n.type === 'tab'));
});

test('a plain click after a multi selection starts over', async () => {
    await openList();
    const rows = $('#flowgen-op-list .flowgen-op');
    rows.eq(0).trigger('click');
    rows.eq(1).trigger($.Event('click', { ctrlKey: true }));
    assert.strictEqual($('#flowgen-op-list .flowgen-op.selected').length, 2);

    rows.eq(3).trigger('click');
    assert.strictEqual($('#flowgen-op-list .flowgen-op.selected').length, 1);
    assert.strictEqual($('#flowgen-chosen').text(), '');
});

test('ctrl clicking a selected row removes it again', async () => {
    await openList();
    const rows = $('#flowgen-op-list .flowgen-op');
    rows.eq(0).trigger('click');
    rows.eq(1).trigger($.Event('click', { ctrlKey: true }));
    rows.eq(1).trigger($.Event('click', { ctrlKey: true }));
    assert.strictEqual($('#flowgen-op-list .flowgen-op.selected').length, 1);
    assert.ok(rows.eq(0).hasClass('selected'));
});

test('rows hidden by a search drop out of the selection', async () => {
    await openList();
    const rows = $('#flowgen-op-list .flowgen-op');
    rows.eq(0).trigger('click');
    rows.eq(1).trigger($.Event('click', { ctrlKey: true }));

    $('#flowgen-search').val('definitely-not-there').trigger('input');
    assert.strictEqual($('#flowgen-op-list .flowgen-op.selected').length, 0);
    assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), true);
    assert.strictEqual($('#flowgen-chosen').text(), '');
});

test('the space key extends the selection down the list', async () => {
    await openList();
    $('#flowgen-op-list').trigger($.Event('keydown', { keyCode: 40 }));
    $('#flowgen-op-list').trigger($.Event('keydown', { keyCode: 32 }));
    assert.strictEqual($('#flowgen-op-list .flowgen-op.selected').length, 2);
    assert.strictEqual($('#flowgen-chosen').text(), '2 selected');
});

test('a single selection still shows no count', async () => {
    await openList();
    $('#flowgen-op-list .flowgen-op').first().trigger('click');
    assert.strictEqual($('#flowgen-chosen').text(), '');
});
