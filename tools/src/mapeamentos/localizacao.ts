import { ErroFonte } from "../core/http";
import { resultado, type Local } from "../core/tipos";
import { buscarCep, cepParaLocal } from "../fontes/brasilapi";
import { buscarMalhaMunicipio, buscarMunicipio, buscarMunicipioPorNome, municipioPorCoordenada, centroideGeoJson } from "../fontes/ibge";

export interface EntradaLocal {
  cep?: string;
  lat?: number;
  lon?: number;
  ibge?: string;
  municipio?: string;
  uf?: string;
}

/**
 * Resolve qualquer forma de localização em um `Local` com coordenada e código IBGE.
 * Ordem de preferência: coordenada informada (talhão) → CEP com coordenada → centroide do município.
 */
export async function resolverLocal(e: EntradaLocal): Promise<Local> {
  let local: Partial<Local> = {};
  if (e.lat != null && e.lon != null) local = { lat: e.lat, lon: e.lon, precisao: "talhao" };

  if (e.cep) {
    const c = cepParaLocal(await buscarCep(e.cep));
    local = { ...c, ...local };
    if (local.lat == null && c.temCoordenada) local.precisao = "cep";
    if (c.temCoordenada && local.precisao !== "talhao") local.precisao = "cep";
    delete (local as any).temCoordenada;
  }

  if (!local.ibge && (e.ibge || (e.municipio && e.uf))) {
    const m = e.ibge ? await buscarMunicipio(e.ibge) : await buscarMunicipioPorNome(e.municipio!, e.uf!);
    if (!m) throw new ErroFonte("ibge", `município não encontrado: ${e.municipio}/${e.uf}`);
    local.ibge = String(m.id);
    local.municipio = m.nome;
    local.uf = m.microrregiao?.mesorregiao.UF.sigla ?? m["regiao-imediata"]?.["regiao-intermediaria"].UF.sigla;
  }

  // Só coordenada: descobre o município pelo polígono do IBGE (ZARC, PAM e DERAL precisam dele).
  if (!local.ibge && local.lat != null && local.lon != null) {
    const cod = await municipioPorCoordenada(local.lat, local.lon).catch(() => null);
    if (cod) {
      const m = await buscarMunicipio(cod).catch(() => null);
      local.ibge = cod;
      if (m) {
        local.municipio = m.nome;
        local.uf = m.microrregiao?.mesorregiao.UF.sigla ?? m["regiao-imediata"]?.["regiao-intermediaria"].UF.sigla;
      }
    }
  }

  if (local.lat == null && local.ibge) {
    const c = centroideGeoJson(await buscarMalhaMunicipio(local.ibge));
    if (c) Object.assign(local, c, { precisao: "municipio" });
  }

  if (local.lat == null || local.lon == null) throw new ErroFonte("localizacao", "não foi possível obter coordenadas; informe lat/lon, CEP ou município");
  return local as Local;
}

export async function localizar(e: EntradaLocal) {
  const local = await resolverLocal(e);
  const resumo = [
    `${local.municipio ?? "Local"}${local.uf ? `/${local.uf}` : ""} — lat ${local.lat.toFixed(4)}, lon ${local.lon.toFixed(4)} (precisão: ${local.precisao}); IBGE ${local.ibge ?? "?"}.`,
  ];
  const limitacoes =
    local.precisao === "talhao"
      ? []
      : ["A coordenada vem do CEP ou do município (em geral a área urbana). Para análises de solo, marcar o talhão no mapa é mais preciso."];
  return resultado("localizar", {
    local,
    resumo,
    dados: local,
    fontes: [
      { nome: "BrasilAPI CEP v2", url: "https://brasilapi.com.br/docs#tag/CEP-V2", tipo: "estatistica_oficial" },
      { nome: "IBGE Localidades/Malhas", url: "https://servicodados.ibge.gov.br/api/docs", tipo: "estatistica_oficial" },
    ],
    limitacoes,
  });
}
