# Corpus progress

Public API definitions called for real, comparing curl against a
generated flow. A definition that passes is retired from the corpus
so the next run spends its time on ones not yet proven; a definition
that fails stays, because that is the reason to keep looking.

| Definition | Status | Format | Endpoints | By method | Called | Probed | flowgen | Character |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- rows -->
| `1forge.com/0.0.1/swagger.yaml` | pass | swagger 2 | 2 | GET 2 | 2 | `GET /quotes` | `ce61d5ae` | read only; tiny surface |
| `amadeus.com/amadeus-flight-price-analysis/1.0.1/openapi.yaml` | pass | openapi 3.0 | 1 | GET 1 | 1 | `GET /analytics/itinerary-price-metrics` | `ce61d5ae` | read only; tiny surface |
| `amadeus.com/amadeus-location-score/1.0.2/openapi.yaml` | pass | openapi 3.0 | 1 | GET 1 | 1 | `GET /location/analytics/category-rated-areas` | `ce61d5ae` | read only; tiny surface |
| `apache.org/qakka/v1/openapi.yaml` | pass | openapi 3.0 | 10 | DELETE 2, GET 5, POST 2, PUT 1 | 2 | `GET /queues` | `ce61d5ae` | many verbs; 2 of 10 callable anonymously |
| `apicurio.local/registry/2.4.x/openapi.yaml` | pass | openapi 3.0 | 65 | DELETE 12, GET 32, POST 9, PUT 12 | 8 | `GET /admin/artifactTypes` | `ce61d5ae` | many verbs; 8 of 65 callable anonymously |
| `apis.guru/2.2.0/openapi.yaml` | pass | openapi 3.0 | 7 | GET 7 | 3 | `GET /list.json` | `ce61d5ae` | read only; 3 of 7 callable anonymously |
| `asuarez.dev/searchly/1.0/openapi.yaml` | pass | openapi 3.0 | 3 | GET 2, POST 1 | 2 | `GET /similarity/by_song` | `ce61d5ae` | tiny surface; 2 of 3 callable anonymously |
| `avaza.com/v1/swagger.yaml` | pass | swagger 2 | 86 | DELETE 7, GET 50, POST 21, PUT 8 | 1 | `GET /api/Currency` | `ce61d5ae` | many verbs; 1 of 86 callable anonymously |
| `aviationdata.systems/v1/swagger.yaml` | pass | swagger 2 | 6 | GET 6 | 1 | `GET /v1/country_list` | `ce61d5ae` | read only; 1 of 6 callable anonymously |
| `azure.com/alertsmanagement-AlertsManagement/2019-03-01-preview/swagger.yaml` | pass | swagger 2 | 10 | GET 8, POST 2 | 1 | `GET /providers/Microsoft.AlertsManagement/operations` | `ce61d5ae` | 1 of 10 callable anonymously |
| `azure.com/alertsmanagement-AlertsManagement/2019-05-05-preview/swagger.yaml` | pass | swagger 2 | 17 | DELETE 1, GET 12, PATCH 1, POST 2, PUT 1 | 2 | `GET /providers/Microsoft.AlertsManagement/alertsMetaData` | `ce61d5ae` | many verbs; 2 of 17 callable anonymously |
| `azure.com/attestation/2018-09-01-preview/swagger.yaml` | pass | swagger 2 | 6 | GET 3, POST 2, PUT 1 | 3 | `GET /.well-known/openid-configuration` | `ce61d5ae` | 3 of 6 callable anonymously |
| `azure.com/dynamicstelemetry/2019-01-24/swagger.yaml` | pass | swagger 2 | 1 | GET 1 | 1 | `GET /providers/Microsoft.DynamicsTelemetry/operations` | `ce61d5ae` | read only; tiny surface |
| `azure.com/iotcentral/preview/swagger.yaml` | pass | swagger 2 | 30 | DELETE 4, GET 18, POST 1, PUT 7 | 5 | `GET /apiTokens` | `ce61d5ae` | many verbs; 5 of 30 callable anonymously |
| `balldontlie.io/1.0.0/openapi.yaml` | pass | openapi 3.0 | 7 | GET 7 | 7 | `GET /api/v1/games` | `ce61d5ae` | read only |
| `beezup.com/2.0/openapi.yaml` | pass | openapi 3.0 | 211 | DELETE 11, GET 86, HEAD 1, PATCH 2, POST 96, PUT 15 | 15 | `GET /v2/user/analytics/` | `ce61d5ae` | many verbs; large surface; 15 of 211 callable anonymously |
| `bigdatacloud.net/1.0.0/openapi.yaml` | pass | openapi 3.0 | 2 | GET 2 | 2 | `GET /data/ip-geolocation-full` | `ce61d5ae` | read only; tiny surface |
| `bigredcloud.com/v1/openapi.yaml` | pass | openapi 3.0 | 111 | DELETE 13, GET 50, POST 20, PUT 28 | 30 | `GET /v1/accounts` | `ce61d5ae` | many verbs; large surface; 30 of 111 callable anonymously |
| `billbee.io/v1/openapi.yaml` | pass | openapi 3.0 | 75 | DELETE 5, GET 38, PATCH 3, POST 21, PUT 8 | 16 | `GET /api/v1/automaticprovision/termsinfo` | `ce61d5ae` | many verbs; 16 of 75 callable anonymously |
| `bluemix.net/containers/3.0.0/openapi.yaml` | pass | openapi 3.0 | 47 | DELETE 5, GET 20, PATCH 1, POST 18, PUT 3 | 1 | `GET /containers/version` | `ce61d5ae` | many verbs; 1 of 47 callable anonymously |
| `braze.com/1.0.0/openapi.yaml` | pass | openapi 3.0 | 31 | GET 30, POST 1 | 30 | `GET /campaigns/data_series` | `ce61d5ae` | 30 of 31 callable anonymously |
| `canada-holidays.ca/1.8.0/openapi.yaml` | pass | openapi 3.0 | 6 | GET 6 | 4 | `GET /api/v1` | `ce61d5ae` | read only; 4 of 6 callable anonymously |
| `carbone.io/1.2.0/openapi.yaml` | pass | openapi 3.0 | 6 | DELETE 1, GET 3, POST 2 | 1 | `GET /status` | `ce61d5ae` | 1 of 6 callable anonymously |
| `clickup.com/1.0.0/openapi.yaml` | pass | openapi 3.0 | 2 | GET 1, POST 1 | 1 | `GET /questions` | `ce61d5ae` | tiny surface; 1 of 2 callable anonymously |
| `color.pizza/1.0.0/openapi.yaml` | pass | openapi 3.0 | 4 | GET 4 | 1 | `GET /lists/` | `ce61d5ae` | read only; 1 of 4 callable anonymously |
| `consumerfinance.gov/1.0/swagger.yaml` | fail | swagger 2 | 6 | GET 6 | 2 | `GET /data` | `ce61d5ae` | read only; 2 of 6 callable anonymously; government |
| `contribly.com/1.0.0/openapi.yaml` | pass | openapi 3.0 | 44 | DELETE 4, GET 27, POST 13 | 8 | `GET /artifact-formats` | `ce61d5ae` | 8 of 44 callable anonymously |
| `corrently.io/2.0.0/openapi.yaml` | pass | openapi 3.0 | 26 | GET 16, POST 10 | 4 | `GET /alternative/ocpp/lastSessions` | `ce61d5ae` | 4 of 26 callable anonymously |
| `cpy.re/peertube/5.1.0/openapi.yaml` | pass | openapi 3.0 | 185 | DELETE 27, GET 83, POST 59, PUT 16 | 10 | `GET /api/v1/config` | `ce61d5ae` | many verbs; large surface; 10 of 185 callable anonymously |
| `crucible.local/1.0.0/swagger.yaml` | pass | swagger 2 | 79 | DELETE 7, GET 43, POST 28, PUT 1 | 2 | `GET /rest-service/projects-v1` | `ce61d5ae` | many verbs; 2 of 79 callable anonymously |
| `deutschebahn.com/flinkster/v1/swagger.yaml` | pass | swagger 2 | 10 | GET 10 | 1 | `GET /index` | `ce61d5ae` | read only; 1 of 10 callable anonymously |
| `dev.to/1.0.0/openapi.yaml` | pass | openapi 3.0 | 40 | DELETE 1, GET 26, POST 6, PUT 7 | 7 | `GET /api/articles` | `ce61d5ae` | many verbs; 7 of 40 callable anonymously |
| `digitallocker.gov.in/authpartner/1.0.0/openapi.yaml` | pass | openapi 3.0 | 22 | GET 9, POST 13 | 1 | `GET /oauth2/2/files/issued` | `ce61d5ae` | 1 of 22 callable anonymously |
| `discourse.local/latest/openapi.yaml` | pass | openapi 3.1 | 84 | DELETE 6, GET 35, POST 22, PUT 21 | 9 | `GET /admin/backups.json` | `ce61d5ae` | many verbs; 9 of 84 callable anonymously |
| `docker.com/hub/beta/openapi.yaml` | pass | openapi 3.0 | 28 | DELETE 1, GET 17, HEAD 2, PATCH 1, POST 5, PUT 2 | 5 | `GET /v2/access-tokens` | `ce61d5ae` | many verbs; 5 of 28 callable anonymously |
| `dropx.io/1.0.0/swagger.yaml` | pass | swagger 2 | 7 | GET 7 | 1 | `GET /users/usage` | `ce61d5ae` | read only; 1 of 7 callable anonymously |
| `enode.io/1.3.10/openapi.yaml` | pass | openapi 3.0 | 28 | DELETE 4, GET 15, POST 6, PUT 3 | 2 | `GET /health/ready` | `ce61d5ae` | many verbs; 2 of 28 callable anonymously |
| `epa.gov/dfr/0.0.0/swagger.yaml` | pass | swagger 2 | 94 | GET 47, POST 47 | 5 | `GET /dfr_rest_services.air_3_yr_download` | `ce61d5ae` | 5 of 94 callable anonymously; government |
| `etsi.local/MEC010-2_AppPkgMgmt/2.1.1/openapi.yaml` | pass | openapi 3.0 | 16 | DELETE 2, GET 8, PATCH 1, POST 3, PUT 2 | 1 | `GET /subscriptions` | `ce61d5ae` | many verbs; 1 of 16 callable anonymously |
| `evemarketer.com/1.0.1/swagger.yaml` | pass | swagger 2 | 4 | GET 2, POST 2 | 1 | `GET /marketstat/json` | `ce61d5ae` | 1 of 4 callable anonymously |
| `exhibitday.com/v1/swagger.yaml` | pass | swagger 2 | 23 | DELETE 3, GET 14, PATCH 3, POST 3 | 1 | `GET /api/docs/Swagger` | `ce61d5ae` | many verbs; 1 of 23 callable anonymously |
| `figshare.com/2.0.0/openapi.yaml` | pass | openapi 3.0 | 136 | DELETE 17, GET 63, POST 40, PUT 16 | 2 | `GET /categories` | `ce61d5ae` | many verbs; large surface; 2 of 136 callable anonymously |
| `fisheye.local/1.0.0/swagger.yaml` | pass | swagger 2 | 16 | GET 13, POST 3 | 1 | `GET /rest-service-fe/repositories-v1` | `ce61d5ae` | 1 of 16 callable anonymously |
| `getpostman.com/1.20.0/openapi.yaml` | pass | openapi 3.0 | 57 | DELETE 8, GET 23, POST 17, PUT 9 | 7 | `GET /apis` | `ce61d5ae` | many verbs; 7 of 57 callable anonymously |
| `gov.bc.ca/bcgnws/3.x.x/openapi.yaml` | pass | openapi 3.0 | 14 | GET 14 | 11 | `GET /featureCategories` | `ce61d5ae` | read only; 11 of 14 callable anonymously |
| `gov.bc.ca/jobposting/1.0.0/openapi.yaml` | pass | openapi 3.0 | 5 | GET 4, POST 1 | 4 | `GET /Industries` | `ce61d5ae` | 4 of 5 callable anonymously |
| `gov.bc.ca/news/1.0/openapi.yaml` | pass | openapi 3.0 | 27 | GET 27 | 9 | `GET /api/Home` | `ce61d5ae` | read only; 9 of 27 callable anonymously |
| `gov.bc.ca/open511/1.0.0/openapi.yaml` | pass | openapi 3.0 | 4 | GET 4 | 4 | `GET /areas` | `ce61d5ae` | read only |
| `greip.io/1.0.0/openapi.yaml` | pass | openapi 3.0 | 9 | GET 9 | 9 | `GET /ASNLookup` | `ce61d5ae` | read only |
| `groundhog-day.com/1.2.1/openapi.yaml` | pass | openapi 3.0 | 5 | GET 5 | 3 | `GET /api/v1` | `ce61d5ae` | read only; 3 of 5 callable anonymously |
| `gsa.gov/0.1/swagger.yaml` | pass | swagger 2 | 5 | GET 5 | 2 | `GET /api/metadata/` | `ce61d5ae` | read only; 2 of 5 callable anonymously; government |
| `handwrytten.com/1.0.0/swagger.yaml` | pass | swagger 2 | 30 | GET 7, POST 23 | 7 | `GET /cards/list` | `ce61d5ae` | 7 of 30 callable anonymously |
| `hetzner.cloud/1.0.0/openapi.yaml` | pass | openapi 3.0 | 144 | DELETE 11, GET 53, POST 69, PUT 11 | 1 | `GET /pricing` | `ce61d5ae` | many verbs; large surface; 1 of 144 callable anonymously |
| `hsbc.com/atm/2.2.1/swagger.yaml` | pass | swagger 2 | 5 | GET 5 | 1 | `GET /open-banking/v2.2/atms` | `ce61d5ae` | read only; 1 of 5 callable anonymously |
| `hsbc.com/branches/2.2.1/swagger.yaml` | pass | swagger 2 | 6 | GET 6 | 1 | `GET /open-banking/v2.2/branches` | `ce61d5ae` | read only; 1 of 6 callable anonymously |
| `hsbc.com/product/2.2.1/swagger.yaml` | pass | swagger 2 | 8 | GET 8 | 4 | `GET /open-banking/v2.2/business-current-accounts` | `ce61d5ae` | read only; 4 of 8 callable anonymously |
| `httpbin.org/0.9.2/openapi.yaml` | fail | openapi 3.0 | 78 | DELETE 6, GET 48, PATCH 6, POST 7, PUT 6, TRACE 5 | 22 | `GET /anything` | `ce61d5ae` | many verbs; 22 of 78 callable anonymously |
| `hubapi.com/crm/v3/openapi.yaml` | pass | openapi 3.0 | 6 | DELETE 1, GET 3, PATCH 1, POST 1 | 1 | `GET /sample-response` | `ce61d5ae` | many verbs; 1 of 6 callable anonymously |
| `ideaconsult.net/nanoreg/4.0.0/openapi.yaml` | pass | openapi 3.0 | 13 | GET 12, POST 1 | 1 | `GET /select` | `ce61d5ae` | 1 of 13 callable anonymously |
| `jokes.one/1.1/swagger.yaml` | pass | swagger 2 | 12 | DELETE 1, GET 7, PATCH 1, POST 2, PUT 1 | 2 | `GET /joke/list` | `ce61d5ae` | many verbs; 2 of 12 callable anonymously |
| `journy.io/1.0.0/openapi.yaml` | pass | openapi 3.0 | 15 | DELETE 2, GET 7, POST 6 | 6 | `GET /events` | `ce61d5ae` | 6 of 15 callable anonymously |
| `json2video.com/2.0.0/openapi.yaml` | pass | openapi 3.0 | 2 | GET 1, POST 1 | 1 | `GET /movies` | `ce61d5ae` | tiny surface; 1 of 2 callable anonymously |
| `languagetool.org/1.1.2/swagger.yaml` | pass | swagger 2 | 5 | GET 2, POST 3 | 1 | `GET /languages` | `ce61d5ae` | 1 of 5 callable anonymously |
| `lgtm.com/v1.0/openapi.yaml` | pass | openapi 3.0 | 29 | DELETE 2, GET 19, POST 6, PUT 2 | 1 | `GET /openapi` | `ce61d5ae` | many verbs; 1 of 29 callable anonymously |
| `maif.local/otoroshi/1.5.0-dev/openapi.yaml` | pass | openapi 3.0 | 102 | DELETE 16, GET 40, PATCH 14, POST 18, PUT 14 | 1 | `GET /health` | `ce61d5ae` | many verbs; large surface; 1 of 102 callable anonymously |
| `mastercard.com/BINTableResource/1.0/swagger.yaml` | pass | swagger 2 | 1 | GET 1 | 1 | `GET /binlisting` | `ce61d5ae` | read only; tiny surface |
| `mastercard.com/CurrencyConversionCalculator/1.0.0/swagger.yaml` | pass | swagger 2 | 3 | GET 3 | 1 | `GET /settlement-currencies` | `ce61d5ae` | read only; tiny surface; 1 of 3 callable anonymously |
| `mastercard.com/Locations/1.0.0/swagger.yaml` | pass | swagger 2 | 7 | GET 7 | 2 | `GET /atms/v1/country` | `ce61d5ae` | read only; 2 of 7 callable anonymously |
| `mastercard.com/MDES/2.0.7/swagger.yaml` | pass | swagger 2 | 15 | GET 1, POST 14 | 1 | `GET /systemstatus` | `ce61d5ae` | 1 of 15 callable anonymously |
| `medium.com/1.0/openapi.yaml` | pass | openapi 3.0 | 32 | GET 32 | 1 | `GET /` | `ce61d5ae` | read only; 1 of 32 callable anonymously |
| `mermade.org.uk/openapi-converter/1.0.0/openapi.yaml` | pass | openapi 3.0 | 6 | GET 4, POST 2 | 4 | `GET /badge` | `ce61d5ae` | 4 of 6 callable anonymously |
| `mozilla.com/kinto/1.22/openapi.yaml` | pass | openapi 3.0 | 19 | DELETE 1, GET 16, POST 2 | 6 | `GET /` | `ce61d5ae` | 6 of 19 callable anonymously |
| `naviplancentral.com/plan/v1/swagger.yaml` | pass | swagger 2 | 64 | GET 54, POST 10 | 4 | `GET /api/Advisors` | `ce61d5ae` | 4 of 64 callable anonymously |
| `ndhm.gov.in/ndhm-gateway/0.5/openapi.yaml` | pass | openapi 3.0 | 48 | GET 4, POST 44 | 3 | `GET /v0.5/.well-known/openid-configuration` | `ce61d5ae` | 3 of 48 callable anonymously |
| `ndhm.gov.in/ndhm-hip/0.5/openapi.yaml` | pass | openapi 3.0 | 30 | GET 3, POST 27 | 3 | `GET /v0.5/.well-known/openid-configuration` | `ce61d5ae` | 3 of 30 callable anonymously |
| `ndhm.gov.in/ndhm-hiu/0.5/openapi.yaml` | pass | openapi 3.0 | 32 | GET 3, POST 29 | 3 | `GET /v0.5/.well-known/openid-configuration` | `ce61d5ae` | 3 of 32 callable anonymously |
| `neowsapp.com/1.0/openapi.yaml` | pass | openapi 3.0 | 7 | GET 7 | 3 | `GET /rest/v1/neo/browse` | `ce61d5ae` | read only; 3 of 7 callable anonymously |
| `nexmo.com/media/1.0.2/openapi.yaml` | pass | openapi 3.0 | 4 | DELETE 1, GET 2, PUT 1 | 2 | `GET /` | `ce61d5ae` | 2 of 4 callable anonymously |
| `nowpayments.io/1.0.0/openapi.yaml` | pass | openapi 3.0 | 16 | DELETE 1, GET 12, PATCH 1, POST 2 | 2 | `GET /v1/sub-partner` | `ce61d5ae` | many verbs; 2 of 16 callable anonymously |
| `o2.cz/mobility/1.2.0/swagger.yaml` | pass | swagger 2 | 2 | GET 2 | 1 | `GET /info` | `ce61d5ae` | read only; tiny surface; 1 of 2 callable anonymously |
| `o2.cz/sociodemo/1.2.0/swagger.yaml` | pass | swagger 2 | 3 | GET 3 | 1 | `GET /info` | `ce61d5ae` | read only; tiny surface; 1 of 3 callable anonymously |
| `oceandrivers.com/1.0/openapi.yaml` | pass | openapi 3.0 | 10 | GET 10 | 1 | `GET /v1.0/getWebCams/` | `ce61d5ae` | read only; 1 of 10 callable anonymously |
| `okta.local/1.0.0/openapi.yaml` | pass | openapi 3.0 | 19 | DELETE 1, GET 5, POST 12, PUT 1 | 2 | `GET /api/v1/users` | `ce61d5ae` | many verbs; 2 of 19 callable anonymously |
| `openai.com/1.2.0/openapi.yaml` | pass | openapi 3.0 | 23 | DELETE 2, GET 8, POST 13 | 3 | `GET /files` | `ce61d5ae` | 3 of 23 callable anonymously |
| `openalpr.com/3.0.1/swagger.yaml` | pass | swagger 2 | 4 | GET 1, POST 3 | 1 | `GET /config` | `ce61d5ae` | 1 of 4 callable anonymously |
| `openfintech.io/2017-08-24/swagger.yaml` | pass | swagger 2 | 18 | GET 18 | 9 | `GET /banks` | `ce61d5ae` | read only; 9 of 18 callable anonymously |
| `openlinksw.com/osdb/1.0.0/openapi.yaml` | pass | openapi 3.0 | 10 | DELETE 1, GET 7, POST 2 | 3 | `GET /api/v1/login` | `ce61d5ae` | 3 of 10 callable anonymously |
| `openpolicy.local/0.28.0/openapi.yaml` | pass | openapi 3.0 | 16 | DELETE 2, GET 6, PATCH 1, POST 5, PUT 2 | 4 | `GET /health` | `ce61d5ae` | many verbs; 4 of 16 callable anonymously |
| `opentrials.local/0.0.1/swagger.yaml` | pass | swagger 2 | 17 | GET 17 | 4 | `GET /document_categories` | `ce61d5ae` | read only; 4 of 17 callable anonymously |
| `optimade.local/1.1.0~develop/openapi.yaml` | pass | openapi 3.0 | 8 | GET 8 | 2 | `GET /info` | `ce61d5ae` | read only; 2 of 8 callable anonymously |
| `parliament.uk/bills/v1/openapi.yaml` | pass | openapi 3.0 | 19 | GET 19 | 3 | `GET /api/v1/Rss/allbills.rss` | `ce61d5ae` | read only; 3 of 19 callable anonymously |
| `parliament.uk/search/Live/openapi.yaml` | pass | openapi 3.0 | 3 | GET 3 | 1 | `GET /description` | `ce61d5ae` | read only; tiny surface; 1 of 3 callable anonymously |
| `patientview.org/1.0/openapi.yaml` | pass | openapi 3.0 | 15 | DELETE 1, GET 10, POST 4 | 2 | `GET /patientmanagement/diagnoses` | `ce61d5ae` | 2 of 15 callable anonymously |
| `peel-ci.com/1.0.0/swagger.yaml` | pass | swagger 2 | 5 | GET 5 | 1 | `GET /health` | `ce61d5ae` | read only; 1 of 5 callable anonymously |
| `personio.de/personnel/1.0/openapi.yaml` | pass | openapi 3.0 | 13 | DELETE 2, GET 7, PATCH 1, POST 3 | 2 | `GET /company/employees` | `ce61d5ae` | many verbs; 2 of 13 callable anonymously |
| `poemist.com/1.0/swagger.yaml` | pass | swagger 2 | 1 | GET 1 | 1 | `GET /randompoems` | `ce61d5ae` | read only; tiny surface |
| `quarantine.country/1.0/swagger.yaml` | pass | swagger 2 | 6 | GET 6 | 1 | `GET /summary/latest` | `ce61d5ae` | read only; 1 of 6 callable anonymously |
| `randomlovecraft.com/1.0/openapi.yaml` | fail | openapi 3.0 | 4 | GET 4 | 2 | `GET /books` | `ce61d5ae` | read only; 2 of 4 callable anonymously |
| `rapidapi.com/ecowetter/1.0.0/openapi.yaml` | pass | openapi 3.0 | 1 | GET 1 | 1 | `GET /public/history` | `ce61d5ae` | read only; tiny surface |
| `rbaskets.in/1.0.0/swagger.yaml` | pass | swagger 2 | 11 | DELETE 2, GET 6, POST 1, PUT 2 | 1 | `GET /api/version` | `ce61d5ae` | many verbs; 1 of 11 callable anonymously |
| `ritekit.com/1.0.0/openapi.yaml` | pass | openapi 3.0 | 13 | GET 13 | 11 | `GET /v1/emoji/auto-emojify` | `ce61d5ae` | read only; 11 of 13 callable anonymously |
| `sheetlabs.com/rig-veda/1.2/swagger.yaml` | pass | swagger 2 | 1 | GET 1 | 1 | `GET /resources` | `ce61d5ae` | read only; tiny surface |
| `slideroom.com/v2/swagger.yaml` | pass | swagger 2 | 11 | DELETE 2, GET 5, POST 4 | 2 | `GET /api/v2/applicant/attributes/names` | `ce61d5ae` | 2 of 11 callable anonymously |
| `swagger.io/generator/2.4.31/swagger.yaml` | pass | swagger 2 | 7 | GET 5, POST 2 | 2 | `GET /gen/clients` | `ce61d5ae` | 2 of 7 callable anonymously |
| `telematicssdk.com/1.0.0/openapi.yaml` | pass | openapi 3.0 | 9 | GET 9 | 3 | `GET /statistics/v1/Scorings/individual/` | `ce61d5ae` | read only; 3 of 9 callable anonymously |
| `truanon.com/1.0.0/openapi.yaml` | pass | openapi 3.0 | 2 | GET 2 | 2 | `GET /api/get_profile` | `ce61d5ae` | read only; tiny surface |
| `visualcrossing.com/weather/4.6/openapi.yaml` | pass | openapi 3.0 | 5 | GET 5 | 2 | `GET /VisualCrossingWebServices/rest/services/weatherdata/forecast` | `ce61d5ae` | read only; 2 of 5 callable anonymously |
| `vonage.com/vgis/1.0.1/openapi.yaml` | pass | openapi 3.0 | 20 | DELETE 3, GET 10, POST 3, PUT 4 | 3 | `GET /self` | `ce61d5ae` | many verbs; 3 of 20 callable anonymously |
| `vtex.local/Intelligent-Search-API/0.1.12/openapi.yaml` | pass | openapi 3.0 | 7 | GET 7 | 1 | `GET /top_searches` | `ce61d5ae` | read only; 1 of 7 callable anonymously |
| `vtex.local/Session-Manager-API/1.0/openapi.yaml` | pass | openapi 3.0 | 4 | GET 2, PATCH 1, POST 1 | 2 | `GET /segments` | `ce61d5ae` | 2 of 4 callable anonymously |
| `wealthreader.com/1.0.0/openapi.yaml` | pass | openapi 3.0 | 3 | GET 2, POST 1 | 2 | `GET /entities` | `ce61d5ae` | tiny surface; 2 of 3 callable anonymously |
| `wellknown.ai/1.0.0/openapi.yaml` | pass | openapi 3.0 | 2 | GET 2 | 2 | `GET /api/plugins` | `ce61d5ae` | read only; tiny surface |
| `wikipathways.org/1.0/openapi.yaml` | pass | openapi 3.0 | 27 | GET 26, POST 1 | 1 | `GET /listOrganisms` | `ce61d5ae` | 1 of 27 callable anonymously |
| `zalando.com/v1.0/swagger.yaml` | pass | swagger 2 | 20 | GET 20 | 1 | `GET /domains` | `ce61d5ae` | read only; 1 of 20 callable anonymously |
