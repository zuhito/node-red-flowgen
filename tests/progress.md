# 実 API に対する検証の記録

公開されている API 定義を実際に呼び出し、curl のレスポンスと、生成した
フローの debug ノードが受け取った内容が一致するかを確かめた記録です。

成功した定義は対象から外します。同じものを繰り返し確かめるより、まだ
確かめていない定義に時間を使うためです。失敗した定義は残します。それが
調べ続ける理由だからです。

検証済み **117** 定義（うち成功 114）。

| 定義 | 結果 | 形式 | エンドポイント数 | メソッド内訳 | 実際に呼んだ数 | 到達確認に使った経路 | flowgen | この定義の特徴 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `1forge.com/0.0.1/swagger.yaml` | 成功 | swagger 2 | 2 | GET 2 | 2 | `GET /quotes` | `ce61d5ae` | 参照のみ、小規模 |
| `amadeus.com/amadeus-flight-price-analysis/1.0.1/openapi.yaml` | 成功 | openapi 3.0 | 1 | GET 1 | 1 | `GET /analytics/itinerary-price-metrics` | `ce61d5ae` | 参照のみ、小規模 |
| `amadeus.com/amadeus-location-score/1.0.2/openapi.yaml` | 成功 | openapi 3.0 | 1 | GET 1 | 1 | `GET /location/analytics/category-rated-areas` | `ce61d5ae` | 参照のみ、小規模 |
| `apache.org/qakka/v1/openapi.yaml` | 成功 | openapi 3.0 | 10 | DELETE 2, GET 5, POST 2, PUT 1 | 2 | `GET /queues` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 10 中 2 |
| `apicurio.local/registry/2.4.x/openapi.yaml` | 成功 | openapi 3.0 | 65 | DELETE 12, GET 32, POST 9, PUT 12 | 8 | `GET /admin/artifactTypes` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 65 中 8 |
| `apis.guru/2.2.0/openapi.yaml` | 成功 | openapi 3.0 | 7 | GET 7 | 3 | `GET /list.json` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 7 中 3 |
| `asuarez.dev/searchly/1.0/openapi.yaml` | 成功 | openapi 3.0 | 3 | GET 2, POST 1 | 2 | `GET /similarity/by_song` | `ce61d5ae` | 小規模、認証なしで呼べるのは 3 中 2 |
| `avaza.com/v1/swagger.yaml` | 成功 | swagger 2 | 86 | DELETE 7, GET 50, POST 21, PUT 8 | 1 | `GET /api/Currency` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 86 中 1 |
| `aviationdata.systems/v1/swagger.yaml` | 成功 | swagger 2 | 6 | GET 6 | 1 | `GET /v1/country_list` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 6 中 1 |
| `azure.com/alertsmanagement-AlertsManagement/2019-03-01-preview/swagger.yaml` | 成功 | swagger 2 | 10 | GET 8, POST 2 | 1 | `GET /providers/Microsoft.AlertsManagement/operations` | `ce61d5ae` | 認証なしで呼べるのは 10 中 1 |
| `azure.com/alertsmanagement-AlertsManagement/2019-05-05-preview/swagger.yaml` | 成功 | swagger 2 | 17 | DELETE 1, GET 12, PATCH 1, POST 2, PUT 1 | 2 | `GET /providers/Microsoft.AlertsManagement/alertsMetaData` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 17 中 2 |
| `azure.com/attestation/2018-09-01-preview/swagger.yaml` | 成功 | swagger 2 | 6 | GET 3, POST 2, PUT 1 | 3 | `GET /.well-known/openid-configuration` | `ce61d5ae` | 認証なしで呼べるのは 6 中 3 |
| `azure.com/dynamicstelemetry/2019-01-24/swagger.yaml` | 成功 | swagger 2 | 1 | GET 1 | 1 | `GET /providers/Microsoft.DynamicsTelemetry/operations` | `ce61d5ae` | 参照のみ、小規模 |
| `azure.com/iotcentral/preview/swagger.yaml` | 成功 | swagger 2 | 30 | DELETE 4, GET 18, POST 1, PUT 7 | 5 | `GET /apiTokens` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 30 中 5 |
| `balldontlie.io/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 7 | GET 7 | 7 | `GET /api/v1/games` | `ce61d5ae` | 参照のみ |
| `beezup.com/2.0/openapi.yaml` | 成功 | openapi 3.0 | 211 | DELETE 11, GET 86, HEAD 1, PATCH 2, POST 96, PUT 15 | 15 | `GET /v2/user/analytics/` | `ce61d5ae` | メソッドが多い、大規模、認証なしで呼べるのは 211 中 15 |
| `bigdatacloud.net/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 2 | GET 2 | 2 | `GET /data/ip-geolocation-full` | `ce61d5ae` | 参照のみ、小規模 |
| `bigredcloud.com/v1/openapi.yaml` | 成功 | openapi 3.0 | 111 | DELETE 13, GET 50, POST 20, PUT 28 | 30 | `GET /v1/accounts` | `ce61d5ae` | メソッドが多い、大規模、認証なしで呼べるのは 111 中 30 |
| `billbee.io/v1/openapi.yaml` | 成功 | openapi 3.0 | 75 | DELETE 5, GET 38, PATCH 3, POST 21, PUT 8 | 16 | `GET /api/v1/automaticprovision/termsinfo` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 75 中 16 |
| `bluemix.net/containers/3.0.0/openapi.yaml` | 成功 | openapi 3.0 | 47 | DELETE 5, GET 20, PATCH 1, POST 18, PUT 3 | 1 | `GET /containers/version` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 47 中 1 |
| `braze.com/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 31 | GET 30, POST 1 | 30 | `GET /campaigns/data_series` | `ce61d5ae` | 認証なしで呼べるのは 31 中 30 |
| `canada-holidays.ca/1.8.0/openapi.yaml` | 成功 | openapi 3.0 | 6 | GET 6 | 4 | `GET /api/v1` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 6 中 4 |
| `carbone.io/1.2.0/openapi.yaml` | 成功 | openapi 3.0 | 6 | DELETE 1, GET 3, POST 2 | 1 | `GET /status` | `ce61d5ae` | 認証なしで呼べるのは 6 中 1 |
| `clickup.com/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 2 | GET 1, POST 1 | 1 | `GET /questions` | `ce61d5ae` | 小規模、認証なしで呼べるのは 2 中 1 |
| `color.pizza/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 4 | GET 4 | 1 | `GET /lists/` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 4 中 1 |
| `consumerfinance.gov/1.0/swagger.yaml` | 失敗 | swagger 2 | 6 | GET 6 | 2 | `GET /data` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 6 中 2、政府機関 |
| `consumerfinance.gov/1.0/swagger.yaml` | 成功 | swagger 2 | 6 | GET 6 | 2 | `GET /data` | `85ebc9da` | 参照のみ、認証なしで呼べるのは 6 中 2、政府機関 |
| `contribly.com/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 44 | DELETE 4, GET 27, POST 13 | 8 | `GET /artifact-formats` | `ce61d5ae` | 認証なしで呼べるのは 44 中 8 |
| `corrently.io/2.0.0/openapi.yaml` | 成功 | openapi 3.0 | 26 | GET 16, POST 10 | 4 | `GET /alternative/ocpp/lastSessions` | `ce61d5ae` | 認証なしで呼べるのは 26 中 4 |
| `cpy.re/peertube/5.1.0/openapi.yaml` | 成功 | openapi 3.0 | 185 | DELETE 27, GET 83, POST 59, PUT 16 | 10 | `GET /api/v1/config` | `ce61d5ae` | メソッドが多い、大規模、認証なしで呼べるのは 185 中 10 |
| `crucible.local/1.0.0/swagger.yaml` | 成功 | swagger 2 | 79 | DELETE 7, GET 43, POST 28, PUT 1 | 2 | `GET /rest-service/projects-v1` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 79 中 2 |
| `deutschebahn.com/flinkster/v1/swagger.yaml` | 成功 | swagger 2 | 10 | GET 10 | 1 | `GET /index` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 10 中 1 |
| `dev.to/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 40 | DELETE 1, GET 26, POST 6, PUT 7 | 7 | `GET /api/articles` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 40 中 7 |
| `digitallocker.gov.in/authpartner/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 22 | GET 9, POST 13 | 1 | `GET /oauth2/2/files/issued` | `ce61d5ae` | 認証なしで呼べるのは 22 中 1 |
| `discourse.local/latest/openapi.yaml` | 成功 | openapi 3.1 | 84 | DELETE 6, GET 35, POST 22, PUT 21 | 9 | `GET /admin/backups.json` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 84 中 9 |
| `docker.com/hub/beta/openapi.yaml` | 成功 | openapi 3.0 | 28 | DELETE 1, GET 17, HEAD 2, PATCH 1, POST 5, PUT 2 | 5 | `GET /v2/access-tokens` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 28 中 5 |
| `dropx.io/1.0.0/swagger.yaml` | 成功 | swagger 2 | 7 | GET 7 | 1 | `GET /users/usage` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 7 中 1 |
| `enode.io/1.3.10/openapi.yaml` | 成功 | openapi 3.0 | 28 | DELETE 4, GET 15, POST 6, PUT 3 | 2 | `GET /health/ready` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 28 中 2 |
| `epa.gov/dfr/0.0.0/swagger.yaml` | 成功 | swagger 2 | 94 | GET 47, POST 47 | 5 | `GET /dfr_rest_services.air_3_yr_download` | `ce61d5ae` | 認証なしで呼べるのは 94 中 5、政府機関 |
| `etsi.local/MEC010-2_AppPkgMgmt/2.1.1/openapi.yaml` | 成功 | openapi 3.0 | 16 | DELETE 2, GET 8, PATCH 1, POST 3, PUT 2 | 1 | `GET /subscriptions` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 16 中 1 |
| `evemarketer.com/1.0.1/swagger.yaml` | 成功 | swagger 2 | 4 | GET 2, POST 2 | 1 | `GET /marketstat/json` | `ce61d5ae` | 認証なしで呼べるのは 4 中 1 |
| `exhibitday.com/v1/swagger.yaml` | 成功 | swagger 2 | 23 | DELETE 3, GET 14, PATCH 3, POST 3 | 1 | `GET /api/docs/Swagger` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 23 中 1 |
| `figshare.com/2.0.0/openapi.yaml` | 成功 | openapi 3.0 | 136 | DELETE 17, GET 63, POST 40, PUT 16 | 2 | `GET /categories` | `ce61d5ae` | メソッドが多い、大規模、認証なしで呼べるのは 136 中 2 |
| `fisheye.local/1.0.0/swagger.yaml` | 成功 | swagger 2 | 16 | GET 13, POST 3 | 1 | `GET /rest-service-fe/repositories-v1` | `ce61d5ae` | 認証なしで呼べるのは 16 中 1 |
| `getpostman.com/1.20.0/openapi.yaml` | 成功 | openapi 3.0 | 57 | DELETE 8, GET 23, POST 17, PUT 9 | 7 | `GET /apis` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 57 中 7 |
| `gov.bc.ca/bcgnws/3.x.x/openapi.yaml` | 成功 | openapi 3.0 | 14 | GET 14 | 11 | `GET /featureCategories` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 14 中 11 |
| `gov.bc.ca/jobposting/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 5 | GET 4, POST 1 | 4 | `GET /Industries` | `ce61d5ae` | 認証なしで呼べるのは 5 中 4 |
| `gov.bc.ca/news/1.0/openapi.yaml` | 成功 | openapi 3.0 | 27 | GET 27 | 9 | `GET /api/Home` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 27 中 9 |
| `gov.bc.ca/open511/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 4 | GET 4 | 4 | `GET /areas` | `ce61d5ae` | 参照のみ |
| `greip.io/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 9 | GET 9 | 9 | `GET /ASNLookup` | `ce61d5ae` | 参照のみ |
| `groundhog-day.com/1.2.1/openapi.yaml` | 成功 | openapi 3.0 | 5 | GET 5 | 3 | `GET /api/v1` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 5 中 3 |
| `gsa.gov/0.1/swagger.yaml` | 成功 | swagger 2 | 5 | GET 5 | 2 | `GET /api/metadata/` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 5 中 2、政府機関 |
| `handwrytten.com/1.0.0/swagger.yaml` | 成功 | swagger 2 | 30 | GET 7, POST 23 | 7 | `GET /cards/list` | `ce61d5ae` | 認証なしで呼べるのは 30 中 7 |
| `hetzner.cloud/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 144 | DELETE 11, GET 53, POST 69, PUT 11 | 1 | `GET /pricing` | `ce61d5ae` | メソッドが多い、大規模、認証なしで呼べるのは 144 中 1 |
| `hsbc.com/atm/2.2.1/swagger.yaml` | 成功 | swagger 2 | 5 | GET 5 | 1 | `GET /open-banking/v2.2/atms` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 5 中 1 |
| `hsbc.com/branches/2.2.1/swagger.yaml` | 成功 | swagger 2 | 6 | GET 6 | 1 | `GET /open-banking/v2.2/branches` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 6 中 1 |
| `hsbc.com/product/2.2.1/swagger.yaml` | 成功 | swagger 2 | 8 | GET 8 | 4 | `GET /open-banking/v2.2/business-current-accounts` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 8 中 4 |
| `httpbin.org/0.9.2/openapi.yaml` | 失敗 | openapi 3.0 | 78 | DELETE 6, GET 48, PATCH 6, POST 7, PUT 6, TRACE 5 | 22 | `GET /anything` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 78 中 22 |
| `httpbin.org/0.9.2/openapi.yaml` | 成功 | openapi 3.0 | 78 | DELETE 6, GET 48, PATCH 6, POST 7, PUT 6, TRACE 5 | 22 | `GET /anything` | `85ebc9da` | メソッドが多い、認証なしで呼べるのは 78 中 22 |
| `hubapi.com/crm/v3/openapi.yaml` | 成功 | openapi 3.0 | 6 | DELETE 1, GET 3, PATCH 1, POST 1 | 1 | `GET /sample-response` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 6 中 1 |
| `ideaconsult.net/nanoreg/4.0.0/openapi.yaml` | 成功 | openapi 3.0 | 13 | GET 12, POST 1 | 1 | `GET /select` | `ce61d5ae` | 認証なしで呼べるのは 13 中 1 |
| `jokes.one/1.1/swagger.yaml` | 成功 | swagger 2 | 12 | DELETE 1, GET 7, PATCH 1, POST 2, PUT 1 | 2 | `GET /joke/list` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 12 中 2 |
| `journy.io/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 15 | DELETE 2, GET 7, POST 6 | 6 | `GET /events` | `ce61d5ae` | 認証なしで呼べるのは 15 中 6 |
| `json2video.com/2.0.0/openapi.yaml` | 成功 | openapi 3.0 | 2 | GET 1, POST 1 | 1 | `GET /movies` | `ce61d5ae` | 小規模、認証なしで呼べるのは 2 中 1 |
| `languagetool.org/1.1.2/swagger.yaml` | 成功 | swagger 2 | 5 | GET 2, POST 3 | 1 | `GET /languages` | `ce61d5ae` | 認証なしで呼べるのは 5 中 1 |
| `lgtm.com/v1.0/openapi.yaml` | 成功 | openapi 3.0 | 29 | DELETE 2, GET 19, POST 6, PUT 2 | 1 | `GET /openapi` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 29 中 1 |
| `maif.local/otoroshi/1.5.0-dev/openapi.yaml` | 成功 | openapi 3.0 | 102 | DELETE 16, GET 40, PATCH 14, POST 18, PUT 14 | 1 | `GET /health` | `ce61d5ae` | メソッドが多い、大規模、認証なしで呼べるのは 102 中 1 |
| `mastercard.com/BINTableResource/1.0/swagger.yaml` | 成功 | swagger 2 | 1 | GET 1 | 1 | `GET /binlisting` | `ce61d5ae` | 参照のみ、小規模 |
| `mastercard.com/CurrencyConversionCalculator/1.0.0/swagger.yaml` | 成功 | swagger 2 | 3 | GET 3 | 1 | `GET /settlement-currencies` | `ce61d5ae` | 参照のみ、小規模、認証なしで呼べるのは 3 中 1 |
| `mastercard.com/Locations/1.0.0/swagger.yaml` | 成功 | swagger 2 | 7 | GET 7 | 2 | `GET /atms/v1/country` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 7 中 2 |
| `mastercard.com/MDES/2.0.7/swagger.yaml` | 成功 | swagger 2 | 15 | GET 1, POST 14 | 1 | `GET /systemstatus` | `ce61d5ae` | 認証なしで呼べるのは 15 中 1 |
| `medium.com/1.0/openapi.yaml` | 成功 | openapi 3.0 | 32 | GET 32 | 1 | `GET /` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 32 中 1 |
| `mermade.org.uk/openapi-converter/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 6 | GET 4, POST 2 | 4 | `GET /badge` | `ce61d5ae` | 認証なしで呼べるのは 6 中 4 |
| `mozilla.com/kinto/1.22/openapi.yaml` | 成功 | openapi 3.0 | 19 | DELETE 1, GET 16, POST 2 | 6 | `GET /` | `ce61d5ae` | 認証なしで呼べるのは 19 中 6 |
| `naviplancentral.com/plan/v1/swagger.yaml` | 成功 | swagger 2 | 64 | GET 54, POST 10 | 4 | `GET /api/Advisors` | `ce61d5ae` | 認証なしで呼べるのは 64 中 4 |
| `ndhm.gov.in/ndhm-gateway/0.5/openapi.yaml` | 成功 | openapi 3.0 | 48 | GET 4, POST 44 | 3 | `GET /v0.5/.well-known/openid-configuration` | `ce61d5ae` | 認証なしで呼べるのは 48 中 3 |
| `ndhm.gov.in/ndhm-hip/0.5/openapi.yaml` | 成功 | openapi 3.0 | 30 | GET 3, POST 27 | 3 | `GET /v0.5/.well-known/openid-configuration` | `ce61d5ae` | 認証なしで呼べるのは 30 中 3 |
| `ndhm.gov.in/ndhm-hiu/0.5/openapi.yaml` | 成功 | openapi 3.0 | 32 | GET 3, POST 29 | 3 | `GET /v0.5/.well-known/openid-configuration` | `ce61d5ae` | 認証なしで呼べるのは 32 中 3 |
| `neowsapp.com/1.0/openapi.yaml` | 成功 | openapi 3.0 | 7 | GET 7 | 3 | `GET /rest/v1/neo/browse` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 7 中 3 |
| `nexmo.com/media/1.0.2/openapi.yaml` | 成功 | openapi 3.0 | 4 | DELETE 1, GET 2, PUT 1 | 2 | `GET /` | `ce61d5ae` | 認証なしで呼べるのは 4 中 2 |
| `nowpayments.io/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 16 | DELETE 1, GET 12, PATCH 1, POST 2 | 2 | `GET /v1/sub-partner` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 16 中 2 |
| `o2.cz/mobility/1.2.0/swagger.yaml` | 成功 | swagger 2 | 2 | GET 2 | 1 | `GET /info` | `ce61d5ae` | 参照のみ、小規模、認証なしで呼べるのは 2 中 1 |
| `o2.cz/sociodemo/1.2.0/swagger.yaml` | 成功 | swagger 2 | 3 | GET 3 | 1 | `GET /info` | `ce61d5ae` | 参照のみ、小規模、認証なしで呼べるのは 3 中 1 |
| `oceandrivers.com/1.0/openapi.yaml` | 成功 | openapi 3.0 | 10 | GET 10 | 1 | `GET /v1.0/getWebCams/` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 10 中 1 |
| `okta.local/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 19 | DELETE 1, GET 5, POST 12, PUT 1 | 2 | `GET /api/v1/users` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 19 中 2 |
| `openai.com/1.2.0/openapi.yaml` | 成功 | openapi 3.0 | 23 | DELETE 2, GET 8, POST 13 | 3 | `GET /files` | `ce61d5ae` | 認証なしで呼べるのは 23 中 3 |
| `openalpr.com/3.0.1/swagger.yaml` | 成功 | swagger 2 | 4 | GET 1, POST 3 | 1 | `GET /config` | `ce61d5ae` | 認証なしで呼べるのは 4 中 1 |
| `openfintech.io/2017-08-24/swagger.yaml` | 成功 | swagger 2 | 18 | GET 18 | 9 | `GET /banks` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 18 中 9 |
| `openlinksw.com/osdb/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 10 | DELETE 1, GET 7, POST 2 | 3 | `GET /api/v1/login` | `ce61d5ae` | 認証なしで呼べるのは 10 中 3 |
| `openpolicy.local/0.28.0/openapi.yaml` | 成功 | openapi 3.0 | 16 | DELETE 2, GET 6, PATCH 1, POST 5, PUT 2 | 4 | `GET /health` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 16 中 4 |
| `opentrials.local/0.0.1/swagger.yaml` | 成功 | swagger 2 | 17 | GET 17 | 4 | `GET /document_categories` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 17 中 4 |
| `optimade.local/1.1.0~develop/openapi.yaml` | 成功 | openapi 3.0 | 8 | GET 8 | 2 | `GET /info` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 8 中 2 |
| `parliament.uk/bills/v1/openapi.yaml` | 成功 | openapi 3.0 | 19 | GET 19 | 3 | `GET /api/v1/Rss/allbills.rss` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 19 中 3 |
| `parliament.uk/search/Live/openapi.yaml` | 成功 | openapi 3.0 | 3 | GET 3 | 1 | `GET /description` | `ce61d5ae` | 参照のみ、小規模、認証なしで呼べるのは 3 中 1 |
| `patientview.org/1.0/openapi.yaml` | 成功 | openapi 3.0 | 15 | DELETE 1, GET 10, POST 4 | 2 | `GET /patientmanagement/diagnoses` | `ce61d5ae` | 認証なしで呼べるのは 15 中 2 |
| `peel-ci.com/1.0.0/swagger.yaml` | 成功 | swagger 2 | 5 | GET 5 | 1 | `GET /health` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 5 中 1 |
| `personio.de/personnel/1.0/openapi.yaml` | 成功 | openapi 3.0 | 13 | DELETE 2, GET 7, PATCH 1, POST 3 | 2 | `GET /company/employees` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 13 中 2 |
| `poemist.com/1.0/swagger.yaml` | 成功 | swagger 2 | 1 | GET 1 | 1 | `GET /randompoems` | `ce61d5ae` | 参照のみ、小規模 |
| `quarantine.country/1.0/swagger.yaml` | 成功 | swagger 2 | 6 | GET 6 | 1 | `GET /summary/latest` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 6 中 1 |
| `randomlovecraft.com/1.0/openapi.yaml` | 失敗 | openapi 3.0 | 4 | GET 4 | 2 | `GET /books` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 4 中 2 |
| `randomlovecraft.com/1.0/openapi.yaml` | 成功 | openapi 3.0 | 4 | GET 4 | 2 | `GET /books` | `85ebc9da` | 参照のみ、認証なしで呼べるのは 4 中 2 |
| `rapidapi.com/ecowetter/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 1 | GET 1 | 1 | `GET /public/history` | `ce61d5ae` | 参照のみ、小規模 |
| `rbaskets.in/1.0.0/swagger.yaml` | 成功 | swagger 2 | 11 | DELETE 2, GET 6, POST 1, PUT 2 | 1 | `GET /api/version` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 11 中 1 |
| `ritekit.com/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 13 | GET 13 | 11 | `GET /v1/emoji/auto-emojify` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 13 中 11 |
| `sheetlabs.com/rig-veda/1.2/swagger.yaml` | 成功 | swagger 2 | 1 | GET 1 | 1 | `GET /resources` | `ce61d5ae` | 参照のみ、小規模 |
| `slideroom.com/v2/swagger.yaml` | 成功 | swagger 2 | 11 | DELETE 2, GET 5, POST 4 | 2 | `GET /api/v2/applicant/attributes/names` | `ce61d5ae` | 認証なしで呼べるのは 11 中 2 |
| `swagger.io/generator/2.4.31/swagger.yaml` | 成功 | swagger 2 | 7 | GET 5, POST 2 | 2 | `GET /gen/clients` | `ce61d5ae` | 認証なしで呼べるのは 7 中 2 |
| `telematicssdk.com/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 9 | GET 9 | 3 | `GET /statistics/v1/Scorings/individual/` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 9 中 3 |
| `truanon.com/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 2 | GET 2 | 2 | `GET /api/get_profile` | `ce61d5ae` | 参照のみ、小規模 |
| `visualcrossing.com/weather/4.6/openapi.yaml` | 成功 | openapi 3.0 | 5 | GET 5 | 2 | `GET /VisualCrossingWebServices/rest/services/weatherdata/forecast` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 5 中 2 |
| `vonage.com/vgis/1.0.1/openapi.yaml` | 成功 | openapi 3.0 | 20 | DELETE 3, GET 10, POST 3, PUT 4 | 3 | `GET /self` | `ce61d5ae` | メソッドが多い、認証なしで呼べるのは 20 中 3 |
| `vtex.local/Intelligent-Search-API/0.1.12/openapi.yaml` | 成功 | openapi 3.0 | 7 | GET 7 | 1 | `GET /top_searches` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 7 中 1 |
| `vtex.local/Session-Manager-API/1.0/openapi.yaml` | 成功 | openapi 3.0 | 4 | GET 2, PATCH 1, POST 1 | 2 | `GET /segments` | `ce61d5ae` | 認証なしで呼べるのは 4 中 2 |
| `wealthreader.com/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 3 | GET 2, POST 1 | 2 | `GET /entities` | `ce61d5ae` | 小規模、認証なしで呼べるのは 3 中 2 |
| `wellknown.ai/1.0.0/openapi.yaml` | 成功 | openapi 3.0 | 2 | GET 2 | 2 | `GET /api/plugins` | `ce61d5ae` | 参照のみ、小規模 |
| `wikipathways.org/1.0/openapi.yaml` | 成功 | openapi 3.0 | 27 | GET 26, POST 1 | 1 | `GET /listOrganisms` | `ce61d5ae` | 認証なしで呼べるのは 27 中 1 |
| `zalando.com/v1.0/swagger.yaml` | 成功 | swagger 2 | 20 | GET 20 | 1 | `GET /domains` | `ce61d5ae` | 参照のみ、認証なしで呼べるのは 20 中 1 |
