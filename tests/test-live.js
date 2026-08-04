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
    { spec: 'zoomconnect.com/1/swagger.yaml', path: '/api/rest/v1/contacts/all' },
    { spec: 'zoomconnect.com/1/swagger.yaml', path: '/api/rest/v1/groups/all' },
    { spec: 'rumble.run/2.15.0/openapi.yaml', path: '/releases/agent/version' },
    { spec: 'rumble.run/2.15.0/openapi.yaml', path: '/releases/platform/version' },
    { spec: 'rumble.run/2.15.0/openapi.yaml', path: '/releases/scanner/version' },
    { spec: 'data2crm.com/1/swagger.yaml', path: '/application/entity/account/describe' },
    { spec: 'data2crm.com/1/swagger.yaml', path: '/application/entity/attachment/describe' },
    { spec: 'data2crm.com/1/swagger.yaml', path: '/application/entity/call/describe' },
    { spec: 'ndhm.gov.in/ndhm-hip/0.5/openapi.yaml', path: '/v0.5/.well-known/openid-configuration' },
    { spec: 'ndhm.gov.in/ndhm-hip/0.5/openapi.yaml', path: '/v0.5/certs' },
    { spec: 'ndhm.gov.in/ndhm-hip/0.5/openapi.yaml', path: '/v0.5/heartbeat' },
    { spec: 'ndhm.gov.in/ndhm-hiu/0.5/openapi.yaml', path: '/v0.5/heartbeat' },
    { spec: 'contribly.com/1.0.0/openapi.yaml', path: '/artifact-formats' },
    { spec: 'contribly.com/1.0.0/openapi.yaml', path: '/change-log' },
    { spec: 'contribly.com/1.0.0/openapi.yaml', path: '/contribution-refinement-types' },
    { spec: 'consumerfinance.gov/1.0/swagger.yaml', path: '/data' },
    { spec: 'consumerfinance.gov/1.0/swagger.yaml', path: '/data/hmda' },
    { spec: 'bigdatacloud.net/1.0.0/openapi.yaml', path: '/data/ip-geolocation-full' },
    { spec: 'bigdatacloud.net/1.0.0/openapi.yaml', path: '/data/ip-geolocation-with-confidence' },
    { spec: 'thebluealliance.com/3.8.2/openapi.yaml', path: '/status' },
    { spec: 'avaza.com/v1/swagger.yaml', path: '/api/Currency' },
    { spec: 'zuora.com/2021-08-20/openapi.yaml', path: '/v1/accounting-codes' },
    { spec: 'zuora.com/2021-08-20/openapi.yaml', path: '/v1/accounting-periods' },
    { spec: 'zuora.com/2021-08-20/openapi.yaml', path: '/v1/catalog/products' },
    { spec: 'asuarez.dev/searchly/1.0/openapi.yaml', path: '/similarity/by_song' },
    { spec: 'asuarez.dev/searchly/1.0/openapi.yaml', path: '/song/search' },
    { spec: 'openai.com/1.2.0/openapi.yaml', path: '/files' },
    { spec: 'openai.com/1.2.0/openapi.yaml', path: '/fine-tunes' },
    { spec: 'openai.com/1.2.0/openapi.yaml', path: '/models' },
    { spec: 'httpbin.org/0.9.2/openapi.yaml', path: '/anything' },
    { spec: 'httpbin.org/0.9.2/openapi.yaml', path: '/brotli' },
    { spec: 'httpbin.org/0.9.2/openapi.yaml', path: '/cache' },
    { spec: 'apis.guru/2.2.0/openapi.yaml', path: '/list.json' },
    { spec: 'apis.guru/2.2.0/openapi.yaml', path: '/metrics.json' },
    { spec: 'apis.guru/2.2.0/openapi.yaml', path: '/providers.json' },
    { spec: 'wikipathways.org/1.0/openapi.yaml', path: '/listOrganisms' },
    { spec: 'lgtm.com/v1.0/openapi.yaml', path: '/openapi' },
    { spec: 'quarantine.country/1.0/swagger.yaml', path: '/summary/latest' },
    { spec: 'brex.io/2021.12/openapi.yaml', path: '/api/v1/company/monitoring/changeTypes' },
    { spec: 'brex.io/2021.12/openapi.yaml', path: '/api/v1/company/monitoring/list' },
    { spec: 'brex.io/2021.12/openapi.yaml', path: '/api/v1/company/notification/list' },
    { spec: 'rbaskets.in/1.0.0/swagger.yaml', path: '/api/version' },
    { spec: 'metadapi.com/1.0/openapi.yaml', path: '/zipc/v1' },
    { spec: 'metadapi.com/1.0/openapi.yaml', path: '/zipc/v1/distance' },
    { spec: 'greip.io/1.0.0/openapi.yaml', path: '/ASNLookup' },
    { spec: 'greip.io/1.0.0/openapi.yaml', path: '/BINLookup' },
    { spec: 'greip.io/1.0.0/openapi.yaml', path: '/BulkLookup' },
    { spec: 'openbanking.org.uk/v1.3/openapi.yaml', path: '/atms' },
    { spec: 'openbanking.org.uk/v1.3/openapi.yaml', path: '/branches' },
    { spec: 'openbanking.org.uk/v1.3/openapi.yaml', path: '/business-current-accounts' },
    { spec: 'clickup.com/1.0.0/openapi.yaml', path: '/questions' },
    { spec: 'deutschebahn.com/flinkster/v1/swagger.yaml', path: '/index' },
    { spec: 'billbee.io/v1/openapi.yaml', path: '/api/v1/automaticprovision/termsinfo' },
    { spec: 'billbee.io/v1/openapi.yaml', path: '/api/v1/cloudstorages' },
    { spec: 'billbee.io/v1/openapi.yaml', path: '/api/v1/enums/orderstates' },
    { spec: 'mastercard.com/CurrencyConversionCalculator/1.0.0/swagger.yaml', path: '/settlement-currencies' },
    { spec: 'mastercard.com/MDES/2.0.7/swagger.yaml', path: '/systemstatus' },
    { spec: 'mastercard.com/Locations/1.0.0/swagger.yaml', path: '/atms/v1/country' },
    { spec: 'mastercard.com/Locations/1.0.0/swagger.yaml', path: '/merchants/v1/category' },
    { spec: 'mastercard.com/BINTableResource/1.0/swagger.yaml', path: '/binlisting' },
    { spec: 'truanon.com/1.0.0/openapi.yaml', path: '/api/get_profile' },
    { spec: 'bigoven.com/partner/openapi.yaml', path: '/grocerylist' },
    { spec: 'bigoven.com/partner/openapi.yaml', path: '/me' },
    { spec: 'bigoven.com/partner/openapi.yaml', path: '/me/preferences/options' },
    { spec: 'apple.com/sirikit-cloud-media/1.0.2/openapi.yaml', path: '/configuration' },
    { spec: 'handwrytten.com/1.0.0/swagger.yaml', path: '/cards/list' },
    { spec: 'handwrytten.com/1.0.0/swagger.yaml', path: '/countries/list' },
    { spec: 'handwrytten.com/1.0.0/swagger.yaml', path: '/fonts/list' },
    { spec: 'groundhog-day.com/1.2.1/openapi.yaml', path: '/api/v1' },
    { spec: 'groundhog-day.com/1.2.1/openapi.yaml', path: '/api/v1/groundhogs' },
    { spec: 'groundhog-day.com/1.2.1/openapi.yaml', path: '/api/v1/spec' },
    { spec: 'taxamo.com/1/swagger.yaml', path: '/api/v1/dictionaries/currencies' },
    { spec: 'taxamo.com/1/swagger.yaml', path: '/api/v1/dictionaries/product_types' },
    { spec: 'taxamo.com/1/swagger.yaml', path: '/api/v1/geoip' },
    { spec: 'aviationdata.systems/v1/swagger.yaml', path: '/v1/country_list' },
    { spec: 'sheetlabs.com/rig-veda/1.2/swagger.yaml', path: '/resources' },
    { spec: 'zapier.com/nla/1.0.0/openapi.yaml', path: '/api/v1/check/' },
    { spec: 'zapier.com/nla/1.0.0/openapi.yaml', path: '/api/v1/configuration-link/' },
    { spec: 'zapier.com/nla/1.0.0/openapi.yaml', path: '/api/v1/exposed/' },
    { spec: 'chaingateway.io/1.0.0/openapi.yaml', path: '/v2/bitcoin/blocks/number' },
    { spec: 'chaingateway.io/1.0.0/openapi.yaml', path: '/v2/bitcoin/fees' },
    { spec: 'chaingateway.io/1.0.0/openapi.yaml', path: '/v2/bitcoin/info' },
    { spec: 'sinao.app/1.1.0/openapi.yaml', path: '/me' },
    { spec: 'sinao.app/1.1.0/openapi.yaml', path: '/ping' },
    { spec: 'sinao.app/1.1.0/openapi.yaml', path: '/refresh' },
    { spec: 'reverb.com/3.0/openapi.yaml', path: '/articles/categories' },
    { spec: 'reverb.com/3.0/openapi.yaml', path: '/categories' },
    { spec: 'reverb.com/3.0/openapi.yaml', path: '/categories/flat' },
    { spec: 'watchful.li/1.0.0/swagger.yaml', path: '/audits/metadata' },
    { spec: 'watchful.li/1.0.0/swagger.yaml', path: '/extensions/metadata' },
    { spec: 'watchful.li/1.0.0/swagger.yaml', path: '/feedbacks/metadata' },
    { spec: 'microsoft.com/graph/1.0.1/openapi.yaml', path: '/admin' },
    { spec: 'microsoft.com/graph/1.0.1/openapi.yaml', path: '/admin/serviceAnnouncement' },
    { spec: 'microsoft.com/graph/1.0.1/openapi.yaml', path: '/appCatalogs' },
    { spec: 'microsoft.com/cognitiveservices-Training/2.0/openapi.yaml', path: '/domains' },
    { spec: 'microsoft.com/cognitiveservices-Training/2.0/openapi.yaml', path: '/projects' },
    { spec: 'microsoft.com/cognitiveservices-Training/1.2/openapi.yaml', path: '/account' },
    { spec: 'microsoft.com/graph-beta/1.0.1/openapi.yaml', path: '/admin/edge' },
    { spec: 'microsoft.com/graph-beta/1.0.1/openapi.yaml', path: '/admin/edge/internetExplorerMode' },
    { spec: 'microsoft.com/graph-beta/1.0.1/openapi.yaml', path: '/admin/reportSettings' },
    { spec: 'idtbeyond.com/1.1.7/swagger.yaml', path: '/iatu/balance' },
    { spec: 'idtbeyond.com/1.1.7/swagger.yaml', path: '/iatu/charges/reports/all' },
    { spec: 'idtbeyond.com/1.1.7/swagger.yaml', path: '/iatu/charges/reports/all.csv' },
    { spec: 'mermade.org.uk/openapi-converter/1.0.0/openapi.yaml', path: '/badge' },
    { spec: 'mermade.org.uk/openapi-converter/1.0.0/openapi.yaml', path: '/convert' },
    { spec: 'mermade.org.uk/openapi-converter/1.0.0/openapi.yaml', path: '/status' },
    { spec: '1forge.com/0.0.1/swagger.yaml', path: '/quotes' },
    { spec: '1forge.com/0.0.1/swagger.yaml', path: '/symbols' },
    { spec: 'shutterstock.com/1.1.32/openapi.yaml', path: '/v2/oauth/authorize' },
    { spec: 'shutterstock.com/1.1.32/openapi.yaml', path: '/v2/test' },
    { spec: 'medium.com/1.0/openapi.yaml', path: '/' },
    { spec: 'braze.com/1.0.0/openapi.yaml', path: '/campaigns/data_series' },
    { spec: 'braze.com/1.0.0/openapi.yaml', path: '/campaigns/details' },
    { spec: 'braze.com/1.0.0/openapi.yaml', path: '/campaigns/list' },
    { spec: 'linode.com/4.151.1/openapi.yaml', path: '/databases/engines' },
    { spec: 'linode.com/4.151.1/openapi.yaml', path: '/databases/types' },
    { spec: 'linode.com/4.151.1/openapi.yaml', path: '/linode/kernels' },
    { spec: 'agco-ats.com/v1/openapi.yaml', path: '/api/v2/AftermarketServices/Certificates' },
    { spec: 'agco-ats.com/v1/openapi.yaml', path: '/api/v2/AftermarketServices/Hello' },
    { spec: 'agco-ats.com/v1/openapi.yaml', path: '/api/v2/Authentication/IsAlive' },
    { spec: 'tcgdex.net/2.0.0/openapi.yaml', path: '/cards' },
    { spec: 'tcgdex.net/2.0.0/openapi.yaml', path: '/categories' },
    { spec: 'tcgdex.net/2.0.0/openapi.yaml', path: '/dex-ids' },
    { spec: 'hetzner.cloud/1.0.0/openapi.yaml', path: '/pricing' },
    { spec: 'twitter.com/current/2.62/openapi.yaml', path: '/2/openapi.json' },
    { spec: 'twitter.com/legacy/1.1/swagger.yaml', path: '/friendships/lookup.json' },
    { spec: 'twitter.com/legacy/1.1/swagger.yaml', path: '/help/configuration.json' },
    { spec: 'twitter.com/legacy/1.1/swagger.yaml', path: '/help/languages.json' },
    { spec: 'apache.org/qakka/v1/openapi.yaml', path: '/queues' },
    { spec: 'apache.org/qakka/v1/openapi.yaml', path: '/status' },
    { spec: 'hetras-certification.net/hotel/v0/swagger.yaml', path: '/api/hotel/v0/hotels' },
    { spec: 'amadeus.com/amadeus-location-score/1.0.2/openapi.yaml', path: '/location/analytics/category-rated-areas' },
    { spec: 'amadeus.com/amadeus-flight-price-analysis/1.0.1/openapi.yaml', path: '/analytics/itinerary-price-metrics' },
    { spec: 'uebermaps.com/2.0/swagger.yaml', path: '/collaborator_invitations' },
    { spec: 'uebermaps.com/2.0/swagger.yaml', path: '/maps' },
    { spec: 'uebermaps.com/2.0/swagger.yaml', path: '/respot_maps' },
    { spec: 'apacta.com/0.0.42/openapi.yaml', path: '/activities' },
    { spec: 'apacta.com/0.0.42/openapi.yaml', path: '/integrations' },
    { spec: 'apacta.com/0.0.42/openapi.yaml', path: '/integrations/contactsSync' },
    { spec: 'vtex.local/Policies-System-API/1.0.0/openapi.yaml', path: '/api/policy-engine/policies' },
    { spec: 'vtex.local/Intelligent-Search-API/0.1.12/openapi.yaml', path: '/top_searches' },
    { spec: 'vtex.local/Price-Simulations/1.0/openapi.yaml', path: '/_v/custom-prices/session/schema' },
    { spec: 'vtex.local/Session-Manager-API/1.0/openapi.yaml', path: '/segments' },
    { spec: 'vtex.local/Session-Manager-API/1.0/openapi.yaml', path: '/sessions' },
    { spec: 'cpy.re/peertube/5.1.0/openapi.yaml', path: '/api/v1/config' },
    { spec: 'cpy.re/peertube/5.1.0/openapi.yaml', path: '/api/v1/config/about' },
    { spec: 'cpy.re/peertube/5.1.0/openapi.yaml', path: '/api/v1/custom-pages/homepage/instance' },
    { spec: 'ideaconsult.net/nanoreg/4.0.0/openapi.yaml', path: '/select' },
    { spec: 'tisane.ai/1.0.0/openapi.yaml', path: '/hypernyms' },
    { spec: 'tisane.ai/1.0.0/openapi.yaml', path: '/hyponyms' },
    { spec: 'tisane.ai/1.0.0/openapi.yaml', path: '/inflections' },
    { spec: 'o2.cz/mobility/1.2.0/swagger.yaml', path: '/info' },
    { spec: 'hubapi.com/crm/v3/openapi.yaml', path: '/sample-response' },
    { spec: 'hubapi.com/communication-preferences/v3/openapi.yaml', path: '/communication-preferences/v3/definitions' },
    { spec: 'slideroom.com/v2/swagger.yaml', path: '/api/v2/applicant/attributes/names' },
    { spec: 'slideroom.com/v2/swagger.yaml', path: '/api/v2/application/attributes/names' },
    { spec: 'presalytics.io/ooxml/0.1.0/openapi.yaml', path: '/Charts/AxisDataTypes' },
    { spec: 'presalytics.io/ooxml/0.1.0/openapi.yaml', path: '/Charts/PlotType' },
    { spec: 'presalytics.io/ooxml/0.1.0/openapi.yaml', path: '/Charts/RowCol' },
    { spec: 'atlassian.com/jira/1001.0.0-SNAPSHOT/openapi.yaml', path: '/rest/atlassian-connect/1/app/module/dynamic' },
    { spec: 'dnd5eapi.co/0.1/openapi.yaml', path: '/api' },
    { spec: 'evemarketer.com/1.0.1/swagger.yaml', path: '/marketstat/json' },
    { spec: 'bigredcloud.com/v1/openapi.yaml', path: '/v1/accounts' },
    { spec: 'bigredcloud.com/v1/openapi.yaml', path: '/v1/analysisCategories' },
    { spec: 'bigredcloud.com/v1/openapi.yaml', path: '/v1/bankAccounts' },
    { spec: 'visualcrossing.com/weather/4.6/openapi.yaml', path: '/VisualCrossingWebServices/rest/services/weatherdata/forecast' },
    { spec: 'visualcrossing.com/weather/4.6/openapi.yaml', path: '/VisualCrossingWebServices/rest/services/weatherdata/history' },
    { spec: 'clearblade.com/3.0/swagger.yaml', path: '/admin/database/status' },
    { spec: 'clearblade.com/3.0/swagger.yaml', path: '/api/about' },
    { spec: 'tfl.gov.uk/v1/openapi.yaml', path: '/AirQuality' },
    { spec: 'tfl.gov.uk/v1/openapi.yaml', path: '/BikePoint' },
    { spec: 'tfl.gov.uk/v1/openapi.yaml', path: '/Journey/Meta/Modes' },
    { spec: 'clever-cloud.com/1.0.0/openapi.yaml', path: '//openapi' },
    { spec: 'clever-cloud.com/1.0.0/openapi.yaml', path: '/events/event-socket' },
    { spec: 'clever-cloud.com/1.0.0/openapi.yaml', path: '/github' },
    { spec: 'opentrials.local/0.0.1/swagger.yaml', path: '/document_categories' },
    { spec: 'opentrials.local/0.0.1/swagger.yaml', path: '/documents' },
    { spec: 'opentrials.local/0.0.1/swagger.yaml', path: '/fda_applications' },
    { spec: 'github.com/api.github.com/1.1.4/openapi.yaml', path: '/' },
    { spec: 'github.com/api.github.com/1.1.4/openapi.yaml', path: '/app' },
    { spec: 'github.com/api.github.com/1.1.4/openapi.yaml', path: '/app/hook/config' },
    { spec: 'github.com/ghes-3.5/1.1.4/openapi.yaml', path: '/' },
    { spec: 'github.com/ghes-3.5/1.1.4/openapi.yaml', path: '/admin/hooks' },
    { spec: 'github.com/ghes-3.5/1.1.4/openapi.yaml', path: '/admin/pre-receive-environments' },
    { spec: 'github.com/ghec/1.1.4/openapi.yaml', path: '/app' },
    { spec: 'github.com/ghec/1.1.4/openapi.yaml', path: '/app/hook/config' },
    { spec: 'github.com/ghec/1.1.4/openapi.yaml', path: '/codes_of_conduct' },
    { spec: 'github.com/api.github.com.2022-11-28/1.1.4/openapi.yaml', path: '/emojis' },
    { spec: 'github.com/api.github.com.2022-11-28/1.1.4/openapi.yaml', path: '/events' },
    { spec: 'github.com/api.github.com.2022-11-28/1.1.4/openapi.yaml', path: '/feeds' },
    { spec: 'github.com/github.ae/1.1.4/openapi.yaml', path: '/enterprise/announcement' },
    { spec: 'github.com/github.ae/1.1.4/openapi.yaml', path: '/enterprise/settings/license' },
    { spec: 'github.com/github.ae/1.1.4/openapi.yaml', path: '/enterprise/stats/all' },
    { spec: 'github.com/ghes-3.8/1.1.4/openapi.yaml', path: '/admin/pre-receive-hooks' },
    { spec: 'github.com/ghes-3.8/1.1.4/openapi.yaml', path: '/enterprise/stats/comments' },
    { spec: 'github.com/ghes-3.8/1.1.4/openapi.yaml', path: '/enterprise/stats/gists' },
    { spec: 'github.com/ghes-3.4/1.1.4/openapi.yaml', path: '/enterprise/stats/hooks' },
    { spec: 'github.com/ghes-3.4/1.1.4/openapi.yaml', path: '/enterprise/stats/issues' },
    { spec: 'github.com/ghes-3.4/1.1.4/openapi.yaml', path: '/enterprise/stats/milestones' },
    { spec: 'github.com/ghes-3.7/1.1.4/openapi.yaml', path: '/enterprise/stats/orgs' },
    { spec: 'github.com/ghes-3.7/1.1.4/openapi.yaml', path: '/enterprise/stats/pages' },
    { spec: 'github.com/ghes-3.7/1.1.4/openapi.yaml', path: '/enterprise/stats/pulls' },
    { spec: 'github.com/ghes-3.2/1.1.4/openapi.yaml', path: '/enterprise/stats/repos' },
    { spec: 'github.com/ghes-3.2/1.1.4/openapi.yaml', path: '/enterprise/stats/users' },
    { spec: 'github.com/ghes-3.2/1.1.4/openapi.yaml', path: '/gitignore/templates' },
    { spec: 'github.com/ghes-3.6/1.1.4/openapi.yaml', path: '/installation/repositories' },
    { spec: 'github.com/ghes-3.6/1.1.4/openapi.yaml', path: '/meta' },
    { spec: 'github.com/ghes-3.6/1.1.4/openapi.yaml', path: '/rate_limit' },
    { spec: 'github.com/ghes-3.3/1.1.4/openapi.yaml', path: '/user' },
    { spec: 'github.com/ghes-3.3/1.1.4/openapi.yaml', path: '/user/emails' },
    { spec: 'github.com/ghes-3.3/1.1.4/openapi.yaml', path: '/user/followers' },
    { spec: 'github.com/ghec.2022-11-28/1.1.4/openapi.yaml', path: '/marketplace_listing/plans' },
    { spec: 'github.com/ghec.2022-11-28/1.1.4/openapi.yaml', path: '/marketplace_listing/stubbed/plans' },
    { spec: 'github.com/ghec.2022-11-28/1.1.4/openapi.yaml', path: '/user/blocks' },
    { spec: 'mozilla.com/kinto/1.22/openapi.yaml', path: '/' },
    { spec: 'mozilla.com/kinto/1.22/openapi.yaml', path: '/__api__' },
    { spec: 'mozilla.com/kinto/1.22/openapi.yaml', path: '/__heartbeat__' },
    { spec: 'notion.com/1.0.0/openapi.yaml', path: '/v1/comments' },
    { spec: 'gov.bc.ca/bcgnws/3.x.x/openapi.yaml', path: '/featureCategories' },
    { spec: 'gov.bc.ca/bcgnws/3.x.x/openapi.yaml', path: '/featureClasses' },
    { spec: 'gov.bc.ca/bcgnws/3.x.x/openapi.yaml', path: '/featureTypes' },
    { spec: 'gov.bc.ca/jobposting/1.0.0/openapi.yaml', path: '/Industries' },
    { spec: 'gov.bc.ca/jobposting/1.0.0/openapi.yaml', path: '/jobTypes' },
    { spec: 'gov.bc.ca/jobposting/1.0.0/openapi.yaml', path: '/majorProjects' },
    { spec: 'gov.bc.ca/news/1.0/openapi.yaml', path: '/api/Home' },
    { spec: 'gov.bc.ca/news/1.0/openapi.yaml', path: '/api/Ministries' },
    { spec: 'gov.bc.ca/news/1.0/openapi.yaml', path: '/api/Newsletters' },
    { spec: 'docker.com/hub/beta/openapi.yaml', path: '/v2/scim/2.0/ResourceTypes' },
    { spec: 'docker.com/hub/beta/openapi.yaml', path: '/v2/scim/2.0/Schemas' },
    { spec: 'docker.com/hub/beta/openapi.yaml', path: '/v2/scim/2.0/ServiceProviderConfig' },
    { spec: 'just-eat.co.uk/1.0.0/openapi.yaml', path: '/delivery/pools' },
    { spec: 'smart-me.com/v1/openapi.yaml', path: '/api/Account/login' },
    { spec: 'smart-me.com/v1/openapi.yaml', path: '/api/CustomDevice' },
    { spec: 'smart-me.com/v1/openapi.yaml', path: '/api/Devices' },
    { spec: 'telematicssdk.com/1.0.0/openapi.yaml', path: '/statistics/v1/Scorings/individual/' },
    { spec: 'telematicssdk.com/1.0.0/openapi.yaml', path: '/statistics/v1/Statistics/individual/' },
    { spec: 'telematicssdk.com/1.0.0/openapi.yaml', path: '/statistics/v1/Statistics/individual/daily/' },
    { spec: 'corrently.io/2.0.0/openapi.yaml', path: '/alternative/ocpp/lastSessions' },
    { spec: 'corrently.io/2.0.0/openapi.yaml', path: '/alternative/openmeter/activities' },
    { spec: 'corrently.io/2.0.0/openapi.yaml', path: '/alternative/openmeter/meters' },
    { spec: 'naviplancentral.com/plan/v1/swagger.yaml', path: '/api/Advisors' },
    { spec: 'naviplancentral.com/plan/v1/swagger.yaml', path: '/api/Password/PasswordRequirements' },
    { spec: 'naviplancentral.com/plan/v1/swagger.yaml', path: '/api/ServiceInformation/Statistics' },
    { spec: 'naviplancentral.com/factfinder/v1/swagger.yaml', path: '/api/AccountTypes' },
    { spec: 'naviplancentral.com/factfinder/v1/swagger.yaml', path: '/api/CriticalIllnessInsurancePolicyTypes' },
    { spec: 'naviplancentral.com/factfinder/v1/swagger.yaml', path: '/api/DisabilityInsurancePolicyTypes' },
    { spec: 'trakt.tv/1.0.0/openapi.yaml', path: '/oauth/authorize' },
    { spec: 'poemist.com/1.0/swagger.yaml', path: '/randompoems' },
    { spec: 'jokes.one/1.1/swagger.yaml', path: '/joke/list' },
    { spec: 'jokes.one/1.1/swagger.yaml', path: '/joke/random' },
    { spec: 'clicksend.com/1.0.0/openapi.yaml', path: '/account' },
    { spec: 'clicksend.com/1.0.0/openapi.yaml', path: '/automations/email/receipt' },
    { spec: 'clicksend.com/1.0.0/openapi.yaml', path: '/automations/fax/inbound' },
    { spec: 'carbone.io/1.2.0/openapi.yaml', path: '/status' },
    { spec: 'exhibitday.com/v1/swagger.yaml', path: '/api/docs/Swagger' },
    { spec: 'evetech.net/0.8.6/swagger.yaml', path: '/alliances/' },
    { spec: 'evetech.net/0.8.6/swagger.yaml', path: '/corporations/npccorps/' },
    { spec: 'evetech.net/0.8.6/swagger.yaml', path: '/dogma/attributes/' },
    { spec: 'vonage.com/vgis/1.0.1/openapi.yaml', path: '/self' },
    { spec: 'vonage.com/vgis/1.0.1/openapi.yaml', path: '/self/account' },
    { spec: 'vonage.com/vgis/1.0.1/openapi.yaml', path: '/self/webhooks' },
    { spec: 'canada-holidays.ca/1.8.0/openapi.yaml', path: '/api/v1' },
    { spec: 'canada-holidays.ca/1.8.0/openapi.yaml', path: '/api/v1/holidays' },
    { spec: 'canada-holidays.ca/1.8.0/openapi.yaml', path: '/api/v1/provinces' },
    { spec: 'bungie.net/2.18.0/openapi.yaml', path: '/App/FirstParty/' },
    { spec: 'bungie.net/2.18.0/openapi.yaml', path: '/Destiny2/Clan/ClanBannerDictionary/' },
    { spec: 'bungie.net/2.18.0/openapi.yaml', path: '/Destiny2/Manifest/' },
    { spec: 'epa.gov/dfr/0.0.0/swagger.yaml', path: '/dfr_rest_services.air_3_yr_download' },
    { spec: 'epa.gov/dfr/0.0.0/swagger.yaml', path: '/dfr_rest_services.cwa_3_yr_effluent_download' },
    { spec: 'epa.gov/dfr/0.0.0/swagger.yaml', path: '/dfr_rest_services.cwa_3_yr_sepscs_download' },
    { spec: 'getpostman.com/1.20.0/openapi.yaml', path: '/apis' },
    { spec: 'getpostman.com/1.20.0/openapi.yaml', path: '/collections' },
    { spec: 'getpostman.com/1.20.0/openapi.yaml', path: '/environments' },
    { spec: 'swagger.io/generator/2.4.31/swagger.yaml', path: '/gen/clients' },
    { spec: 'swagger.io/generator/2.4.31/swagger.yaml', path: '/gen/servers' },
    { spec: 'apidapp.com/2019-02-14T164701Z/openapi.yaml', path: '/erc20' },
    { spec: 'apidapp.com/2019-02-14T164701Z/openapi.yaml', path: '/version' },
    { spec: 'apidapp.com/2019-02-14T164701Z/openapi.yaml', path: '/wallet' },
    { spec: 'wikimedia.org/1.0.0/swagger.yaml', path: '/feed/availability' },
    { spec: 'wikimedia.org/1.0.0/swagger.yaml', path: '/transform/list/languagepairs/' },
    { spec: 'appcenter.ms/v0.1/openapi.yaml', path: '/v0.1/public/codepush/status' },
    { spec: 'wealthreader.com/1.0.0/openapi.yaml', path: '/entities' },
    { spec: 'wealthreader.com/1.0.0/openapi.yaml', path: '/error-codes' },
    { spec: 'balldontlie.io/1.0.0/openapi.yaml', path: '/api/v1/games' },
    { spec: 'balldontlie.io/1.0.0/openapi.yaml', path: '/api/v1/games/32881' },
    { spec: 'balldontlie.io/1.0.0/openapi.yaml', path: '/api/v1/players' },
    { spec: 'magento.com/2.2.10/openapi.yaml', path: '/V1/analytics/link' },
    { spec: 'magento.com/2.2.10/openapi.yaml', path: '/V1/attributeMetadata/customer' },
    { spec: 'magento.com/2.2.10/openapi.yaml', path: '/V1/attributeMetadata/customerAddress' },
    { spec: 'payrun.io/23.24.2.136/openapi.yaml', path: '/Healthcheck' },
    { spec: 'beezup.com/2.0/openapi.yaml', path: '/v2/public/channels/' },
    { spec: 'beezup.com/2.0/openapi.yaml', path: '/v2/public/lov/' },
    { spec: 'beezup.com/2.0/openapi.yaml', path: '/v2/user/analytics/' },
    { spec: 'journy.io/1.0.0/openapi.yaml', path: '/events' },
    { spec: 'journy.io/1.0.0/openapi.yaml', path: '/properties/accounts' },
    { spec: 'journy.io/1.0.0/openapi.yaml', path: '/properties/users' },
    { spec: 'oxforddictionaries.com/1.11.0/openapi.yaml', path: '/filters' },
    { spec: 'oxforddictionaries.com/1.11.0/openapi.yaml', path: '/languages' },
    { spec: 'appwrite.io/server/0.9.3/openapi.yaml', path: '/account' },
    { spec: 'appwrite.io/server/0.9.3/openapi.yaml', path: '/account/logs' },
    { spec: 'appwrite.io/server/0.9.3/openapi.yaml', path: '/account/prefs' },
    { spec: 'appwrite.io/client/0.9.3/openapi.yaml', path: '/account/sessions' },
    { spec: 'appwrite.io/client/0.9.3/openapi.yaml', path: '/locale' },
    { spec: 'appwrite.io/client/0.9.3/openapi.yaml', path: '/locale/continents' },
    { spec: 'bluemix.net/containers/3.0.0/openapi.yaml', path: '/containers/version' },
    { spec: 'oceandrivers.com/1.0/openapi.yaml', path: '/v1.0/getWebCams/' },
    { spec: 'patientview.org/1.0/openapi.yaml', path: '/patientmanagement/diagnoses' },
    { spec: 'patientview.org/1.0/openapi.yaml', path: '/patientmanagement/lookuptypes' },
    { spec: 'visma.com/1.0/openapi.yaml', path: '/heartbeat/database' },
    { spec: 'visma.com/1.0/openapi.yaml', path: '/heartbeat/server' },
    { spec: 'digitallocker.gov.in/authpartner/1.0.0/openapi.yaml', path: '/oauth2/2/files/issued' },
    { spec: 'twilio.com/api/1.55.0/openapi.yaml', path: '/healthcheck' },
    { spec: 'wellknown.ai/1.0.0/openapi.yaml', path: '/api/plugins' },
    { spec: 'wellknown.ai/1.0.0/openapi.yaml', path: '/plugins' },
    { spec: 'hsbc.com/atm/2.2.1/swagger.yaml', path: '/open-banking/v2.2/atms' },
    { spec: 'hsbc.com/branches/2.2.1/swagger.yaml', path: '/open-banking/v2.2/branches' },
    { spec: 'hsbc.com/product/2.2.1/swagger.yaml', path: '/open-banking/v2.2/business-current-accounts' },
    { spec: 'hsbc.com/product/2.2.1/swagger.yaml', path: '/open-banking/v2.2/commercial-credit-cards' },
    { spec: 'hsbc.com/product/2.2.1/swagger.yaml', path: '/open-banking/v2.2/personal-current-accounts' },
    { spec: 'osisoft.com/1.11.1.5383/swagger.yaml', path: '/' },
    { spec: 'osisoft.com/1.11.1.5383/swagger.yaml', path: '/channels/instances' },
    { spec: 'osisoft.com/1.11.1.5383/swagger.yaml', path: '/system' },
    { spec: 'docusign.net/v2.1/openapi.yaml', path: '/service_information' },
    { spec: 'docusign.net/v2.1/openapi.yaml', path: '/v2.1' },
    { spec: 'docusign.net/v2.1/openapi.yaml', path: '/v2.1/accounts/provisioning' },
    { spec: 'here.com/tracking/2.1.192/openapi.yaml', path: '/aliases/v2/health' },
    { spec: 'here.com/tracking/2.1.192/openapi.yaml', path: '/aliases/v2/version' },
    { spec: 'here.com/tracking/2.1.192/openapi.yaml', path: '/associations/v3/health' },
    { spec: 'twinehealth.com/v7.78.1/openapi.yaml', path: '/health_question_definition' },
    { spec: 'ritekit.com/1.0.0/openapi.yaml', path: '/v1/emoji/auto-emojify' },
    { spec: 'ritekit.com/1.0.0/openapi.yaml', path: '/v1/emoji/suggestions' },
    { spec: 'ritekit.com/1.0.0/openapi.yaml', path: '/v1/images/animate' },
    { spec: 'enode.io/1.3.10/openapi.yaml', path: '/health/ready' },
    { spec: 'enode.io/1.3.10/openapi.yaml', path: '/health/vendors' },
    { spec: 'personio.de/personnel/1.0/openapi.yaml', path: '/company/employees' },
    { spec: 'personio.de/personnel/1.0/openapi.yaml', path: '/company/time-off-types' },
    { spec: 'nebl.io/1.3.0/openapi.yaml', path: '/ins/sync' },
    { spec: 'nebl.io/1.3.0/openapi.yaml', path: '/testnet/ins/sync' },
    { spec: 'json2video.com/2.0.0/openapi.yaml', path: '/movies' },
    { spec: 'orthanc-server.com/1.12.0/openapi.yaml', path: '/plugins' },
    { spec: 'orthanc-server.com/1.12.0/openapi.yaml', path: '/plugins/explorer.js' },
    { spec: 'orthanc-server.com/1.12.0/openapi.yaml', path: '/queries' },
    { spec: 'figshare.com/2.0.0/openapi.yaml', path: '/categories' },
    { spec: 'figshare.com/2.0.0/openapi.yaml', path: '/licenses' },
    { spec: 'languagetool.org/1.1.2/swagger.yaml', path: '/languages' },
    { spec: 'salesloft.com/v2/openapi.yaml', path: '/v2/me.json' },
    { spec: 'salesloft.com/v2/openapi.yaml', path: '/v2/team.json' },
    { spec: 'color.pizza/1.0.0/openapi.yaml', path: '/lists/' },
    { spec: 'clubhouseapi.com/1/openapi.yaml', path: '/check_for_update' },
    { spec: 'clubhouseapi.com/1/openapi.yaml', path: '/get_actionable_notifications' },
    { spec: 'clubhouseapi.com/1/openapi.yaml', path: '/get_all_topics' },
    { spec: 'parliament.uk/bills/v1/openapi.yaml', path: '/api/v1/Rss/allbills.rss' },
    { spec: 'parliament.uk/bills/v1/openapi.yaml', path: '/api/v1/Rss/privatebills.rss' },
    { spec: 'parliament.uk/bills/v1/openapi.yaml', path: '/api/v1/Rss/publicbills.rss' },
    { spec: 'parliament.uk/search/Live/openapi.yaml', path: '/description' },
    { spec: 'randomlovecraft.com/1.0/openapi.yaml', path: '/books' },
    { spec: 'randomlovecraft.com/1.0/openapi.yaml', path: '/sentences' },
    { spec: 'nexmo.com/media/1.0.2/openapi.yaml', path: '/' },
    { spec: 'nexmo.com/media/1.0.2/openapi.yaml', path: '/:id/info' },
    { spec: 'nowpayments.io/1.0.0/openapi.yaml', path: '/v1/sub-partner' },
    { spec: 'nowpayments.io/1.0.0/openapi.yaml', path: '/v1/sub-partner/transfers' },
    { spec: 'osf.io/2.0/openapi.yaml', path: '/' },
    { spec: 'osf.io/2.0/openapi.yaml', path: '/actions/' },
    { spec: 'osf.io/2.0/openapi.yaml', path: '/addons/' },
    { spec: 'rapidapi.com/ecowetter/1.0.0/openapi.yaml', path: '/public/history' },
    { spec: 'bunq.com/1.0/openapi.yaml', path: '/device' },
    { spec: 'bunq.com/1.0/openapi.yaml', path: '/device-server' },
    { spec: 'bunq.com/1.0/openapi.yaml', path: '/installation' },
    { spec: 'azure.com/alertsmanagement-AlertsManagement/2019-03-01-preview/swagger.yaml', path: '/providers/Microsoft.AlertsManagement/operations' },
    { spec: 'azure.com/alertsmanagement-AlertsManagement/2019-05-05-preview/swagger.yaml', path: '/providers/Microsoft.AlertsManagement/alertsMetaData' },
    { spec: 'azure.com/servicefabric/5.6/swagger.yaml', path: '/$/GetAadMetadata' },
    { spec: 'azure.com/dynamicstelemetry/2019-01-24/swagger.yaml', path: '/providers/Microsoft.DynamicsTelemetry/operations' },
    { spec: 'azure.com/attestation/2018-09-01-preview/swagger.yaml', path: '/.well-known/openid-configuration' },
    { spec: 'azure.com/attestation/2018-09-01-preview/swagger.yaml', path: '/certs' },
    { spec: 'azure.com/attestation/2018-09-01-preview/swagger.yaml', path: '/operations/policy/current' },
    { spec: 'azure.com/iotcentral/preview/swagger.yaml', path: '/continuousDataExports' },
    { spec: 'azure.com/iotcentral/preview/swagger.yaml', path: '/deviceTemplates' },
    { spec: 'azure.com/iotcentral/preview/swagger.yaml', path: '/devices' },
    { spec: 'openalpr.com/3.0.1/swagger.yaml', path: '/config' },
    { spec: 'snyk.io/1.0.0/openapi.yaml', path: '/orgs' },
    { spec: 'snyk.io/1.0.0/openapi.yaml', path: '/user/me' },
    { spec: 'zalando.com/v1.0/swagger.yaml', path: '/domains' },
    { spec: 'openlinksw.com/osdb/1.0.0/openapi.yaml', path: '/api/v1/login' },
    { spec: 'openlinksw.com/osdb/1.0.0/openapi.yaml', path: '/api/v1/logout' },
    { spec: 'openlinksw.com/osdb/1.0.0/openapi.yaml', path: '/api/v1/services' },
    { spec: 'gsa.gov/0.1/swagger.yaml', path: '/api/metadata/' },
    { spec: 'gsa.gov/0.1/swagger.yaml', path: '/api/naics/' }
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
            let built = null;
            try {
                built = new Function('msg', source).call(null, {}) || {};
            } catch (err) {
                failures++;
                note('error', label + ' -> the generated code threw: ' + err.message);
                continue;
            }
            if (typeof built.url !== 'string' || !built.url) {
                failures++;
                note('error', label + ' -> no msg.url was generated');
                continue;
            }
            try {
                new URL(built.url);
            } catch (err) {
                failures++;
                note('error', label + ' -> generated an invalid URL: ' + built.url);
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
            while (!result && Date.now() - started < 6000) {
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
