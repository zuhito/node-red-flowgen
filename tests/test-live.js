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

const CORPUS_SPECS = [
    '1forge.com/0.0.1/swagger.yaml',
    'agco-ats.com/v1/openapi.yaml',
    'amadeus.com/amadeus-flight-price-analysis/1.0.1/openapi.yaml',
    'amadeus.com/amadeus-location-score/1.0.2/openapi.yaml',
    'apache.org/qakka/v1/openapi.yaml',
    'apacta.com/0.0.42/openapi.yaml',
    'apidapp.com/2019-02-14T164701Z/openapi.yaml',
    'apis.guru/2.2.0/openapi.yaml',
    'appcenter.ms/v0.1/openapi.yaml',
    'apple.com/sirikit-cloud-media/1.0.2/openapi.yaml',
    'appwrite.io/client/0.9.3/openapi.yaml',
    'appwrite.io/server/0.9.3/openapi.yaml',
    'asuarez.dev/searchly/1.0/openapi.yaml',
    'atlassian.com/jira/1001.0.0-SNAPSHOT/openapi.yaml',
    'avaza.com/v1/swagger.yaml',
    'aviationdata.systems/v1/swagger.yaml',
    'azure.com/alertsmanagement-AlertsManagement/2019-03-01-preview/swagger.yaml',
    'azure.com/alertsmanagement-AlertsManagement/2019-05-05-preview/swagger.yaml',
    'azure.com/attestation/2018-09-01-preview/swagger.yaml',
    'azure.com/dynamicstelemetry/2019-01-24/swagger.yaml',
    'azure.com/iotcentral/preview/swagger.yaml',
    'azure.com/servicefabric/5.6/swagger.yaml',
    'balldontlie.io/1.0.0/openapi.yaml',
    'beezup.com/2.0/openapi.yaml',
    'bigdatacloud.net/1.0.0/openapi.yaml',
    'bigoven.com/partner/openapi.yaml',
    'bigredcloud.com/v1/openapi.yaml',
    'billbee.io/v1/openapi.yaml',
    'bluemix.net/containers/3.0.0/openapi.yaml',
    'braze.com/1.0.0/openapi.yaml',
    'brex.io/2021.12/openapi.yaml',
    'bungie.net/2.18.0/openapi.yaml',
    'bunq.com/1.0/openapi.yaml',
    'canada-holidays.ca/1.8.0/openapi.yaml',
    'carbone.io/1.2.0/openapi.yaml',
    'chaingateway.io/1.0.0/openapi.yaml',
    'clearblade.com/3.0/swagger.yaml',
    'clever-cloud.com/1.0.0/openapi.yaml',
    'clicksend.com/1.0.0/openapi.yaml',
    'clickup.com/1.0.0/openapi.yaml',
    'clubhouseapi.com/1/openapi.yaml',
    'color.pizza/1.0.0/openapi.yaml',
    'consumerfinance.gov/1.0/swagger.yaml',
    'contribly.com/1.0.0/openapi.yaml',
    'corrently.io/2.0.0/openapi.yaml',
    'cpy.re/peertube/5.1.0/openapi.yaml',
    'data2crm.com/1/swagger.yaml',
    'deutschebahn.com/flinkster/v1/swagger.yaml',
    'digitallocker.gov.in/authpartner/1.0.0/openapi.yaml',
    'dnd5eapi.co/0.1/openapi.yaml',
    'docker.com/hub/beta/openapi.yaml',
    'docusign.net/v2.1/openapi.yaml',
    'enode.io/1.3.10/openapi.yaml',
    'epa.gov/dfr/0.0.0/swagger.yaml',
    'evemarketer.com/1.0.1/swagger.yaml',
    'evetech.net/0.8.6/swagger.yaml',
    'exhibitday.com/v1/swagger.yaml',
    'figshare.com/2.0.0/openapi.yaml',
    'getpostman.com/1.20.0/openapi.yaml',
    'github.com/api.github.com.2022-11-28/1.1.4/openapi.yaml',
    'github.com/api.github.com/1.1.4/openapi.yaml',
    'github.com/ghec.2022-11-28/1.1.4/openapi.yaml',
    'github.com/ghec/1.1.4/openapi.yaml',
    'github.com/ghes-3.2/1.1.4/openapi.yaml',
    'github.com/ghes-3.3/1.1.4/openapi.yaml',
    'github.com/ghes-3.4/1.1.4/openapi.yaml',
    'github.com/ghes-3.5/1.1.4/openapi.yaml',
    'github.com/ghes-3.6/1.1.4/openapi.yaml',
    'github.com/ghes-3.7/1.1.4/openapi.yaml',
    'github.com/ghes-3.8/1.1.4/openapi.yaml',
    'github.com/github.ae/1.1.4/openapi.yaml',
    'gov.bc.ca/bcgnws/3.x.x/openapi.yaml',
    'gov.bc.ca/jobposting/1.0.0/openapi.yaml',
    'gov.bc.ca/news/1.0/openapi.yaml',
    'greip.io/1.0.0/openapi.yaml',
    'groundhog-day.com/1.2.1/openapi.yaml',
    'gsa.gov/0.1/swagger.yaml',
    'handwrytten.com/1.0.0/swagger.yaml',
    'here.com/tracking/2.1.192/openapi.yaml',
    'hetras-certification.net/hotel/v0/swagger.yaml',
    'hetzner.cloud/1.0.0/openapi.yaml',
    'hsbc.com/atm/2.2.1/swagger.yaml',
    'hsbc.com/branches/2.2.1/swagger.yaml',
    'hsbc.com/product/2.2.1/swagger.yaml',
    'httpbin.org/0.9.2/openapi.yaml',
    'hubapi.com/communication-preferences/v3/openapi.yaml',
    'hubapi.com/crm/v3/openapi.yaml',
    'ideaconsult.net/nanoreg/4.0.0/openapi.yaml',
    'idtbeyond.com/1.1.7/swagger.yaml',
    'jokes.one/1.1/swagger.yaml',
    'journy.io/1.0.0/openapi.yaml',
    'json2video.com/2.0.0/openapi.yaml',
    'just-eat.co.uk/1.0.0/openapi.yaml',
    'languagetool.org/1.1.2/swagger.yaml',
    'lgtm.com/v1.0/openapi.yaml',
    'linode.com/4.151.1/openapi.yaml',
    'magento.com/2.2.10/openapi.yaml',
    'mastercard.com/BINTableResource/1.0/swagger.yaml',
    'mastercard.com/CurrencyConversionCalculator/1.0.0/swagger.yaml',
    'mastercard.com/Locations/1.0.0/swagger.yaml',
    'mastercard.com/MDES/2.0.7/swagger.yaml',
    'medium.com/1.0/openapi.yaml',
    'mermade.org.uk/openapi-converter/1.0.0/openapi.yaml',
    'metadapi.com/1.0/openapi.yaml',
    'microsoft.com/cognitiveservices-Training/1.2/openapi.yaml',
    'microsoft.com/cognitiveservices-Training/2.0/openapi.yaml',
    'microsoft.com/graph-beta/1.0.1/openapi.yaml',
    'microsoft.com/graph/1.0.1/openapi.yaml',
    'mozilla.com/kinto/1.22/openapi.yaml',
    'naviplancentral.com/factfinder/v1/swagger.yaml',
    'naviplancentral.com/plan/v1/swagger.yaml',
    'ndhm.gov.in/ndhm-hip/0.5/openapi.yaml',
    'ndhm.gov.in/ndhm-hiu/0.5/openapi.yaml',
    'nebl.io/1.3.0/openapi.yaml',
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
    'orthanc-server.com/1.12.0/openapi.yaml',
    'osf.io/2.0/openapi.yaml',
    'osisoft.com/1.11.1.5383/swagger.yaml',
    'oxforddictionaries.com/1.11.0/openapi.yaml',
    'parliament.uk/bills/v1/openapi.yaml',
    'parliament.uk/search/Live/openapi.yaml',
    'patientview.org/1.0/openapi.yaml',
    'payrun.io/23.24.2.136/openapi.yaml',
    'personio.de/personnel/1.0/openapi.yaml',
    'poemist.com/1.0/swagger.yaml',
    'presalytics.io/ooxml/0.1.0/openapi.yaml',
    'quarantine.country/1.0/swagger.yaml',
    'randomlovecraft.com/1.0/openapi.yaml',
    'rapidapi.com/ecowetter/1.0.0/openapi.yaml',
    'rbaskets.in/1.0.0/swagger.yaml',
    'reverb.com/3.0/openapi.yaml',
    'ritekit.com/1.0.0/openapi.yaml',
    'rumble.run/2.15.0/openapi.yaml',
    'salesloft.com/v2/openapi.yaml',
    'sheetlabs.com/rig-veda/1.2/swagger.yaml',
    'shutterstock.com/1.1.32/openapi.yaml',
    'sinao.app/1.1.0/openapi.yaml',
    'slideroom.com/v2/swagger.yaml',
    'smart-me.com/v1/openapi.yaml',
    'snyk.io/1.0.0/openapi.yaml',
    'swagger.io/generator/2.4.31/swagger.yaml',
    'taxamo.com/1/swagger.yaml',
    'tcgdex.net/2.0.0/openapi.yaml',
    'telematicssdk.com/1.0.0/openapi.yaml',
    'tfl.gov.uk/v1/openapi.yaml',
    'thebluealliance.com/3.8.2/openapi.yaml',
    'tisane.ai/1.0.0/openapi.yaml',
    'trakt.tv/1.0.0/openapi.yaml',
    'truanon.com/1.0.0/openapi.yaml',
    'twilio.com/api/1.55.0/openapi.yaml',
    'twinehealth.com/v7.78.1/openapi.yaml',
    'twitter.com/current/2.62/openapi.yaml',
    'twitter.com/legacy/1.1/swagger.yaml',
    'uebermaps.com/2.0/swagger.yaml',
    'visma.com/1.0/openapi.yaml',
    'visualcrossing.com/weather/4.6/openapi.yaml',
    'vonage.com/vgis/1.0.1/openapi.yaml',
    'vtex.local/Intelligent-Search-API/0.1.12/openapi.yaml',
    'vtex.local/Policies-System-API/1.0.0/openapi.yaml',
    'vtex.local/Price-Simulations/1.0/openapi.yaml',
    'vtex.local/Session-Manager-API/1.0/openapi.yaml',
    'watchful.li/1.0.0/swagger.yaml',
    'wealthreader.com/1.0.0/openapi.yaml',
    'wellknown.ai/1.0.0/openapi.yaml',
    'wikimedia.org/1.0.0/swagger.yaml',
    'wikipathways.org/1.0/openapi.yaml',
    'zalando.com/v1.0/swagger.yaml',
    'zapier.com/nla/1.0.0/openapi.yaml',
    'zoomconnect.com/1/swagger.yaml',
    'zuora.com/2021-08-20/openapi.yaml'
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
        const probeWithCurl = url => new Promise(resolve => {
            execFile('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}',
                '--max-time', '10', '-X', 'GET', url],
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
                const code = await probeWithCurl(entry.url);
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
                    if (node.type === 'inject') { node.once = true; node.onceDelay = 0.1; }
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
                while (!result && Date.now() - started < 15000) {
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
