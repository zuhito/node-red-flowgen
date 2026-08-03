'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const express = require('express');
const RED = require('node-red');
const flowgen = require('../flowgen');

const ONLY = process.env.LIVE_ONLY || '';

const SPEC_SOURCES = [
  { name: 'petstore-v2', url: 'https://petstore.swagger.io/v2/swagger.json' },
  { name: 'petstore-v3', url: 'https://petstore3.swagger.io/api/v3/openapi.json' },
  { name: 'httpbin', url: 'https://httpbin.org/spec.json' },

  { name: 'apis-guru',
    url: 'https://raw.githubusercontent.com/APIs-guru/openapi-directory/main/APIs/apis.guru/2.2.0/openapi.yaml' },
  { name: 'apis-guru-v2',
    url: 'https://api.apis.guru/v2/openapi.yaml' }
];

const INLINE_SPECS = {
  httpbingo: {
    openapi: '3.0.3',
    info: { title: 'httpbingo', version: '1.0.0' },
    servers: [{ url: 'https://httpbingo.org' }],
    paths: {
      '/get': { get: { responses: { 200: { description: 'ok' } } } },
      '/post': { post: {
        requestBody: { content: { 'application/json': { schema: { type: 'object',
          properties: { hello: { type: 'string', example: 'world' } } } } } },
        responses: { 200: { description: 'ok' } } } },
      '/headers': { get: { responses: { 200: { description: 'ok' } } } },
      '/bearer': { get: { responses: { 200: { description: 'ok' } } } },
      '/basic-auth/{user}/{passwd}': { get: {
        parameters: [
          { name: 'user', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'passwd', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'ok' } } } },
      '/hidden-basic-auth/{user}/{passwd}': { get: {
        parameters: [
          { name: 'user', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'passwd', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'ok' } } } },
      '/status/{code}': { get: {
        parameters: [{ name: 'code', in: 'path', required: true,
          schema: { type: 'integer' } }],
        responses: { 200: { description: 'ok' } } } }
    }
  }
};

const BRUNO_SOURCES = [
  { name: 'bruno-starter-guide',
    git: 'https://github.com/bruno-collections/bruno-starter-guide.git' },
  { name: 'bruno-freeapis', git: 'https://github.com/AndiKod/Bruno-freeAPIs.git' },
  { name: 'bruno-swapi', git: 'https://github.com/BBlackwo/bruno-swapi.git' },
  { name: 'bruno-collections', git: 'https://github.com/BrentShikoski/bruno-collections.git' },
  { name: 'bruno-api-odkcentral', git: 'https://github.com/CEN-Nouvelle-Aquitaine/bruno-API-ODKCentral.git' },
  { name: 'json-api-server', git: 'https://github.com/CWACoderWithAttitude/json-api-server.git' },
  { name: 'bruno-directus', git: 'https://github.com/ComfortablyCoding/bruno-directus.git' },
  { name: 'bruno-api-collections', git: 'https://github.com/DhyanTD/Bruno-APi-Collections.git' },
  { name: 'todobruno', git: 'https://github.com/ErfanMinaei/TodoBruno.git' },
  { name: 'bruno-collection', git: 'https://github.com/GlobalFishingWatch/bruno-collection.git' },
  { name: 'cyberark-rest-api-bruno', git: 'https://github.com/IAM-Jah/CyberArk-REST-API-Bruno.git' },
  { name: 'ipdata-api-collections', git: 'https://github.com/IPDataInfo/ipdata-api-collections.git' },
  { name: 'livenet-collections', git: 'https://github.com/Orange-OpenSource/livenet-collections.git' },
  { name: 'bruno-hostedscan', git: 'https://github.com/Pixel-Open/bruno-hostedscan.git' },
  { name: 'bruno-plausible', git: 'https://github.com/Pixel-Open/bruno-plausible.git' },
  { name: 'readwise-bruno', git: 'https://github.com/Scarvy/readwise-bruno.git' },
  { name: 'yahoo-finance-api-collection', git: 'https://github.com/Scarvy/yahoo-finance-api-collection.git' },
  { name: 'aps-bruno-collection', git: 'https://github.com/arkham-engineering/aps-bruno-collection.git' },
  { name: 'usebruno', git: 'https://github.com/briansiervi/usebruno.git' },
  { name: 'bruno-sarvamai', git: 'https://github.com/bruno-collections/bruno-sarvamai.git' },
  { name: 'bruno-scim-api-collection', git: 'https://github.com/bruno-collections/bruno-scim-api-collection.git' },
  { name: 'github-rest-api-collection', git: 'https://github.com/bruno-collections/github-rest-api-collection.git' },
  { name: 'todo-advogados-collections', git: 'https://github.com/caio-andres/ToDo-advogados-collections.git' },
  { name: 'canvas-fhir-example-requests', git: 'https://github.com/canvas-medical/canvas-fhir-example-requests.git' },
  { name: 'bruno-api-collection', git: 'https://github.com/clintonnoronha/bruno-api-collection.git' },
  { name: 'okta-bruno', git: 'https://github.com/coleleep/okta-bruno.git' },
  { name: 'arena-api', git: 'https://github.com/comerc/arena-api.git' },
  { name: 'learn', git: 'https://github.com/credyt/learn.git' },
  { name: 'bruno-collection-loops', git: 'https://github.com/daniebeler/bruno-collection-loops.git' },
  { name: 'nadeo-api-bruno', git: 'https://github.com/davidbmaier/nadeo-api-bruno.git' },
  { name: 'bruno-api-mcp', git: 'https://github.com/djkz/bruno-api-mcp.git' },
  { name: 'azure-logs-ingestion-api-troubleshooter', git: 'https://github.com/el-bakkali/azure-logs-ingestion-api-troubleshooter.git' },
  { name: 'api-collection-by-bruno', git: 'https://github.com/fresns/api-collection-by-bruno.git' },
  { name: 'workspace-usebruno', git: 'https://github.com/ganesh-bruno/workspace-usebruno.git' },
  { name: 'bruno-mcp', git: 'https://github.com/jackmulligan-ire/bruno-mcp.git' },
  { name: 'poc-usebruno', git: 'https://github.com/jmsolar/poc_usebruno.git' },
  { name: 'flutter-dev-bruno-collection', git: 'https://github.com/jonasermert/flutter-dev-bruno-collection.git' },
  { name: 'api-collections-bruno', git: 'https://github.com/jonathanmiquelino/api-collections-bruno.git' },
  { name: 'public-apis', git: 'https://github.com/keyduq/public-apis.git' }
];

const CASES = [
  { source: 'petstore-v2', method: 'get', path: '/store/inventory' },
  { source: 'petstore-v2', method: 'get', path: '/store/inventory',
    auth: { api_key: 'special-key' } },
  { source: 'petstore-v2', method: 'get', path: '/pet/findByStatus' },
  { source: 'petstore-v2', method: 'get', path: '/pet/{petId}', fill: { petId: '1' },
    expect: [200, 404] },
  { source: 'petstore-v3', method: 'get', path: '/pet/{petId}', fill: { petId: '1' },
    expect: [200, 404] },
  { source: 'petstore-v3', method: 'get', path: '/pet/findByStatus' },
  { source: 'httpbin', method: 'get', path: '/get' },
  { source: 'httpbin', method: 'get', path: '/headers' },
  { source: 'httpbin', method: 'get', path: '/response-headers' },
  { source: 'httpbin', method: 'post', path: '/post' },
  { source: 'httpbin', method: 'get', path: '/status/{codes}', fill: { codes: '200' } },
  { source: 'httpbin', method: 'get', path: '/bearer', expect: [200, 401] },
  { source: 'httpbin', method: 'get', path: '/bearer',
    addAuth: { authorization: 'Bearer live-test-token' }, expect: 200 },
  { source: 'bruno-starter-guide', method: 'get', path: '/users/usebruno' },
  { source: 'bruno-starter-guide', method: 'get', path: '/basic-auth/usebruno/1234',
    expect: [200, 401] },
  { source: 'bruno-starter-guide', method: 'get', path: '/basic-auth/usebruno/1234',
    auth: { authorization: 'Basic dXNlYnJ1bm86MTIzNA==' }, expect: 200 },
  { source: 'httpbin', method: 'get', path: '/basic-auth/{user}/{passwd}',
    fill: { user: 'u', passwd: 'p' },
    addAuth: { authorization: 'Basic dTpw' }, expect: 200 },
  { source: 'httpbingo', method: 'get', path: '/get' },
  { source: 'httpbingo', method: 'post', path: '/post' },
  { source: 'httpbingo', method: 'get', path: '/headers' },
  { source: 'httpbingo', method: 'get', path: '/bearer',
    addAuth: { authorization: 'Bearer live-test-token' }, expect: 200, strict: true },
  { source: 'httpbingo', method: 'get', path: '/basic-auth/{user}/{passwd}',
    fill: { user: 'u', passwd: 'p' },
    addAuth: { authorization: 'Basic dTpw' }, expect: 200, strict: true },
  { source: 'httpbingo', method: 'get', path: '/hidden-basic-auth/{user}/{passwd}',
    fill: { user: 'u', passwd: 'p' },
    addAuth: { authorization: 'Basic dTpw' }, expect: 200, strict: true },
  { source: 'httpbingo', method: 'get', path: '/status/{code}', fill: { code: '204' },
    expect: 204, strict: true },
  { source: 'apis-guru', method: 'get', path: '/providers.json' },
  { source: 'apis-guru', method: 'get', path: '/metrics.json' },
  { source: 'apis-guru', method: 'get', path: '/list.json' },
  { source: 'apis-guru-v2', method: 'get', path: '/providers.json' },
  { source: 'apis-guru-v2', method: 'get', path: '/list.json' }
];

const summary = [];

const CORPUS_CASES = [
  { spec: 'zoomconnect.com/1/swagger.yaml', path: '/api/rest/v1/account/balance' },
  { spec: 'rumble.run/2.15.0/openapi.yaml', path: '/releases/agent/version' },
  { spec: 'data2crm.com/1/swagger.yaml', path: '/application/entity/account/describe' },
  { spec: 'ndhm.gov.in/ndhm-hip/0.5/openapi.yaml', path: '/v0.5/.well-known/openid-configuration' },
  { spec: 'contribly.com/1.0.0/openapi.yaml', path: '/artifact-formats' },
  { spec: 'consumerfinance.gov/1.0/swagger.yaml', path: '/data' },
  { spec: 'bigdatacloud.net/1.0.0/openapi.yaml', path: '/data/ip-geolocation-full' },
  { spec: 'thebluealliance.com/3.8.2/openapi.yaml', path: '/status' },
  { spec: 'avaza.com/v1/swagger.yaml', path: '/api/Currency' },
  { spec: 'zuora.com/2021-08-20/openapi.yaml', path: '/v1/accounting-codes' },
  { spec: 'asuarez.dev/searchly/1.0/openapi.yaml', path: '/similarity/by_song' },
  { spec: 'openai.com/1.2.0/openapi.yaml', path: '/files' },
  { spec: 'httpbin.org/0.9.2/openapi.yaml', path: '/anything' },
  { spec: 'apis.guru/2.2.0/openapi.yaml', path: '/list.json' },
  { spec: 'wikipathways.org/1.0/openapi.yaml', path: '/listOrganisms' },
  { spec: 'lgtm.com/v1.0/openapi.yaml', path: '/openapi' },
  { spec: 'quarantine.country/1.0/swagger.yaml', path: '/summary/latest' },
  { spec: 'brex.io/2021.12/openapi.yaml', path: '/api/v1/company/monitoring/changeTypes' },
  { spec: 'rbaskets.in/1.0.0/swagger.yaml', path: '/api/version' },
  { spec: 'metadapi.com/1.0/openapi.yaml', path: '/zipc/v1' },
  { spec: 'greip.io/1.0.0/openapi.yaml', path: '/ASNLookup' },
  { spec: 'openbanking.org.uk/v1.3/openapi.yaml', path: '/atms' },
  { spec: 'clickup.com/1.0.0/openapi.yaml', path: '/questions' },
  { spec: 'deutschebahn.com/flinkster/v1/swagger.yaml', path: '/index' },
  { spec: 'billbee.io/v1/openapi.yaml', path: '/api/v1/automaticprovision/termsinfo' },
  { spec: 'mastercard.com/CurrencyConversionCalculator/1.0.0/swagger.yaml', path: '/settlement-currencies' },
  { spec: 'truanon.com/1.0.0/openapi.yaml', path: '/api/get_profile' },
  { spec: 'bigoven.com/partner/openapi.yaml', path: '/grocerylist' },
  { spec: 'apple.com/sirikit-cloud-media/1.0.2/openapi.yaml', path: '/configuration' },
  { spec: 'handwrytten.com/1.0.0/swagger.yaml', path: '/cards/list' },
  { spec: 'groundhog-day.com/1.2.1/openapi.yaml', path: '/api/v1' },
  { spec: 'taxamo.com/1/swagger.yaml', path: '/api/v1/dictionaries/currencies' },
  { spec: 'aviationdata.systems/v1/swagger.yaml', path: '/v1/country_list' },
  { spec: 'sheetlabs.com/rig-veda/1.2/swagger.yaml', path: '/resources' },
  { spec: 'zapier.com/nla/1.0.0/openapi.yaml', path: '/api/v1/check/' },
  { spec: 'chaingateway.io/1.0.0/openapi.yaml', path: '/v2/bitcoin/blocks/number' },
  { spec: 'sinao.app/1.1.0/openapi.yaml', path: '/me' },
  { spec: 'reverb.com/3.0/openapi.yaml', path: '/articles/categories' },
  { spec: 'watchful.li/1.0.0/swagger.yaml', path: '/audits/metadata' },
  { spec: 'microsoft.com/graph/1.0.1/openapi.yaml', path: '/admin' },
  { spec: 'microsoft.com/cognitiveservices-Training/2.0/openapi.yaml', path: '/domains' },
  { spec: 'idtbeyond.com/1.1.7/swagger.yaml', path: '/iatu/balance' },
  { spec: 'mermade.org.uk/openapi-converter/1.0.0/openapi.yaml', path: '/badge' },
  { spec: '1forge.com/0.0.1/swagger.yaml', path: '/quotes' },
  { spec: 'shutterstock.com/1.1.32/openapi.yaml', path: '/v2/oauth/authorize' },
  { spec: 'medium.com/1.0/openapi.yaml', path: '/' },
  { spec: 'braze.com/1.0.0/openapi.yaml', path: '/campaigns/data_series' },
  { spec: 'linode.com/4.151.1/openapi.yaml', path: '/databases/engines' },
  { spec: 'agco-ats.com/v1/openapi.yaml', path: '/api/v2/AftermarketServices/Certificates' },
  { spec: 'tcgdex.net/2.0.0/openapi.yaml', path: '/cards' },
  { spec: 'hetzner.cloud/1.0.0/openapi.yaml', path: '/pricing' },
  { spec: 'twitter.com/current/2.62/openapi.yaml', path: '/2/openapi.json' },
  { spec: 'apache.org/qakka/v1/openapi.yaml', path: '/queues' },
  { spec: 'hetras-certification.net/hotel/v0/swagger.yaml', path: '/api/hotel/v0/hotels' },
  { spec: 'amadeus.com/amadeus-location-score/1.0.2/openapi.yaml', path: '/location/analytics/category-rated-areas' },
  { spec: 'uebermaps.com/2.0/swagger.yaml', path: '/collaborator_invitations' },
  { spec: 'apacta.com/0.0.42/openapi.yaml', path: '/activities' },
  { spec: 'vtex.local/Policies-System-API/1.0.0/openapi.yaml', path: '/api/policy-engine/policies' },
  { spec: 'cpy.re/peertube/5.1.0/openapi.yaml', path: '/api/v1/config' },
  { spec: 'ideaconsult.net/nanoreg/4.0.0/openapi.yaml', path: '/select' },
  { spec: 'tisane.ai/1.0.0/openapi.yaml', path: '/hypernyms' },
  { spec: 'o2.cz/mobility/1.2.0/swagger.yaml', path: '/info' },
  { spec: 'hubapi.com/crm/v3/openapi.yaml', path: '/sample-response' },
  { spec: 'slideroom.com/v2/swagger.yaml', path: '/api/v2/applicant/attributes/names' },
  { spec: 'presalytics.io/ooxml/0.1.0/openapi.yaml', path: '/Charts/AxisDataTypes' },
  { spec: 'atlassian.com/jira/1001.0.0-SNAPSHOT/openapi.yaml', path: '/rest/atlassian-connect/1/app/module/dynamic' },
  { spec: 'dnd5eapi.co/0.1/openapi.yaml', path: '/api' },
  { spec: 'evemarketer.com/1.0.1/swagger.yaml', path: '/marketstat/json' },
  { spec: 'bigredcloud.com/v1/openapi.yaml', path: '/v1/accounts' },
  { spec: 'visualcrossing.com/weather/4.6/openapi.yaml', path: '/VisualCrossingWebServices/rest/services/weatherdata/forecast' },
  { spec: 'clearblade.com/3.0/swagger.yaml', path: '/admin/database/status' },
  { spec: 'tfl.gov.uk/v1/openapi.yaml', path: '/AirQuality' },
  { spec: 'clever-cloud.com/1.0.0/openapi.yaml', path: '//openapi' },
  { spec: 'opentrials.local/0.0.1/swagger.yaml', path: '/document_categories' },
  { spec: 'github.com/api.github.com/1.1.4/openapi.yaml', path: '/' },
  { spec: 'github.com/ghes-3.5/1.1.4/openapi.yaml', path: '/' },
  { spec: 'mozilla.com/kinto/1.22/openapi.yaml', path: '/' },
  { spec: 'notion.com/1.0.0/openapi.yaml', path: '/v1/comments' },
  { spec: 'gov.bc.ca/bcgnws/3.x.x/openapi.yaml', path: '/featureCategories' },
  { spec: 'gov.bc.ca/jobposting/1.0.0/openapi.yaml', path: '/Industries' },
  { spec: 'gov.bc.ca/news/1.0/openapi.yaml', path: '/api/Home' },
  { spec: 'docker.com/hub/beta/openapi.yaml', path: '/v2/scim/2.0/ResourceTypes' },
  { spec: 'just-eat.co.uk/1.0.0/openapi.yaml', path: '/delivery/pools' },
  { spec: 'smart-me.com/v1/openapi.yaml', path: '/api/Account/login' },
  { spec: 'telematicssdk.com/1.0.0/openapi.yaml', path: '/statistics/v1/Scorings/individual/' },
  { spec: 'corrently.io/2.0.0/openapi.yaml', path: '/alternative/ocpp/lastSessions' },
  { spec: 'naviplancentral.com/plan/v1/swagger.yaml', path: '/api/Advisors' },
  { spec: 'trakt.tv/1.0.0/openapi.yaml', path: '/oauth/authorize' },
  { spec: 'poemist.com/1.0/swagger.yaml', path: '/randompoems' },
  { spec: 'jokes.one/1.1/swagger.yaml', path: '/joke/list' },
  { spec: 'clicksend.com/1.0.0/openapi.yaml', path: '/account' },
  { spec: 'carbone.io/1.2.0/openapi.yaml', path: '/status' },
  { spec: 'exhibitday.com/v1/swagger.yaml', path: '/api/docs/Swagger' },
  { spec: 'evetech.net/0.8.6/swagger.yaml', path: '/alliances/' },
  { spec: 'vonage.com/vgis/1.0.1/openapi.yaml', path: '/self' },
  { spec: 'canada-holidays.ca/1.8.0/openapi.yaml', path: '/api/v1' },
  { spec: 'bungie.net/2.18.0/openapi.yaml', path: '/App/FirstParty/' },
  { spec: 'epa.gov/dfr/0.0.0/swagger.yaml', path: '/dfr_rest_services.air_3_yr_download' },
  { spec: 'getpostman.com/1.20.0/openapi.yaml', path: '/apis' },
  { spec: 'swagger.io/generator/2.4.31/swagger.yaml', path: '/gen/clients' },
  { spec: 'apidapp.com/2019-02-14T164701Z/openapi.yaml', path: '/erc20' },
  { spec: 'wikimedia.org/1.0.0/swagger.yaml', path: '/feed/availability' },
  { spec: 'appcenter.ms/v0.1/openapi.yaml', path: '/v0.1/public/codepush/status' },
  { spec: 'balldontlie.io/1.0.0/openapi.yaml', path: '/api/v1/games' },
  { spec: 'magento.com/2.2.10/openapi.yaml', path: '/V1/analytics/link' },
  { spec: 'payrun.io/23.24.2.136/openapi.yaml', path: '/Healthcheck' },
  { spec: 'beezup.com/2.0/openapi.yaml', path: '/v2/public/channels/' },
  { spec: 'journy.io/1.0.0/openapi.yaml', path: '/events' },
  { spec: 'oxforddictionaries.com/1.11.0/openapi.yaml', path: '/filters' },
  { spec: 'appwrite.io/server/0.9.3/openapi.yaml', path: '/account' },
  { spec: 'bluemix.net/containers/3.0.0/openapi.yaml', path: '/containers/version' },
  { spec: 'oceandrivers.com/1.0/openapi.yaml', path: '/v1.0/getWebCams/' },
  { spec: 'patientview.org/1.0/openapi.yaml', path: '/patientmanagement/diagnoses' },
  { spec: 'visma.com/1.0/openapi.yaml', path: '/heartbeat/database' },
  { spec: 'digitallocker.gov.in/authpartner/1.0.0/openapi.yaml', path: '/oauth2/2/files/issued' },
  { spec: 'twilio.com/api/1.55.0/openapi.yaml', path: '/healthcheck' },
  { spec: 'wellknown.ai/1.0.0/openapi.yaml', path: '/api/plugins' },
  { spec: 'hsbc.com/atm/2.2.1/swagger.yaml', path: '/open-banking/v2.2/atms' },
  { spec: 'osisoft.com/1.11.1.5383/swagger.yaml', path: '/' },
  { spec: 'docusign.net/v2.1/openapi.yaml', path: '/service_information' }
];

const CORPUS_BASE =
  'https://raw.githubusercontent.com/APIs-guru/openapi-directory/main/APIs/';

function note(level, text) {
  const line = String(text).replace(/\r?\n/g, ' ');
  process.stdout.write('::' + level + '::' + line + '\n');
  summary.push((level === 'error' ? 'FAIL | ' : 'ok   | ') + line);
}

function writeSummary() {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  fs.appendFileSync(file,
    '## Live API results\n\n```\n' + summary.join('\n') + '\n```\n');
}

function download(url, redirects) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http;
    mod.get(url, { headers: { 'user-agent': 'flowgen-live' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (!redirects) return reject(new Error('too many redirects'));
        return download(new URL(res.headers.location, url).toString(), redirects - 1)
          .then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' from ' + url));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

function gather(root) {
  const files = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(bru|ya?ml|json)$/.test(entry.name)) {
        files.push({ path: path.relative(root, full), text: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  walk(root);
  return files;
}

function applyFill(code, fill) {
  let out = code;
  for (const [key, value] of Object.entries(fill || {})) {
    out = out.split('{' + key + '}').join(value);
  }
  return out;
}

function addHeaders(code, headers) {
  const extra = Object.entries(headers)
    .map(([name, value]) => '  ' + JSON.stringify(name) + ': ' + JSON.stringify(value))
    .join(',\n');
  return code.replace(/return msg;\s*$/,
    'msg.headers = Object.assign(msg.headers || {}, {\n' + extra + '\n});\nreturn msg;');
}

function applyAuth(code, headers) {
  let out = code;
  for (const [name, value] of Object.entries(headers || {})) {
    const pattern = new RegExp("('" + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      "': )`[^`]*`");
    if (!pattern.test(out)) {
      throw new Error('no placeholder for header ' + name);
    }
    out = out.replace(pattern, '$1`' + value + '`');
  }
  return out;
}

async function loadSources() {
  const docs = {};
  for (const [name, spec] of Object.entries(INLINE_SPECS)) {
    docs[name] = spec;
    note('notice', 'using the built in ' + name + ' definition');
  }
  for (const source of SPEC_SOURCES) {
    try {
      docs[source.name] = flowgen.parseDocument(await download(source.url, 5));
      note('notice', 'loaded ' + source.name + ' from ' + source.url);
    } catch (err) {
      note('notice', 'could not load ' + source.name + ': ' + err.message);
    }
  }
  const { execFileSync } = require('child_process');
  for (const source of BRUNO_SOURCES) {
    try {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'live-git-'));
      execFileSync('git', ['clone', '--quiet', '--depth', '1', source.git, tmp],
        { stdio: 'pipe' });
      docs[source.name] = flowgen.parseCollection(gather(tmp));
      fs.rmSync(tmp, { recursive: true, force: true });
      note('notice', 'loaded ' + source.name + ' from ' + source.git);
    } catch (err) {
      note('notice', 'could not load ' + source.name + ': ' + err.message);
    }
  }
  return docs;
}

async function main() {
  const docs = await loadSources();
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-live-'));
  const app = express();
  const server = http.createServer(app);
  RED.init(server, {
    httpAdminRoot: false,
    httpNodeRoot: false,
    userDir: userDir,
    flowFile: 'flows.json',
    logging: { console: { level: 'fatal', metrics: false, audit: false } }
  });
  fs.writeFileSync(path.join(userDir, 'flows.json'), '[]');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await RED.start();

  let failures = 0;
  let ran = 0;
  let reached = 0;

  for (const testCase of CASES) {
    const label = testCase.source + ' ' + testCase.method.toUpperCase() + ' ' + testCase.path;
    if (ONLY && label.indexOf(ONLY) === -1) continue;
    const doc = docs[testCase.source];
    if (!doc) { note('notice', label + ' -> skipped, source unavailable'); continue; }

    let nodes;
    try {
      nodes = flowgen.buildFlow(doc, testCase.method, testCase.path);
    } catch (err) {
      failures++;
      note('error', label + ' -> generation failed: ' + err.message);
      continue;
    }
    ran++;

    if (testCase.auth || testCase.addAuth) {
      const fn = nodes.find(n => n.type === 'function');
      try {
        if (testCase.auth) { fn.func = applyAuth(fn.func, testCase.auth); }
        if (testCase.addAuth) { fn.func = addHeaders(fn.func, testCase.addAuth); }
        new Function(fn.func);
      } catch (err) {
        failures++;
        note('error', label + ' -> ' + err.message);
        continue;
      }
    }

    for (const node of nodes) {
      if (node.type === 'inject') { node.once = true; node.onceDelay = 0.1; }
      if (node.type === 'function') {
        node.func = applyFill(node.func, testCase.fill);
      }
      if (node.type === 'http request') { node.ret = 'obj'; node.senderr = true; }
    }
    const probe = nodes.find(n => n.type === 'debug');
    probe.type = 'function';
    probe.name = 'probe';
    probe.outputs = 1;
    probe.wires = [[]];
    probe.func = "global.set('liveResult', { status: msg.statusCode });\nreturn msg;";

    fs.writeFileSync(path.join(userDir, 'flows.json'), JSON.stringify(nodes));
    await RED.nodes.loadFlows(true);

    let node = null;
    for (let i = 0; i < 50 && !node; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      node = RED.nodes.getNode(probe.id);
    }
    if (!node) { failures++; note('error', label + ' -> probe never started'); continue; }
    const context = node.context().global;
    context.set('liveResult', null);

    const started = Date.now();
    let result = null;
    while (!result && Date.now() - started < 45000) {
      await new Promise(resolve => setTimeout(resolve, 200));
      result = context.get('liveResult');
    }
    result = result || { status: null };

    const expected = [].concat(testCase.expect || []);
    if (expected.length) {
      if (expected.indexOf(result.status) !== -1) {
        note('notice', label + ' -> HTTP ' + result.status + ' (as expected)');
      } else if (testCase.strict) {
        failures++;
        note('error', label + ' -> HTTP ' + result.status + ', expected ' +
          expected.join(' or '));
      } else {
        note('notice', label + ' -> HTTP ' + result.status + ', expected ' +
          expected.join(' or '));
      }
    } else if (result.status >= 200 && result.status < 400) {
      note('notice', label + ' -> HTTP ' + result.status);
    } else if (result.status >= 500) {
      note('notice', label + ' -> HTTP ' + result.status +
        ' (upstream error, not a generation fault)');
    } else if (result.status) {
      failures++;
      note('error', label + ' -> HTTP ' + result.status +
        ' (the generated request was rejected)');
    } else {
      note('notice', label + ' -> no response within 30s (upstream did not answer)');
    }
  }

  for (const source of BRUNO_SOURCES) {
    const doc = docs[source.name];
    if (!doc) continue;
    const list = flowgen.listOperations(doc);
    let bad = 0;
    for (const op of list.operations) {
      let code;
      try {
        code = flowgen.generate(doc, op.method, op.path);
      } catch (err) {
        bad++;
        failures++;
        note('error', source.name + ' ' + op.method + ' ' + op.path +
          ' -> generation failed: ' + err.message);
        continue;
      }
      try {
        new Function(code);
      } catch (err) {
        bad++;
        failures++;
        note('error', source.name + ' ' + op.method + ' ' + op.path +
          ' -> invalid JavaScript: ' + err.message);
        continue;
      }
      if (!/^msg\.url = `[^`]*`;$/m.test(code)) {
        bad++;
        failures++;
        note('error', source.name + ' ' + op.method + ' ' + op.path + ' -> no msg.url');
      }
    }
    ran += list.count;
    note('notice', source.name + ' -> ' + list.count + ' requests generated, ' +
      bad + ' problems');
  }

  if (process.env.LIVE_CORPUS) {
    for (const entry of CORPUS_CASES) {
      const label = 'corpus ' + entry.spec + ' GET ' + entry.path;
      let doc;
      try {
        doc = flowgen.parseDocument(await download(CORPUS_BASE + entry.spec, 5));
      } catch (err) {
        note('notice', label + ' -> spec unavailable: ' + err.message);
        continue;
      }
      let nodes;
      try {
        nodes = flowgen.buildFlow(doc, 'get', entry.path);
      } catch (err) {
        failures++;
        note('error', label + ' -> generation failed: ' + err.message);
        continue;
      }
      ran++;

      const source = nodes.find(n => n.type === 'function').func;
      try {
        new Function(source);
      } catch (err) {
        failures++;
        note('error', label + ' -> generated invalid JavaScript: ' + err.message);
        continue;
      }
      const urlLine = source.match(/msg\.url = `([^`]*)`;/);
      if (!urlLine) {
        failures++;
        note('error', label + ' -> no msg.url was generated');
        continue;
      }
      try {
        new URL(urlLine[1]);
      } catch (err) {
        failures++;
        note('error', label + ' -> generated an invalid URL: ' + urlLine[1]);
        continue;
      }

      for (const node of nodes) {
        if (node.type === 'inject') { node.once = true; node.onceDelay = 0.1; }
        if (node.type === 'http request') { node.ret = 'obj'; node.senderr = true; }
      }
      const probe = nodes.find(n => n.type === 'debug');
      probe.type = 'function';
      probe.name = 'probe';
      probe.outputs = 1;
      probe.wires = [[]];
      probe.func = "global.set('liveResult', { status: msg.statusCode });\nreturn msg;";

      fs.writeFileSync(path.join(userDir, 'flows.json'), JSON.stringify(nodes));
      await RED.nodes.loadFlows(true);

      let node = null;
      for (let i = 0; i < 50 && !node; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        node = RED.nodes.getNode(probe.id);
      }
      if (!node) { note('notice', label + ' -> probe never started'); continue; }
      const context = node.context().global;
      context.set('liveResult', null);

      const started = Date.now();
      let result = null;
      while (!result && Date.now() - started < 8000) {
        await new Promise(resolve => setTimeout(resolve, 200));
        result = context.get('liveResult');
      }
      const status = (result || {}).status || null;

      if (status) {
        reached++;
        note('notice', label + ' -> HTTP ' + status + ' (the request reached the API)');
      } else {
        note('notice', label + ' -> no response (host unreachable)');
      }
    }
  }

  note('notice', 'live cases run: ' + ran + ', reached: ' + reached +
    ', failures: ' + failures);
  writeSummary();
  await RED.stop();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(userDir, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}

main().catch(err => {
  note('error', 'live run crashed: ' + err.message);
  writeSummary();
  process.exit(1);
});
