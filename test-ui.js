'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PLUGIN_HTML = fs.readFileSync(path.join(__dirname, 'plugin', 'flowgen-plugin.html'), 'utf8');
const SPEC_V3 = fs.readFileSync(path.join(__dirname, 'spec', 'petstore-v3.yaml'), 'utf8');
const SPEC_V2 = fs.readFileSync(path.join(__dirname, 'spec', 'petstore-v2.yaml'), 'utf8');
const CONTENT = '#red-ui-clipboard-dialog-import-tabs-content';

const DIALOG = `
<div id="red-ui-clipboard-dialog">
  <div class="dialog-form">
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
  </div>
  <div class="ui-dialog-buttonpane">
    <button id="red-ui-clipboard-dialog-ok" class="primary">Import</button>
  </div>
</div>`;

let dom, win, $, RED, imported, dialogClosed, okDefaultRuns;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function boot() {
  dom = new JSDOM('<!doctype html><html><body>' + DIALOG + '</body></html>',
    { runScripts: 'outside-only', url: 'http://localhost:1880/' });
  win = dom.window;

  win.eval(fs.readFileSync(path.join(__dirname, 'node_modules', 'jquery', 'dist', 'jquery.js'), 'utf8'));
  $ = win.jQuery;

  imported = [];
  dialogClosed = 0;
  okDefaultRuns = 0;

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
    win.eval(fs.readFileSync(path.join(__dirname, 'flowgen.js'), 'utf8'));
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

beforeEach(async () => { await boot(); });

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
  const rows = $('#flowgen-op-list .flowgen-op');
  assert.ok(rows.length > 0);
  assert.match($('#flowgen-status').text(), /openapi3, \d+ operations/);
  const first = rows.first().text();
  assert.match(first, /PUT/);
  assert.match(first, /\/pet/);
});

test('a swagger 2 document is accepted too', async () => {
  await openSpecTab(SPEC_V2);
  assert.match($('#flowgen-status').text(), /swagger2, \d+ operations/);
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
  $('#flowgen-op-list .flowgen-op').first().trigger('click');
  assert.strictEqual($('#red-ui-clipboard-dialog-ok').prop('disabled'), false);
});

test('the Import button imports the selected endpoint as a flow', async () => {
  await openSpecTab(SPEC_V3);
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
    'tab,inject,function,http request,debug');
  const fn = nodes.find(n => n.type === 'function');
  assert.match(fn.func, /msg\.method = 'GET';/);
  assert.match(fn.func, /pet\/\{petId\}/);
  assert.strictEqual(imported[0].opts.addFlow, false);
});

test('the new flow option is honoured', async () => {
  await openSpecTab(SPEC_V3);
  $('#red-ui-clipboard-dialog-import-opt-current').removeClass('selected');
  $('#red-ui-clipboard-dialog-import-opt-new').addClass('selected');
  $('#flowgen-op-list .flowgen-op').first().trigger('click');
  clickOk();
  assert.strictEqual(imported[0].opts.addFlow, true);
});

test('the built-in import still runs when another tab is active', async () => {
  await openSpecTab(SPEC_V3);
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
});
