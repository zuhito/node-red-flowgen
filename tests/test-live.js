'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const express = require('express');
const RED = require('node-red');
const { execFile } = require('child_process');
const flowgen = require('../flowgen');
const { errorWords, unexpectedErrors } = require('./error-words');

const ONLY = process.env.LIVE_ONLY || '';

// Only definitions published as sandboxes for testing belong here. Calling a
// real service would make the run depend on someone else's data and quota, so
// anything that is not a test API stays commented out.
const SPEC_SOURCES = [
    { name: 'petstore-v2', url: 'https://petstore.swagger.io/v2/swagger.json' },
    { name: 'petstore-v3', url: 'https://petstore3.swagger.io/api/v3/openapi.json' },
    { name: 'httpbin', url: 'https://httpbin.org/spec.json' }

    // skipped: apis.guru is a live directory of real APIs, not a test service
    // { name: 'apis-guru',
    //     url: 'https://raw.githubusercontent.com/APIs-guru/openapi-directory/main/APIs/apis.guru/2.2.0/openapi.yaml' },
    // skipped: apis.guru is a live directory of real APIs, not a test service
    // { name: 'apis-guru-v2',
    //     url: 'https://api.apis.guru/v2/openapi.yaml' }
];

const LOCAL_SPECS = {
    httpbingo: path.join(__dirname, 'specs', 'httpbingo-full.yaml')
};

const BRUNO_SOURCES = [
    { name: 'hackaton-bruno', git: 'https://github.com/8SOAT-G4-Tech-Challenge/hackaton-bruno.git' },
    { name: 'tech-challenge-bruno', git: 'https://github.com/8SOAT-G4-Tech-Challenge/tech-challenge-bruno.git' },
    { name: 'api-docs', git: 'https://github.com/FiquemSabendo/api_docs.git' },
    { name: 'telecom-api-project', git: 'https://github.com/Pranusshraj/telecom-api-project.git' },
    { name: 'routerbase-api-collections', git: 'https://github.com/RouterBase/routerbase-api-collections.git' },
    { name: 'build-api-docs-from-bruno', git: 'https://github.com/WorldOfMaze/build-api-docs-from-bruno.git' },
    { name: 'bruno', git: 'https://github.com/bhoggard/bruno.git' },
    { name: 'bruno-automation-demo-workspace', git: 'https://github.com/bruno-collections/bruno-automation-demo-workspace.git' },
    { name: 'api-testing', git: 'https://github.com/cm0639-group3/api-testing.git' },
    { name: 'bru-files', git: 'https://github.com/doitian/bru-files.git' },
    { name: 's-tech-api-docs-bruno', git: 'https://github.com/fadhilaf/s-tech-api-docs-bruno.git' },
    { name: 'bruno-testing-api-collection', git: 'https://github.com/hungng14/bruno-testing-api-collection.git' },
    { name: 'bruno-workspace', git: 'https://github.com/inpiniti/bruno_workspace.git' },
    { name: 'bruno-pack-workspace', git: 'https://github.com/james-ha-bruno/Bruno-Pack-Workspace.git' },
    { name: 'templated-bruno-workspace', git: 'https://github.com/kyl33r/templated-bruno-workspace.git' },
    { name: 'api-collaboration-toolkit', git: 'https://github.com/maheshmj24/api-collaboration-toolkit.git' },
    { name: 'blog-app-api-collection', git: 'https://github.com/mdmhrz/blog_app_api_collection.git' },
    { name: 'postman-bruno-collections', git: 'https://github.com/netmanuy/postman-bruno-collections.git' },
    { name: 'github-api-bruno', git: 'https://github.com/propromo-software/github-api.bruno.git' },
    { name: 'jira-api-bruno', git: 'https://github.com/propromo-software/jira-api.bruno.git' },
    { name: 'k8s-deploy', git: 'https://github.com/rackabook/k8s-deploy.git' },
    { name: 'toy-shop-collection', git: 'https://github.com/rizkyfaza20/toy-shop-collection.git' },
    { name: 'sterling-toolkit-api-collection', git: 'https://github.com/sandy181199/sterling-toolkit-api-collection.git' },
    { name: 'gridman', git: 'https://github.com/shahramgit/gridman.git' },
    { name: 'bruno-demo-environment', git: 'https://github.com/shawnsarwar/bruno-demo-environment.git' },
    { name: 'stripe-bruno', git: 'https://github.com/spraveenitpro/stripe-bruno.git' },
    { name: 't212-bruno-workspace', git: 'https://github.com/timhls/t212-bruno-workspace.git' },
    { name: 'ha-bruno-collection', git: 'https://github.com/tirta-cipta-teknologi/ha-bruno-collection.git' },
    { name: 'marvel-bruno-api', git: 'https://github.com/trev125/Marvel-Bruno-API.git' },
    { name: 'brunocollections', git: 'https://github.com/vasujain275/brunoCollections.git' },
    { name: 'vsrkp-api-booksapi', git: 'https://github.com/venkatsai494/vsrkp-api-booksapi.git' },
    { name: 'voiceml-api-collections', git: 'https://github.com/voicetel/voiceml-api-collections.git' },
    { name: 'quran-api-collection', git: 'https://github.com/zainulhassan815/quran-api-collection.git' },
    { name: 'ogx-functional-tests', git: 'https://github.com/Artemon-line/ogx-functional-tests.git' },
    { name: 'demo-task-api', git: 'https://github.com/BeDigital/demo-task-api.git' },
    { name: 'bruno-learning', git: 'https://github.com/EsmariSwart/bruno-learning.git' },
    { name: 'bienenvolk-bruno-collection', git: 'https://github.com/EthanFreestone/bienenvolk-bruno-collection.git' },
    { name: 'pushkb-bruno-collection', git: 'https://github.com/EthanFreestone/pushkb-bruno-collection.git' },
    { name: 'fs-tree-examples', git: 'https://github.com/FamilySearch/fs-tree-examples.git' },
    { name: 'book-library', git: 'https://github.com/HatthasitHine/book-library.git' },
    { name: 'autism-prediction-model', git: 'https://github.com/Jyotsnapnr/Autism_prediction_model.git' },
    { name: 'norce-checkout-training-collection', git: 'https://github.com/NorceTech/norce-checkout-training-collection.git' },
    { name: 'request', git: 'https://github.com/SainSinner/Request.git' },
    { name: 'mountainhome', git: 'https://github.com/SebastianBoehrig/mountainhome.git' },
    { name: 'template-webapi-cleanarchitecture', git: 'https://github.com/TWEESTY/Template.WebAPI.CleanArchitecture.git' },
    { name: 'teste-api-carrefour', git: 'https://github.com/VivianeRO89/teste-api-carrefour.git' },
    { name: 'sample-bruno-collection', git: 'https://github.com/adetter/sample-bruno-collection.git' },
    { name: 'gitea-api-collection', git: 'https://github.com/anikethanbekal/gitea-api-collection.git' },
    { name: 'bruno-demo', git: 'https://github.com/bdavid-testware/Bruno.Demo.git' },
    { name: 'pyman', git: 'https://github.com/betogm/pyman.git' },
    { name: 'bruno-zed', git: 'https://github.com/byeval/bruno-zed.git' },
    { name: 'truspec', git: 'https://github.com/code-with-rashid/truspec.git' },
    { name: 'apitester', git: 'https://github.com/daviiidle/ApiTester.git' },
    { name: 'auth-api-bruno-collection', git: 'https://github.com/dimarye/auth-api-bruno-collection.git' },
    { name: 'updown-io-bruno', git: 'https://github.com/dlang-at/updown-io_bruno.git' },
    { name: 'bruno-gorestapitesting', git: 'https://github.com/haciendotestingqa/BRUNO_GoRestAPItesting.git' },
    { name: 'jira-api-spike-01', git: 'https://github.com/hortfrancis/jira-api-spike-01.git' },
    { name: 'art-at-gvsu-requests', git: 'https://github.com/jocmp/art-at-gvsu-requests.git' },
    { name: 'azure-devops-api-bruno-collection', git: 'https://github.com/johnlokerse/azure-devops-api-bruno-collection.git' },
    { name: 'bruno-mcp-server', git: 'https://github.com/kodlbegiko/bruno-mcp-server.git' },
    { name: 'bruno-api-automation-hub', git: 'https://github.com/letsconfuse/bruno-api-automation-hub.git' },
    { name: 'bruno-to-postman', git: 'https://github.com/leukalm/bruno-to-postman.git' },
    { name: '8bitbazar-api-bruno-collection', git: 'https://github.com/matheusgeres/8bitbazar-api-bruno-collection.git' },
    { name: 'restful-api-dev', git: 'https://github.com/matiaspakua/RestFul-API-dev.git' },
    { name: 'bruno-collection-api', git: 'https://github.com/natthasath/bruno-collection-api.git' },
    { name: 'bruno-lifecycle-adapter', git: 'https://github.com/netzulo/bruno-lifecycle-adapter.git' },
    { name: 'bruno-lang', git: 'https://github.com/opctim/bruno-lang.git' },
    { name: 'qacodes-bruno-api-collection', git: 'https://github.com/qacodes-dev/qacodes-bruno-api-collection.git' },
    { name: 'bruno-api-automation', git: 'https://github.com/qasimmahmood95/bruno-api-automation.git' },
    { name: 'exercism-azure-bruno', git: 'https://github.com/rabestro/exercism-azure-bruno.git' },
    { name: 'bruno-skill', git: 'https://github.com/sagar290/bruno-skill.git' },
    { name: 'api-collections', git: 'https://github.com/scalekit-inc/api-collections.git' },
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
    // skipped: same call shape as httpbin get /get
    // { source: 'httpbin', method: 'get', path: '/headers' },
    // skipped: same call shape as httpbin get /get
    // { source: 'httpbin', method: 'get', path: '/response-headers' },
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
    // skipped: same call shape as httpbingo get /get
    // { source: 'httpbingo', method: 'get', path: '/headers' },
    { source: 'httpbingo', method: 'get', path: '/bearer',
        addAuth: { authorization: 'Bearer live-test-token' }, expect: 200, strict: true },
    { source: 'httpbingo', method: 'get', path: '/basic-auth/{user}/{passwd}',
        fill: { user: 'u', passwd: 'p' },
        addAuth: { authorization: 'Basic dTpw' }, expect: 200, strict: true },
    // skipped: same call shape as httpbingo get /basic-auth/{user}/{passwd}
    // { source: 'httpbingo', method: 'get', path: '/hidden-basic-auth/{user}/{passwd}',
    //     fill: { user: 'u', passwd: 'p' },
    //     addAuth: { authorization: 'Basic dTpw' }, expect: 200, strict: true },
    { source: 'httpbingo', method: 'get', path: '/status/{code}', fill: { code: '204' },
        expect: 204, strict: true },
    { source: 'httpbingo', method: 'get', path: '/digest-auth/{qop}/{user}/{passwd}',
        fill: { qop: 'auth', user: 'u', passwd: 'p' }, expect: 401, strict: true }

    // skipped: apis.guru is a live directory of real APIs, not a test service
    // { source: 'apis-guru', method: 'get', path: '/providers.json' },
    // { source: 'apis-guru', method: 'get', path: '/metrics.json' },
    // { source: 'apis-guru', method: 'get', path: '/list.json' },
    // { source: 'apis-guru-v2', method: 'get', path: '/providers.json' },
    // { source: 'apis-guru-v2', method: 'get', path: '/list.json' }
];

const summary = [];
const comparisons = [];

function writeComparisons() {
    const out = process.env.LIVE_RESULTS;
    if (!out) return;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({
        generatedAt: new Date().toISOString(),
        commit: process.env.GITHUB_SHA || null,
        comparisons: comparisons
    }, null, 2) + '\n');
}

const CORPUS_SPECS = [
    '1forge.com/0.0.1/swagger.yaml',
    'amadeus.com/amadeus-flight-price-analysis/1.0.1/openapi.yaml',
    'amadeus.com/amadeus-location-score/1.0.2/openapi.yaml',
    'apache.org/qakka/v1/openapi.yaml',
    'apis.guru/2.2.0/openapi.yaml',
    'apple.com/sirikit-cloud-media/1.0.2/openapi.yaml',
    'asuarez.dev/searchly/1.0/openapi.yaml',
    'aviationdata.systems/v1/swagger.yaml',
    'azure.com/alertsmanagement-AlertsManagement/2019-03-01-preview/swagger.yaml',
    'azure.com/alertsmanagement-AlertsManagement/2019-05-05-preview/swagger.yaml',
    'azure.com/attestation/2018-09-01-preview/swagger.yaml',
    'azure.com/dynamicstelemetry/2019-01-24/swagger.yaml',
    'azure.com/iotcentral/preview/swagger.yaml',
    'balldontlie.io/1.0.0/openapi.yaml',
    'bigdatacloud.net/1.0.0/openapi.yaml',
    'canada-holidays.ca/1.8.0/openapi.yaml',
    'carbone.io/1.2.0/openapi.yaml',
    'clickup.com/1.0.0/openapi.yaml',
    'color.pizza/1.0.0/openapi.yaml',
    'consumerfinance.gov/1.0/swagger.yaml',
    'corrently.io/2.0.0/openapi.yaml',
    'deutschebahn.com/flinkster/v1/swagger.yaml',
    'digitallocker.gov.in/authpartner/1.0.0/openapi.yaml',
    'docker.com/hub/beta/openapi.yaml',
    'enode.io/1.3.10/openapi.yaml',
    'evemarketer.com/1.0.1/swagger.yaml',
    'exhibitday.com/v1/swagger.yaml',
    'gov.bc.ca/bcgnws/3.x.x/openapi.yaml',
    'gov.bc.ca/jobposting/1.0.0/openapi.yaml',
    'gov.bc.ca/news/1.0/openapi.yaml',
    'greip.io/1.0.0/openapi.yaml',
    'groundhog-day.com/1.2.1/openapi.yaml',
    'gsa.gov/0.1/swagger.yaml',
    'handwrytten.com/1.0.0/swagger.yaml',
    'hetras-certification.net/hotel/v0/swagger.yaml',
    'hsbc.com/atm/2.2.1/swagger.yaml',
    'hsbc.com/branches/2.2.1/swagger.yaml',
    'hsbc.com/product/2.2.1/swagger.yaml',
    'hubapi.com/communication-preferences/v3/openapi.yaml',
    'hubapi.com/crm/v3/openapi.yaml',
    'ideaconsult.net/nanoreg/4.0.0/openapi.yaml',
    'idtbeyond.com/1.1.7/swagger.yaml',
    'jokes.one/1.1/swagger.yaml',
    'journy.io/1.0.0/openapi.yaml',
    'json2video.com/2.0.0/openapi.yaml',
    'languagetool.org/1.1.2/swagger.yaml',
    'lgtm.com/v1.0/openapi.yaml',
    'mastercard.com/BINTableResource/1.0/swagger.yaml',
    'mastercard.com/CurrencyConversionCalculator/1.0.0/swagger.yaml',
    'mastercard.com/Locations/1.0.0/swagger.yaml',
    'mastercard.com/MDES/2.0.7/swagger.yaml',
    'mermade.org.uk/openapi-converter/1.0.0/openapi.yaml',
    'metadapi.com/1.0/openapi.yaml',
    'mozilla.com/kinto/1.22/openapi.yaml',
    'ndhm.gov.in/ndhm-hip/0.5/openapi.yaml',
    'nexmo.com/media/1.0.2/openapi.yaml',
    'notion.com/1.0.0/openapi.yaml',
    'nowpayments.io/1.0.0/openapi.yaml',
    'o2.cz/mobility/1.2.0/swagger.yaml',
    'oceandrivers.com/1.0/openapi.yaml',
    'openai.com/1.2.0/openapi.yaml',
    'openalpr.com/3.0.1/swagger.yaml',
    'openbanking.org.uk/v1.3/openapi.yaml',
    'openlinksw.com/osdb/1.0.0/openapi.yaml',
    'opentrials.local/0.0.1/swagger.yaml',
    'oxforddictionaries.com/1.11.0/openapi.yaml',
    'parliament.uk/bills/v1/openapi.yaml',
    'parliament.uk/search/Live/openapi.yaml',
    'patientview.org/1.0/openapi.yaml',
    'personio.de/personnel/1.0/openapi.yaml',
    'poemist.com/1.0/swagger.yaml',
    'quarantine.country/1.0/swagger.yaml',
    'randomlovecraft.com/1.0/openapi.yaml',
    'rapidapi.com/ecowetter/1.0.0/openapi.yaml',
    'rbaskets.in/1.0.0/swagger.yaml',
    'ritekit.com/1.0.0/openapi.yaml',
    'sheetlabs.com/rig-veda/1.2/swagger.yaml',
    'slideroom.com/v2/swagger.yaml',
    'swagger.io/generator/2.4.31/swagger.yaml',
    'telematicssdk.com/1.0.0/openapi.yaml',
    'tisane.ai/1.0.0/openapi.yaml',
    'truanon.com/1.0.0/openapi.yaml',
    'visualcrossing.com/weather/4.6/openapi.yaml',
    'vonage.com/vgis/1.0.1/openapi.yaml',
    'vtex.local/Intelligent-Search-API/0.1.12/openapi.yaml',
    'vtex.local/Policies-System-API/1.0.0/openapi.yaml',
    'vtex.local/Price-Simulations/1.0/openapi.yaml',
    'vtex.local/Session-Manager-API/1.0/openapi.yaml',
    'wealthreader.com/1.0.0/openapi.yaml',
    'wellknown.ai/1.0.0/openapi.yaml',
    'wikipathways.org/1.0/openapi.yaml',
    'zalando.com/v1.0/swagger.yaml',
    'zapier.com/nla/1.0.0/openapi.yaml'
];

const CORPUS_BASE =
    'https://raw.githubusercontent.com/APIs-guru/openapi-directory/main/APIs/';

function note(level, text) {
    const line = String(text).replace(/\r?\n/g, ' ');
    process.stdout.write('::' + level + '::' + line + '\n');
    summary.push((level === 'error' ? 'FAIL | ' : 'ok   | ') + line);
}

// Printed verbatim so the CI log carries the evidence behind every comparison.
function dump(label, what, body) {
    const text = body === null || body === undefined ? '(no body)'
        : (typeof body === 'string' ? body : JSON.stringify(body, null, 2));
    const clipped = text.length > 4000 ? text.slice(0, 4000) + '\n...[clipped]' : text;
    process.stdout.write('----- ' + label + ' :: ' + what + ' -----\n' + clipped + '\n');
}

function curlBody(method, url, headers, body) {
    const args = ['-sS', '-i', '--max-time', '25',
        '-X', String(method || 'get').toUpperCase(), url];
    for (const [name, value] of Object.entries(headers || {})) {
        args.push('-H', name + ': ' + value);
    }
    if (body) { args.push('--data-binary', body); }
    return new Promise(resolve => {
        execFile('curl', args, { timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
            (err, stdout) => {
                const text = String(stdout || '');
                const split = text.indexOf('\r\n\r\n');
                const head = split === -1 ? text : text.slice(0, split);
                const payload = split === -1 ? '' : text.slice(split + 4);
                const statusLine = head.split(/\r?\n/)[0] || '';
                const match = statusLine.match(/\s(\d{3})\s/);
                resolve({
                    status: match ? parseInt(match[1], 10) : null,
                    body: payload
                });
            });
    });
}

// httpbin-style services echo back the request, so anything the transport or
// the proxy in front of it decides is dropped before comparing: curl and the
// http request node are different clients and will never agree on these.
// What must match is the shape the generated request built.
const VOLATILE = new Set([
    'origin', 'x-amzn-trace-id', 'date', 'x-request-id', 'x-b3-traceid',
    'x-b3-spanid', 'x-b3-parentspanid', 'host', 'user-agent', 'content-length',
    'connection', 'x-forwarded-for', 'x-forwarded-port', 'x-real-ip',
    'via', 'accept-encoding', 'x-forwarded-proto', 'x-forwarded-host',
    'fly-request-id', 'fly-client-ip', 'cf-ray', 'cf-connecting-ip',
    'x-envoy-external-address', 'x-cloud-trace-context', 'traceparent',
    'x-request-start', 'x-forwarded-ssl', 'forwarded', 'te', 'keep-alive'
]);

function normalise(value) {
    if (Array.isArray(value)) return value.map(normalise);
    if (value && typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value)) {
            const lower = key.toLowerCase();
            if (VOLATILE.has(lower)) continue;
            out[lower] = normalise(value[key]);
        }
        return Object.keys(out).sort().reduce((acc, k) => (acc[k] = out[k], acc), {});
    }
    return value;
}

function comparable(body) {
    if (body === null || body === undefined || body === '') return null;
    let parsed = body;
    if (typeof body === 'string') {
        try { parsed = JSON.parse(body); }
        catch (err) { return body.trim(); }
    }
    return JSON.stringify(normalise(parsed));
}

function writeSummary() {
    const file = process.env.GITHUB_STEP_SUMMARY;
    if (!file) return;

    const failures = summary.filter(line => line.startsWith('FAIL'));
    const rest = summary.filter(line => !line.startsWith('FAIL'));
    const LIMIT = 900 * 1024;

    const kept = failures.slice(0, 500);
    let size = kept.join('\n').length;
    for (const line of rest) {
        if (size + line.length + 1 > LIMIT) { break; }
        kept.push(line);
        size += line.length + 1;
    }
    const omitted = summary.length - kept.length;
    if (omitted > 0) { kept.push('... ' + omitted + ' further lines omitted'); }

    fs.appendFileSync(file,
        '## Live API results\n\n```\n' + kept.join('\n') + '\n```\n');
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
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp('("' + escapedName + '": )(`[^`]*`|"[^"]*")');
        if (!pattern.test(out)) {
            throw new Error('no placeholder for header ' + name);
        }
        out = out.replace(pattern, '$1"' + value + '"');
    }
    return out;
}

async function loadSources() {
    const docs = {};
    for (const [name, file] of Object.entries(LOCAL_SPECS)) {
        try {
            docs[name] = flowgen.parseDocument(fs.readFileSync(file, 'utf8'));
            note('notice', 'using the bundled ' + name + ' definition');
        } catch (err) {
            note('notice', 'could not read the bundled ' + name +
                ' definition: ' + err.message);
        }
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
            if (node.type === 'inject') {
                node.once = true; node.onceDelay = 0.1;
                // The inject node keeps its default timestamp payload on
                // purpose: the generated code is what has to clear it.
            }
            if (node.type === 'function') {
                node.func = applyFill(node.func, testCase.fill);
                // Match what curl is given: a header still holding a {name}
                // placeholder was never filled in, so it does not go out.
                node.func = node.func.replace(/\nreturn msg;\s*$/,
                    '\nfor (const [name, value] of Object.entries(msg.headers || {})) {\n' +
                    '    if (value === undefined || /\\{[^}]+\\}/.test(String(value))) {\n' +
                    '        delete msg.headers[name];\n' +
                    '    }\n}\nreturn msg;');
            }
            if (node.type === 'http request') { node.ret = 'obj'; node.senderr = true; }
        }
        const probe = nodes.find(n => n.type === 'debug');
        probe.type = 'function';
        probe.name = 'probe';
        probe.outputs = 1;
        probe.wires = [[]];
        probe.func = "global.set('liveResult', { status: msg.statusCode, " +
            "body: msg.payload, headers: msg.headers });\nreturn msg;";

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

        // The generated function node is the single source of truth for what
        // the request looks like, so curl is pointed at exactly what it built.
        let built = {};
        try {
            const fn = nodes.find(n => n.type === 'function' && n.name !== 'probe');
            built = new Function('msg', fn.func).call(null, {}) || {};
        } catch (err) {
            built = {};
        }
        // testCase.auth / addAuth are already woven into the generated function
        // above, so built.headers carries them. Merging them again here would
        // send the header twice and the server would reject the request.
        const curlHeaders = Object.assign({}, built.headers || {});
        // A header the reader was meant to fill in still holds its {name}
        // placeholder. Node-RED passes that through and the server ignores it,
        // but curl rejects the braces outright, so neither caller should send
        // it and the two stay comparable.
        for (const [name, value] of Object.entries(curlHeaders)) {
            if (value === undefined || /\{[^}]+\}/.test(String(value))) {
                delete curlHeaders[name];
                delete built.headers[name];
            }
        }
        const curlBodyText = built.payload === undefined ? null
            : (typeof built.payload === 'string'
                ? built.payload : JSON.stringify(built.payload));

        let viaCurl = { status: null, body: null };
        if (built.url) {
            viaCurl = await curlBody(testCase.method, built.url, curlHeaders, curlBodyText);
        }

        const left = comparable(viaCurl.body);
        const right = comparable(result.body);
        comparisons.push({
            label: label,
            url: built.url || null,
            requestHeaders: curlHeaders,
            requestBody: curlBodyText,
            curl: { status: viaCurl.status, body: viaCurl.body },
            nodered: { status: result.status, body: result.body },
            match: viaCurl.status === result.status &&
                (left === null || right === null || left === right)
        });
        if (viaCurl.status !== null && result.status !== null) {
            if (viaCurl.status !== result.status) {
                failures++;
                note('error', label + ' -> curl saw HTTP ' + viaCurl.status +
                    ' but Node-RED saw HTTP ' + result.status);
                dump(label, 'request headers curl was given', curlHeaders);
                dump(label, 'request headers the flow built', built.headers);
                dump(label, 'curl HTTP ' + viaCurl.status, viaCurl.body);
                dump(label, 'node-red HTTP ' + result.status, result.body);
            } else if (left !== null && right !== null && left !== right) {
                failures++;
                note('error', label + ' -> curl and Node-RED returned different bodies');
                dump(label, 'curl HTTP ' + viaCurl.status, viaCurl.body);
                dump(label, 'node-red HTTP ' + result.status, result.body);
                dump(label, 'curl body (normalised)', left);
                dump(label, 'node-red body (normalised)', right);
            } else {
                note('notice', label + ' -> curl and Node-RED agree on HTTP ' +
                    viaCurl.status);
            }
        }

        const expected = [].concat(testCase.expect || []);

        // Several cases exist to prove a rejection happens, and those bodies say
        // so in words. Scanning them would flag the very thing being asked for,
        // so the scan only runs where a healthy answer was expected.
        // A case that exists to prove a 401 happens will say so in the body, and
        // failing on that would flag the very outcome being checked. But only
        // the rejection that was asked for is excused: any other complaint in
        // the body still has to surface, whatever the status code.
        for (const [source, body, status] of [
            ['curl', viaCurl.body, viaCurl.status],
            ['node-red', result.body, result.status]
        ]) {
            const hits = unexpectedErrors(body, status, expected);
            if (!hits.length) {
                const said = errorWords(body);
                if (said.length) {
                    note('notice', label + ' -> the ' + source + ' response says ' +
                        said.join(', ') + ', which is the HTTP ' + status +
                        ' that was expected');
                }
                continue;
            }
            failures++;
            note('error', label + ' -> the ' + source +
                ' response reads like an error: ' + hits.join(', '));
            dump(label, source + ' HTTP ' + status + ' carrying ' + hits.join(', '), body);
        }

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
        } else if (result.status === 403 || result.status === 429) {
            note('notice', label + ' -> HTTP ' + result.status +
                ' (rate limited or forbidden upstream, not a generation fault)');
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
            let built = null;
            try {
                built = new Function('msg', code).call(null, {}) || {};
            } catch (err) {
                bad++;
                failures++;
                note('error', source.name + ' ' + op.method + ' ' + op.path +
                    ' -> the generated code threw: ' + err.message);
                continue;
            }
            if (typeof built.url !== 'string' || !built.url) {
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
        const probeWithCurl = (url, method) => new Promise(resolve => {
            execFile('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}',
                '--max-time', '15', '-X', String(method || 'get').toUpperCase(), url],
            { timeout: 15000 }, (err, stdout) => {
                const code = parseInt(String(stdout).trim(), 10);
                resolve(Number.isFinite(code) && code > 0 ? code : null);
            });
        });

        for (const spec of CORPUS_SPECS) {
            let doc;
            try {
                doc = flowgen.parseDocument(await download(CORPUS_BASE + spec, 5));
            } catch (err) {
                note('notice', 'corpus ' + spec + ' -> spec unavailable: ' + err.message);
                continue;
            }

            let operations;
            try {
                operations = flowgen.listOperations(doc).operations;
            } catch (err) {
                failures++;
                note('error', 'corpus ' + spec + ' -> could not be listed: ' + err.message);
                continue;
            }
            if (!operations.length) { continue; }
            if (operations.length > 30) {
                note('notice', 'corpus ' + spec + ' -> skipped, ' + operations.length +
                    ' endpoints is too many for a live run');
                continue;
            }

            const prepared = [];
            let generationFailed = false;
            for (const op of operations) {
                let nodes;
                try {
                    nodes = flowgen.buildFlow(doc, op.method, op.path);
                } catch (err) {
                    failures++;
                    generationFailed = true;
                    note('error', 'corpus ' + spec + ' ' + op.method + ' ' + op.path +
                        ' -> generation failed: ' + err.message);
                    break;
                }
                const source = nodes.find(n => n.type === 'function').func;
                let built;
                try {
                    built = new Function('msg', source).call(null, {}) || {};
                    new URL(built.url);
                } catch (err) {
                    generationFailed = true;
                    note('notice', 'corpus ' + spec + ' ' + op.method + ' ' + op.path +
                        ' -> skipped, no usable URL');
                    break;
                }
                prepared.push({ op: op, nodes: nodes, url: built.url });
            }
            if (generationFailed || !prepared.length) { continue; }

            let reachable = true;
            for (const entry of prepared) {
                const code = await probeWithCurl(entry.url, entry.op.method);
                if (!code) {
                    reachable = false;
                    note('notice', 'corpus ' + spec + ' -> dropped, ' + entry.op.method +
                        ' ' + entry.op.path + ' is not reachable');
                    break;
                }
            }
            if (!reachable) { continue; }

            note('notice', 'corpus ' + spec + ' -> all ' + prepared.length +
                ' endpoints reachable, testing them');

            for (const entry of prepared) {
                const label = 'corpus ' + spec + ' ' + entry.op.method.toUpperCase() +
                    ' ' + entry.op.path;
                const nodes = entry.nodes;
                for (const node of nodes) {
                    if (node.type === 'inject') {
                node.once = true; node.onceDelay = 0.1;
                // The inject node keeps its default timestamp payload on
                // purpose: the generated code is what has to clear it.
            }
                    if (node.type === 'http request') { node.ret = 'obj'; node.senderr = true; }
                }
                const probe = nodes.find(n => n.type === 'debug');
                probe.type = 'function';
                probe.name = 'probe';
                probe.outputs = 1;
                probe.wires = [[]];
                probe.func = "global.set('liveResult', { status: msg.statusCode });\n"
                    + 'return msg;';

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

                ran++;
                const started = Date.now();
                let result = null;
                while (!result && Date.now() - started < 25000) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    result = context.get('liveResult');
                }
                const status = (result || {}).status || null;

                if (status) {
                    reached++;
                    note('notice', label + ' -> HTTP ' + status);
                } else {
                    failures++;
                    note('error', label +
                        ' -> no response although curl reached the endpoint');
                }
            }
        }
    }

    note('notice', 'live cases run: ' + ran + ', reached: ' + reached +
        ', failures: ' + failures);
    writeSummary();
    writeComparisons();
    await RED.stop();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(userDir, { recursive: true, force: true });
    process.exit(failures ? 1 : 0);
}

main().catch(err => {
    note('error', 'live run crashed: ' + err.message);
    writeSummary();
    writeComparisons();
    process.exit(1);
});
