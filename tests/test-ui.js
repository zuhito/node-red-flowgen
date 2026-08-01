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

let dom, win, $, RED, imported, dialogClosed, okDefaultRuns, submits;

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

  const script = PLUGIN_HTML.replace(/[\s\S]*?<script[^>]*>/, '').replace(/<\/script>[\s\S]*/, '');
  win.eval(script);

  $('#red-ui-clipboard-dialog').trigger('dialogopen');
  await wait(20);
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
  await wait(20);
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
  win.fetch = url => {
    requested = url;
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(SPEC_V2) });
  };

  $('#flowgen-spec-text').val('https://petstore.swagger.io/v2/swagger.json').trigger('keyup');
  await wait(400);

  assert.strictEqual(requested, 'https://petstore.swagger.io/v2/swagger.json');
  assert.strictEqual($('#flowgen-spec-text').val(), SPEC_V2);
  assert.notStrictEqual($('#flowgen-select-btn').css('display'), 'none');
});

test('a failed fetch reports an error', async () => {
  specTab().trigger('click');
  await wait(20);
  win.fetch = () => Promise.resolve({ ok: false, status: 404 });
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
  assert.match(fn.func, /msg\.method = 'GET';/);
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

test('Select endpoint is filled solid red like the enabled Import button', async () => {
  await openSpecTab(SPEC_V3);
  const styles = PLUGIN_HTML.replace(/[\s\S]*?<style>/, '').replace(/<\/style>[\s\S]*/, '');
  const rule = styles.match(/#flowgen-select-btn,\s*#flowgen-back-btn\s*\{([^}]*)\}/)[1];
  assert.match(rule, /background:\s*#ad1625/, 'solid Node-RED red, no grey variable fallback');
  assert.match(rule, /color:\s*#fff\s*!important/);
  assert.ok(!/var\(/.test(rule), 'no CSS variables that can fall back to grey');
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
  assert.match(styles, /\.flowgen-get\s+\.flowgen-method\s*\{\s*background:\s*#61affe/);
  assert.match(styles, /\.flowgen-post\s+\.flowgen-method\s*\{\s*background:\s*#49cc90/);
  assert.match(styles, /\.flowgen-put\s+\.flowgen-method\s*\{\s*background:\s*#fca130/);
  assert.match(styles, /\.flowgen-delete\s+\.flowgen-method\s*\{\s*background:\s*#f93e3e/);
  assert.match(styles, /\.flowgen-method\s*\{[^}]*font-weight:\s*700/);
  assert.match(styles, /\.flowgen-path\s*\{[^}]*font-size:\s*16px/);
  assert.match(styles, /\.flowgen-path\s*\{[^}]*font-weight:\s*600/);
  assert.match(styles, /\.flowgen-path\s*\{[^}]*color:\s*#3b4151/);
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
  win.fetch = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(compact) });

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
  win.fetch = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(SPEC_V3) });
  $('#flowgen-spec-text').val('https://example.test/spec.yaml').trigger('keyup');
  await wait(400);
  assert.strictEqual($('#flowgen-spec-text').val(), SPEC_V3);
});
