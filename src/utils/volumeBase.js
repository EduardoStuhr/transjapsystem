import { calcVolumeComEmpolamento, normalizeFatorEmpolamento } from "./empolamento";

const toNum = (v, fallback = 0) => {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const textoEq = (eq = {}) =>
  `${eq.category || eq.categoria || ""} ${eq.name || eq.nome || eq.equipamento || ""}`.toLowerCase();

const isItemArea = (item = {}) => {
  const unit = String(item?.unit || "").toUpperCase();
  return unit === "M2" || unit === "M²";
};

export const isEscavadeiraVolume = (eq = {}) => textoEq(eq).includes("escavadeira");

export const isCaminhaoTransporteVolume = (eq = {}) => {
  const t = textoEq(eq);
  return t.includes("caminhão") || t.includes("caminhao") || t.includes("basculante") || t.includes("transporte");
};

export const isRoloVolume = (eq = {}) => {
  const t = textoEq(eq);
  return t.includes("rolo") || t.includes("compactador");
};

export const isPatrolVolume = (eq = {}) => {
  const t = textoEq(eq);
  return (
    t.includes("patrol") ||
    t.includes("motoniveladora") ||
    t.includes("moto niveladora") ||
    t.includes("moto-niveladora") ||
    t.includes("niveladora") ||
    t.includes("grader")
  );
};

export const isTratorGradeVolume = (eq = {}) => {
  const t = textoEq(eq);
  return t.includes("trator") || t.includes("grade");
};

export const isPipaVolume = (eq = {}) => {
  const t = textoEq(eq);
  return t.includes("pipa");
};

export const isEquipamentoAterroCompactacao = (eq = {}) =>
  isRoloVolume(eq) || isPatrolVolume(eq) || isTratorGradeVolume(eq) || isPipaVolume(eq);

export const getVolumesAterro = (item = {}, params = {}) => {
  const fatorPadrao = normalizeFatorEmpolamento(params?.fator_empolamento, 1.36);

  const volumeAterroInSitu = toNum(
    item.volumeAterroInSitu ?? item.volumeAterro ?? item.volumeCompactacao,
    0
  );

  const fatorEmpolamentoAterro = normalizeFatorEmpolamento(
    item.fatorEmpolamentoAterro ?? item.fatorEmpolamento ?? fatorPadrao,
    fatorPadrao
  );

  const volumeAterroEmpolado = calcVolumeComEmpolamento(
    volumeAterroInSitu,
    fatorEmpolamentoAterro
  );

  return {
    volumeAterroInSitu,
    fatorEmpolamentoAterro,
    volumeAterroEmpolado,
  };
};

export const getVolumeBasePorEquipamentoOuCategoria = ({ eq, item = {}, params = {}, volumes = {} }) => {
  const volumeInSitu = toNum(volumes.volumeInSitu ?? item.volumeInSitu ?? item.quantity, 0);
  const volumeEmpolado = toNum(volumes.volumeEmpolado, 0);
  const volumeTransporte = toNum(item.volumeTransporte, 0);

  const {
    volumeAterroInSitu,
    volumeAterroEmpolado,
    fatorEmpolamentoAterro,
  } = getVolumesAterro(item, params);

  const refPorCategoria = params?.volume_ref_total_por_categoria || {};
  const categoria = eq?.category || eq?.categoria || "";
  const refConfigurado = refPorCategoria[categoria];

  if (isItemArea(item)) {
    return {
      tipo: "area",
      valor: volumeInSitu,
      origem: "item.area",
      alerta: null,
      volumeAterroInSitu: 0,
      fatorEmpolamentoAterro: 0,
      volumeAterroEmpolado: 0,
    };
  }

  // 1. Overrides explícitos por categoria nos parâmetros
  if (refConfigurado === "aterro_empolado" && volumeAterroEmpolado > 0) {
    return {
      tipo: "aterro_empolado",
      valor: volumeAterroEmpolado,
      origem: "params.volume_ref_total_por_categoria",
      alerta: null,
      volumeAterroInSitu,
      fatorEmpolamentoAterro,
      volumeAterroEmpolado,
    };
  }

  if (refConfigurado === "aterro_in_situ" && volumeAterroInSitu > 0) {
    return {
      tipo: "aterro_in_situ",
      valor: volumeAterroInSitu,
      origem: "params.volume_ref_total_por_categoria",
      alerta: null,
      volumeAterroInSitu,
      fatorEmpolamentoAterro,
      volumeAterroEmpolado,
    };
  }

  if (refConfigurado === "empolado" && volumeEmpolado > 0) {
    return {
      tipo: "empolado",
      valor: volumeEmpolado,
      origem: "params.volume_ref_total_por_categoria",
      alerta: null,
      volumeAterroInSitu,
      fatorEmpolamentoAterro,
      volumeAterroEmpolado,
    };
  }

  if (refConfigurado === "transporte" && (volumeTransporte > 0 || volumeEmpolado > 0)) {
    return {
      tipo: volumeTransporte > 0 ? "transporte" : "empolado",
      valor: volumeTransporte > 0 ? volumeTransporte : volumeEmpolado,
      origem: volumeTransporte > 0 ? "item.volumeTransporte" : "volumes.volumeEmpolado",
      alerta: null,
      volumeAterroInSitu,
      fatorEmpolamentoAterro,
      volumeAterroEmpolado,
    };
  }

  // 2. Regra por tipo de equipamento (Aterro/Compactação)
  if (isEquipamentoAterroCompactacao(eq)) {
    if (volumeAterroInSitu > 0) {
      return {
        tipo: "aterro_in_situ",
        valor: volumeAterroInSitu,
        origem: "item.volumeAterroInSitu",
        alerta: null,
        volumeAterroInSitu,
        fatorEmpolamentoAterro,
        volumeAterroEmpolado,
      };
    }

    return {
      tipo: "in_situ_fallback",
      valor: volumeInSitu,
      origem: "fallback volumes.volumeInSitu",
      alerta: "Volume de aterro/compactação não informado; usando volume in situ como fallback.",
      volumeAterroInSitu,
      fatorEmpolamentoAterro,
      volumeAterroEmpolado,
    };
  }

  // 3. Regra por tipo de equipamento (Transporte)
  if (isCaminhaoTransporteVolume(eq)) {
    if (volumeTransporte > 0) {
      return {
        tipo: "transporte",
        valor: volumeTransporte,
        origem: "item.volumeTransporte",
        alerta: null,
        volumeAterroInSitu,
        fatorEmpolamentoAterro,
        volumeAterroEmpolado,
      };
    }

    if (volumeEmpolado > 0) {
      return {
        tipo: "empolado",
        valor: volumeEmpolado,
        origem: "volumes.volumeEmpolado",
        alerta: null,
        volumeAterroInSitu,
        fatorEmpolamentoAterro,
        volumeAterroEmpolado,
      };
    }
  }

  // 4. Default (Escavação/Carga in situ)
  return {
    tipo: "in_situ",
    valor: volumeInSitu,
    origem: isEscavadeiraVolume(eq) ? "escavacao/carga in situ" : "volumes.volumeInSitu",
    alerta: null,
    volumeAterroInSitu,
    fatorEmpolamentoAterro,
    volumeAterroEmpolado,
  };
};
