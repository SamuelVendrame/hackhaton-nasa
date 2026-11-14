# Catálogo de fontes de dados

Fontes listadas na aba **Resources** do desafio *Field Shift: Adapting Farms with NASA Data*
(<https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/?tab=resources>).
O texto original da aba está em [../RESOURCES.md](../RESOURCES.md).

- Consultado em: 2026-11-14.
- Itens marcados com **†** vêm de conhecimento geral sobre a fonte e **não** foram confirmados no site nesta data (a página não informava, ou não pôde ser lida). Confirme antes de depender deles.
- "Earthdata Login" é a conta gratuita da NASA (<https://urs.earthdata.nasa.gov>), usada para baixar dados dos arquivos da NASA†.

## Visão geral

| # | Fonte | O que traz | Cobertura | Formatos principais |
|---|---|---|---|---|
| 1 | [SMAP](#1-smap) | Umidade do solo, congelamento/degelo | Global | HDF5† |
| 2 | [GPM / IMERG](#2-gpm--imerg) | Precipitação | Global | HDF5, NetCDF, GeoTIFF |
| 3 | [Landsat](#3-landsat) | Imagem multiespectral, refletância, temperatura | Global | GeoTIFF/COG† |
| 4 | [MODIS](#4-modis) | Refletância, índices de vegetação, temperatura | Global | HDF-EOS (HDF4)† |
| 5 | [VIIRS](#5-viirs) | Continuidade do MODIS | Global | HDF5 / NetCDF-4† |
| 6 | [NASA POWER](#6-nasa-power) | Meteorologia e radiação solar para agricultura | Global | JSON, CSV, NetCDF, ASCII, ICASA |
| 7 | [SRTM](#7-srtm) | Elevação (modelo digital de terreno) | Quase global | HGT, NetCDF† |
| 8 | [ECOSTRESS](#8-ecostress) | Temperatura da superfície, evapotranspiração, estresse | Faixa da ISS† | HDF5, COG† |
| 9 | [USDA Ag Data Commons](#9-usda-ag-data-commons) | Repositório de datasets de pesquisa agrícola | Principalmente EUA† | Variados (por dataset)† |
| 10 | [Web Soil Survey](#10-web-soil-survey-wss) | Mapas e propriedades de solo por área | EUA | PDF, shapefile + tabelas† |
| 11 | [CDL / CropScape](#11-cropland-data-layer-cdl--cropscape) | Classificação anual de culturas | EUA | GeoTIFF† |
| 12 | [PRISM](#12-prism) | Clima em grade (chuva, temperatura, normais) | EUA | NetCDF; BIL/ASCII† |
| 13 | [SSURGO / STATSGO2](#13-ssurgo--statsgo2) | Atributos de solo em escala de talhão e regional | EUA | Shapefile, tabelas, geodatabase† |
| 14 | [NAIP](#14-naip) | Imagem aérea de alta resolução | EUA | GeoTIFF, JPEG2000 |
| 15 | [NLCD](#15-nlcd) | Uso e cobertura da terra | EUA | GeoTIFF / IMG† |
| 16 | [NLDAS / GLDAS](#16-nldas--gldas) | Séries contínuas de clima e superfície (modelo) | América do Norte / Global | NetCDF, GRIB |
| 17 | [FAO GAEZ](#17-fao-gaez) | Aptidão agroclimática por cultura | Global | GeoTIFF† |
| 18 | [CoCoRaHS](#18-cocorahs) | Chuva, granizo e neve medidos por voluntários | América do Norte | Relatórios web; CSV/XML† |
| 19 | [USGS NWIS](#19-usgs-nwis) | Vazão, nível de rios e poços, qualidade da água | EUA | JSON, WaterML, texto tabulado† |
| 20 | [USDA AMS Market News](#20-usda-ams-market-news) | Preços e condições de mercado | EUA | Relatórios; JSON via API† |
| 21 | [USDA NASS QuickStats](#21-usda-nass-quickstats) | Estatísticas agrícolas (produtividade, área) | EUA | JSON, XML, CSV |
| 22 | [OpenET](#22-openet) | Evapotranspiração em escala de talhão | EUA | CSV / GeoTIFF via API† |
| 23 | [LANDFIRE](#23-landfire) | Vegetação, combustível e paisagem | EUA | GeoTIFF† |
| 24 | [GEDI](#24-gedi) | Estrutura da vegetação e biomassa (lidar) | Faixa da ISS† | HDF5, GeoTIFF† |
| 25 | [Sentinel-2](#25-copernicus-sentinel-2-esa) | Imagem multiespectral 10–20 m | Global | SAFE / JPEG2000† |
| 26 | [ERA5](#26-era5-ecmwf) | Reanálise climática horária | Global | GRIB; NetCDF† |

**Ponto de atenção:** 13 das 26 fontes cobrem só os EUA ou a América do Norte (9 a 15 e 18 a 23). Na 16, o NLDAS também é só América do Norte, mas o GLDAS é global. Para áreas fora dos EUA, as utilizáveis são as fontes de satélite da NASA (1 a 8 e 24), GLDAS (16), GAEZ (17), Sentinel-2 (25) e ERA5 (26).

---

## Dados da NASA

### 1. SMAP

<https://www.earthdata.nasa.gov/data/platforms/space-based-platforms/smap>

- **O que traz:** umidade do solo na superfície, estado de congelamento/degelo, umidade na zona de raízes (produto L4) e troca líquida de carbono (L4).
- **Resolução e período:** grades de 36 km (radiômetro), 9 km (produtos "enhanced" e L4) e 3 km (radar, só de abril a julho de 2015, quando o radar falhou). Revisita a cada 2–3 dias; L3 é composto diário; L4 de umidade é de 3 em 3 horas. Dados desde 31/03/2015.
- **Formatos:** HDF5†. Recortes em GeoTIFF/NetCDF pelo AppEEARS†.
- **Acesso:** NSIDC DAAC (principal), ASF DAAC e PO.DAAC; busca pelo Earthdata Search. Há dados em tempo quase real. Requer Earthdata Login†.

### 2. GPM / IMERG

<https://gpm.nasa.gov/data>

- **O que traz:** estimativa de precipitação (chuva e neve) combinando vários satélites.
- **Resolução e período:** 0,1° (cerca de 10 km), a cada 30 minutos, global, de janeiro de 1998 até hoje. Três versões: *Early* (4 h de atraso), *Late* (12 h) e *Final* (3,5 meses, a mais precisa).
- **Formatos:** HDF5, NetCDF e GeoTIFF; também OPeNDAP. O Giovanni exporta GeoTIFF, KMZ e NetCDF.
- **Acesso:** GES DISC (download e recorte), Giovanni (análise e recorte por região; pede conta Earthdata), PPS (pede cadastro), Worldview e IMERG Global Viewer (só visualização). Acumulados de 1 dia, 3 dias, 7 dias e 1 mês também existem em GeoTIFF.

### 3. Landsat

<https://earthexplorer.usgs.gov/>

- **O que traz:** imagens multiespectrais; Level-1 (cenas), Level-2 (refletância e temperatura de superfície), e nos EUA também ARD em blocos e produtos Level-3 (área queimada, água superficial, neve). Índices como NDVI e SAVI sob demanda pelo ESPA.
- **Resolução e período:** 30 m (segundo a página do desafio); revisita de 16 dias por satélite†. Arquivo desde 1972 (Landsat 1–9).
- **Formatos:** GeoTIFF / Cloud Optimized GeoTIFF†.
- **Acesso:** EarthExplorer (busca e download), GloVis, API M2M (REST/JSON), bucket na AWS com metadados STAC, ESPA (processamento sob demanda). Exige conta gratuita do USGS.

### 4. MODIS

<https://lpdaac.usgs.gov/products/> (redireciona para <https://www.earthdata.nasa.gov/centers/lp-daac>)

- **O que traz:** refletância de superfície, índices de vegetação (NDVI, EVI), temperatura da superfície, evapotranspiração e outros produtos de terra†.
- **Resolução e período:** 250 m a 1000 m (segundo a página do desafio); produtos diários e compostos de 8 e 16 dias†; desde 2000†.
- **Formatos:** HDF-EOS (HDF4)†. Recortes em GeoTIFF/NetCDF/CSV pelo AppEEARS†.
- **Acesso:** LP DAAC via Earthdata Search; AppEEARS para recorte por ponto ou área; notebooks Python no GitHub do LP DAAC. O mesmo centro distribui ASTER, VIIRS, ECOSTRESS, EMIT, GEDI, HLS, SRTM e NASADEM.

### 5. VIIRS

<https://search.earthdata.nasa.gov/search?q=VIIRS>

- **O que traz:** os mesmos tipos de produto do MODIS (refletância, índices de vegetação, temperatura), como continuidade da série†.
- **Resolução e período:** 375 m a 1000 m†; desde 2012†.
- **Formatos:** HDF5 / NetCDF-4†.
- **Acesso:** Earthdata Search e AppEEARS.
- **Observação:** a página do LP DAAC informa que as aquisições do VIIRS do satélite Suomi NPP cessaram em 02/11/2026 e orienta usar os produtos do NOAA-20 e NOAA-21.

### 6. NASA POWER

<https://power.larc.nasa.gov/>

- **O que traz:** mais de 300 parâmetros meteorológicos e solares prontos para uso (temperatura, umidade, radiação, vento, precipitação†), com uma comunidade voltada à agricultura (AG).
- **Resolução e período:** resolução nativa da fonte (os exemplos regionais usam grade de 0,5°); dados diários de 01/01/1981 até quase tempo real. Há também níveis horário, mensal e climatologia†.
- **Formatos:** JSON, CSV, NetCDF, ASCII e ICASA (este último só para ponto único, voltado a modelos de cultura).
- **Acesso:** API REST (ponto ou região), Data Access Viewer (interface web), bucket no AWS Open Data e serviços geoespaciais ArcGIS. Sem chave de API†.
- **Observação:** é a fonte mais simples de integrar: uma chamada HTTP por coordenada devolve a série pronta.

### 7. SRTM

<https://www.earthdata.nasa.gov/data/instruments/srtm>

- **O que traz:** modelo digital de elevação obtido por radar; base para declividade, escoamento e risco de erosão.
- **Resolução e período:** cerca de 80% da superfície terrestre; coleta única em fevereiro de 2000. Resoluções de 1 arco-segundo (~30 m) e 3 arco-segundos (~90 m)†.
- **Formatos:** HGT e NetCDF†; GeoTIFF por outras ferramentas†.
- **Acesso:** LP DAAC via Earthdata Search (28 datasets listados); o NASADEM é a versão reprocessada, no mesmo centro.

### 8. ECOSTRESS

<https://ecostress.jpl.nasa.gov/data>

- **O que traz:** temperatura e emissividade da superfície e máscara de nuvem (L2); evapotranspiração pelos métodos PT-JPL e ALEXI (L3); índice de estresse evaporativo (ESI) e eficiência no uso da água (WUE) (L4).
- **Resolução e período:** ~70 m†; instrumento na Estação Espacial desde 2018, com horário de passagem variável e cobertura limitada à faixa de latitudes da ISS†. A Coleção 2 é a atual; a Coleção 1 foi descontinuada em 2025.
- **Formatos:** HDF5 (faixas) e COG em blocos (Coleção 2)†; GeoTIFF pelo AppEEARS.
- **Acesso:** Earthdata Search e AppEEARS (recorte por ponto e área); há script Python no GitHub para converter faixa em grade.

### 16. NLDAS / GLDAS

<https://www.earthdata.nasa.gov/> (buscar "NLDAS" ou "GLDAS" no Earthdata Search) · detalhes em <https://ldas.gsfc.nasa.gov/>

- **O que traz:** saídas de modelos de superfície alimentados por satélite e estações: umidade do solo, fluxos de superfície, neve, precipitação, radiação, temperatura.
- **Resolução e período:**
  - **NLDAS:** grade de 1/8°, horária, América do Norte central (25–53°N), desde janeiro de 1979, com ~4 dias de atraso.
  - **GLDAS:** global, 1° e 0,25°, de 1948 até hoje; passos de 3 horas e mensal†.
- **Formatos:** NetCDF†; GRIB-1 nas versões antigas do NLDAS-2 (sem atualização diária desde 01/08/2024). O Giovanni exporta NetCDF, GeoTIFF e KMZ.
- **Acesso:** GES DISC (HTTPS, recorte por área, período e variável) e Giovanni. Requer Earthdata Login†.

### 24. GEDI

<https://gedi.umd.edu/data>

- **O que traz:** medições a laser da estrutura da vegetação: formas de onda (L1), altura do dossel, elevação do terreno, métricas RH e índice de área foliar por pegada (L2), altura do dossel em grade (L3), biomassa acima do solo por pegada (L4A) e em grade de 1 km (L4B).
- **Resolução e período:** pegadas de ~25 m†; a bordo da ISS, operação científica desde 25/03/2019; cobertura limitada à faixa de latitudes da ISS†.
- **Formatos:** HDF5 nos produtos por pegada e GeoTIFF nos produtos em grade†.
- **Acesso:** L1 e L2 no LP DAAC; L3 e L4 no ORNL DAAC.
- **Observação:** mais útil em vegetação alta; serve como contexto do entorno das lavouras, não para a cultura em si.

## Solo

### 10. Web Soil Survey (WSS)

<https://websoilsurvey.nrcs.usda.gov/app/>

- **O que traz:** mapas de solo e descrições detalhadas para uma área de interesse desenhada no mapa, com aptidão para diferentes usos. É a interface oficial sobre os dados SSURGO.
- **Cobertura:** mais de 95% dos condados dos EUA.
- **Formatos:** relatório personalizado em PDF†; download do SSURGO da área em zip (shapefile + tabelas de texto)†.
- **Acesso:** aplicação web, sem API própria; para acesso programático, usar o Soil Data Access (item 13).

### 13. SSURGO / STATSGO2

<https://www.nrcs.usda.gov/resources/data-and-reports/soils>

- **O que traz:** atributos de solo: textura, matéria orgânica, classe de drenagem, grupo hidrológico, fatores de erosão, camadas restritivas, capacidade de retenção de água (segundo a página do desafio).
- **Resolução:** SSURGO em escala de talhão (1:12.000 a 1:24.000)†; STATSGO2 em escala regional (1:250.000)†. EUA.
- **Formatos:** shapefile + tabelas de texto, e geodatabase (gSSURGO, com versão raster)†.
- **Acesso:** Web Soil Survey, Geospatial Data Gateway e **Soil Data Access** (<https://sdmdataaccess.nrcs.usda.gov/>), que atende consultas por área de interesse em tempo real, com atributos tabulares selecionados, entregues em zip. O serviço fica fora do ar entre 0h e 2h (horário das Montanhas, EUA).
- **Observação:** a página do NRCS não respondeu na consulta de hoje.

## Uso da terra, culturas e imagens

### 11. Cropland Data Layer (CDL) / CropScape

<https://nassgeodata.gmu.edu/CropScape/> · informações em <https://www.nass.usda.gov/Research_and_Science/Cropland/SARS1a.php>

- **O que traz:** raster anual com a cultura plantada em cada pixel (milho, soja, algodão, trigo, alfafa etc.). Permite reconstruir a rotação histórica de um talhão.
- **Resolução e período:** 30 m até 2023; 10 m a partir de 2024, com versão reamostrada para 30 m. EUA continental (Havaí em produto separado). CDL de 2025 publicado em 27/02/2026; todos os anos disponíveis para download.
- **Formatos:** GeoTIFF†.
- **Acesso:** CropScape (visualização, recorte e estatísticas por área; tem serviços web†), CroplandCROS (<https://croplandcros.scinet.usda.gov>), página de download nacional do NASS e um visualizador baseado no Google Earth Engine.
- **Observação:** o certificado do site do CropScape foi rejeitado na consulta de hoje.

### 14. NAIP

<https://naip-usdaonline.hub.arcgis.com/>

- **O que traz:** imagem aérea da estação de crescimento, em cor natural (RGB) ou com infravermelho próximo (RGB + NIR).
- **Resolução e período:** 1 m de 2003 a 2017; 0,6 m a partir de 2018. EUA continental, renovado a cada 3 anos ou menos. Blocos de 3,75 × 3,75 minutos, com até 10% de nuvem.
- **Formatos:** GeoTIFF e JPEG2000 (compressão 10:1 com perda).
- **Acesso:** EarthExplorer (categoria Aerial Photography); o hub do link é um portal ArcGIS com serviços de imagem†.

### 15. NLCD

<https://www.usgs.gov/centers/eros/science/national-land-cover-database>

- **O que traz:** cobertura da terra em 16 classes, índice de mudança de cobertura, percentual de superfície impermeável, datas de distúrbio florestal e cobertura de copa.
- **Resolução e período:** 30 m, EUA continental. Série legada com 9 épocas (2001 a 2021); o **Annual NLCD** é o produto atual, anual.
- **Formatos:** GeoTIFF / ERDAS IMG†.
- **Acesso:** <https://www.mrlc.gov> (visualizador e download) e catálogo ScienceBase.
- **Observação:** o site mrlc.gov recusou conexão na consulta de hoje.

### 23. LANDFIRE

<https://www.landfire.gov>

- **O que traz:** tipo e condição da vegetação, modelos de combustível e características da paisagem (segundo a página do desafio); também altura e cobertura de vegetação, distúrbios e topografia†.
- **Resolução:** 30 m, EUA†.
- **Formatos:** GeoTIFF†.
- **Acesso:** visualizador com download por área e mosaicos completos; há serviço de produtos para pedidos automatizados†.
- **Observação:** o site recusou conexão na consulta de hoje; nada desta ficha além da descrição do desafio foi confirmado.

### 17. FAO GAEZ

<https://gaez.fao.org>

- **O que traz:** camadas globais de aptidão agroclimática para dezenas de culturas, restrições de solo, indicadores de disponibilidade de água, produtividade potencial e avaliação da produtividade da terra (segundo a página do desafio).
- **Resolução e período:** grade de ~5 minutos de arco (~9 km)†; períodos históricos e cenários climáticos futuros†.
- **Formatos:** raster GeoTIFF†.
- **Acesso:** GAEZ v4 Data Portal (visualizador com download por camada)†.
- **Observação:** o portal é uma aplicação que não pôde ser lida automaticamente; só o título "GAEZ v4 Data Portal" foi confirmado.

## Clima e água

### 12. PRISM

<https://prism.oregonstate.edu>

- **O que traz:** clima em grade com correção de relevo: precipitação, temperatura mínima, média e máxima, irradiância solar, indicador de seca e normais climatológicas.
- **Resolução e período:** 4 km e 800 m. Diário de 1981 até hoje; mensal e anual de 1895 até hoje; normais de 30 anos (1991–2020). EUA.
- **Formatos:** NetCDF (anunciado no site); BIL e ASCII grid nas distribuições tradicionais†.
- **Acesso:** download em massa gratuito, serviços web, FTP, e Data Explorer para séries por ponto (até 500 pontos por pedido).

### 18. CoCoRaHS

<https://www.cocorahs.org/Maps>

- **O que traz:** medições diárias de chuva, granizo e neve feitas por voluntários, além de relatórios de evapotranspiração, umidade do solo, monitoramento de condições e acumulados de vários dias.
- **Cobertura:** estações pontuais na América do Norte.
- **Formatos:** relatórios em páginas web; exportação em CSV/XML†.
- **Acesso:** seção "View Data" (listas pesquisáveis por data e estação) e mapas interativos. Serve para validar a chuva estimada por satélite (IMERG).

### 19. USGS NWIS

<https://waterdata.usgs.gov/nwis>

- **O que traz:** vazão e nível de rios, níveis de água subterrânea e qualidade da água; valores instantâneos, diários e estatísticas (diárias, mensais, anuais).
- **Cobertura:** estações nos EUA.
- **Formatos:** JSON, WaterML e texto tabulado (RDB)†; o serviço de estações devolve texto tabulado e KML.
- **Acesso:** serviços web em <https://waterservices.usgs.gov/> (valores instantâneos, valores diários, estatísticas, estações e qualidade da água).
- **Observação:** o WaterServices será desligado em **22/02/2027**; o USGS orienta migrar para <https://api.waterdata.usgs.gov>. A página do NWIS bloqueou a consulta automática de hoje (erro 403).

### 22. OpenET

<https://openetdata.org> (redireciona para <https://etdata.org/>)

- **O que traz:** evapotranspiração estimada por satélite em escala de talhão, além de precipitação em grade e dados de condição da vegetação.
- **Resolução e período:** 30 m; diário, mensal e anual. Os exemplos são dos EUA; o site menciona expansão global e uma iniciativa OpenET Brasil.
- **Formatos:** não informados no site; exportação em CSV e GeoTIFF pela API†.
- **Acesso:** Data Explorer (seleção de área e download), API (uso automatizado; pede conta†), ferramenta FARMS para produtores e Google Earth Engine.

### 26. ERA5 (ECMWF)

<https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels?tab=overview>

- **O que traz:** reanálise global com estimativas horárias de variáveis de atmosfera, superfície terrestre e ondas: temperatura, precipitação, vento, umidade, temperatura do solo, radiação.
- **Resolução e período:** 0,25° na atmosfera; horário; de 1940 até hoje, atualizado diariamente com ~5 dias de atraso. Global.
- **Formatos:** GRIB; NetCDF como opção no download†.
- **Acesso:** formulário de download no Climate Data Store e API do CDS em Python†; exige conta gratuita†. Licença CC-BY.

## Estatísticas e mercado

### 9. USDA Ag Data Commons

<https://www.nal.usda.gov/services/agdatacommons>

- **O que traz:** catálogo e repositório de datasets de pesquisa financiada pelo USDA (solos, culturas, clima, manejo, fenologia, qualidade da água). Não é um dataset único.
- **Formatos:** dependem de cada dataset (CSV, planilhas, shapefile etc.)†.
- **Acesso:** portal de busca; ver e baixar não exige conta.

### 20. USDA AMS Market News

<https://www.ams.usda.gov/market-news>

- **O que traz:** preços de commodities, tendências de demanda e condições de mercado para culturas e pecuária (segundo a página do desafio). EUA.
- **Formatos:** relatórios publicados; JSON pela API MyMarketNews†.
- **Acesso:** portal de relatórios e API (<https://mymarketnews.ams.usda.gov/mymarketnews-api>), com cadastro gratuito e chave†.
- **Observação:** o site bloqueou a consulta automática de hoje (erro 403); nada além da descrição do desafio foi confirmado.

### 21. USDA NASS QuickStats

<https://quickstats.nass.usda.gov>

- **O que traz:** estatísticas agrícolas oficiais: produtividade, área plantada, produção, dados de censo e de pesquisas, por setor e commodity.
- **Resolução e período:** níveis nacional, estadual, distrito agrícola, condado, CEP e bacia hidrográfica; anos desde 1850 (com lacunas). EUA.
- **Formatos:** JSON, XML e CSV pela API; arquivos de texto tabulado para download em massa.
- **Acesso:** consulta web e API (<https://quickstats.nass.usda.gov/api>). A API exige chave gratuita enviada por e-mail e devolve no máximo 50.000 registros por pedido.

## Recursos de agências parceiras

### 25. Copernicus Sentinel-2 (ESA)

<https://dataspace.copernicus.eu>

- **O que traz:** imagem multiespectral com 13 bandas, incluindo red-edge, NIR e SWIR. Níveis L1C (refletância no topo da atmosfera) e L2A (refletância de superfície corrigida, com mapa de classificação de cena).
- **Resolução e período:** 4 bandas a 10 m, 6 a 20 m e 3 a 60 m. Revisita de 5 dias no equador com dois satélites (2–3 dias em latitudes médias). Global, desde 2015. Há mosaicos trimestrais sem nuvem a 10 m.
- **Formatos:** pacote SAFE com imagens JPEG2000†; COG nos mosaicos derivados.
- **Acesso:** Copernicus Browser (visualizar e baixar), catálogos STAC e OData, APIs openEO e Sentinel Hub, JupyterLab no próprio portal. Exige conta gratuita para os serviços.

*(O ERA5, também listado nesta seção da página, está no item 26, em Clima e água.)*
